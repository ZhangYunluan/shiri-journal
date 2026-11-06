import Foundation
import Photos
import PhotosUI
import ImageIO
import UniformTypeIdentifiers
import Capacitor

/// Explicit selection only. No library-wide permission, scan, upload or source deletion.
@objc(ShiriPhotoPickerPlugin)
public final class ShiriPhotoPickerPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    public let identifier = "ShiriPhotoPickerPlugin"
    public let jsName = "ShiriPhotoPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cleanup", returnType: CAPPluginReturnPromise)
    ]
    private let queue = DispatchQueue(label: "cn.shiri.selected-photos", qos: .userInitiated)
    private let maxBytes = 20 * 1024 * 1024
    private let maxBatchBytes = 200 * 1024 * 1024
    // Accessed only on the main queue. Each key identifies a directory we created.
    private var pending: CAPPluginCall?
    private var batches: [String: URL] = [:]
    private var selectionLimit = 50
    private enum PhotoError: Error { case unsupported, tooLarge, invalid, write }

    @objc public func pick(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pending == nil else { call.reject("请先完成当前照片选择。"); return }
            guard let presenter = self.bridge?.viewController,
                  presenter.presentedViewController == nil else { call.reject("请关闭当前系统窗口后重试。"); return }
            self.selectionLimit = min(50, max(1, call.getInt("limit") ?? 50))
            var configuration = PHPickerConfiguration(photoLibrary: .shared())
            configuration.filter = .images
            configuration.selectionLimit = self.selectionLimit
            configuration.preferredAssetRepresentationMode = .current
            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            picker.modalPresentationStyle = .fullScreen
            self.pending = call
            self.bridge?.saveCall(call)
            presenter.present(picker, animated: true)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pending else { return }
        if results.isEmpty {
            finish(call, ["photos": [], "cancelled": true, "failedCount": 0])
            return
        }
        let chosen = Array(results.prefix(selectionLimit))
        queue.async {
            do {
                let cache = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                let selectionId = UUID().uuidString.lowercased()
                let directory = cache.appendingPathComponent("shiri-photo-picker", isDirectory: true).appendingPathComponent(selectionId, isDirectory: true)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                    attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
                self.load(chosen, index: 0, directory: directory, photos: [], failures: results.count - chosen.count, bytes: 0) { photos, failures in
                    DispatchQueue.main.async {
                        self.batches[selectionId] = directory
                        self.finish(call, ["selectionId": selectionId, "photos": photos, "cancelled": false, "failedCount": failures])
                    }
                }
            } catch {
                DispatchQueue.main.async { self.pending = nil; call.reject("无法准备照片缓存，请检查本机剩余空间后重试。"); self.bridge?.releaseCall(call) }
            }
        }
    }

    private func finish(_ call: CAPPluginCall, _ data: [String: Any]) {
        pending = nil
        call.resolve(data)
        bridge?.releaseCall(call)
    }

    // One representation at a time. Provider temporary URLs expire when their callback returns.
    private func load(_ results: [PHPickerResult], index: Int, directory: URL,
                      photos: [[String: Any]], failures: Int, bytes: Int,
                      completion: @escaping ([[String: Any]], Int) -> Void) {
        guard index < results.count else { completion(photos, failures); return }
        guard bytes < maxBatchBytes else { completion(photos, failures + results.count - index); return }
        let result = results[index]
        let provider = result.itemProvider
        guard let identifier = provider.registeredTypeIdentifiers.first(where: { UTType($0)?.conforms(to: .image) == true }) else {
            load(results, index: index + 1, directory: directory, photos: photos, failures: failures + 1, bytes: bytes, completion: completion); return
        }
        provider.loadFileRepresentation(forTypeIdentifier: identifier) { temporary, error in
            let staging = directory.appendingPathComponent(UUID().uuidString + ".source")
            var copied = false
            if error == nil, let temporary = temporary {
                do {
                    let values = try temporary.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                    guard values.isRegularFile == true, let size = values.fileSize, size > 0, size <= self.maxBytes else { throw PhotoError.tooLarge }
                    try FileManager.default.copyItem(at: temporary, to: staging)
                    copied = true
                } catch { /* Failure is counted without exposing paths or image content. */ }
            }
            let ready = copied
            self.queue.async {
                var nextPhotos = photos
                var nextFailures = failures
                var nextBytes = bytes
                if ready {
                    do {
                        let image = try autoreleasepool { try self.prepare(staging, in: directory) }
                        let imageBytes = try image.url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? self.maxBytes
                        guard bytes + imageBytes <= self.maxBatchBytes else {
                            try? FileManager.default.removeItem(at: image.url); throw PhotoError.tooLarge
                        }
                        let suggested = (provider.suggestedName ?? "照片").components(separatedBy: .controlCharacters).joined()
                        let base = ((suggested as NSString).lastPathComponent as NSString).deletingPathExtension
                        let displayName = String((base.isEmpty ? "照片" : base).prefix(180)) + "." + image.url.pathExtension
                        var photo: [String: Any] = ["path": image.url.absoluteString,
                            "name": displayName, "type": image.mime, "converted": image.converted]
                        // Selection alone does not grant whole-library access. Never prompt here.
                        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
                        if (status == .authorized || status == .limited), let id = result.assetIdentifier,
                           let date = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject?.creationDate {
                            photo["taken"] = date.timeIntervalSince1970 * 1000
                        }
                        nextPhotos.append(photo)
                        nextBytes += imageBytes
                    } catch { nextFailures += 1 }
                } else { nextFailures += 1 }
                // Only our temporary copy, never the system's original URL.
                try? FileManager.default.removeItem(at: staging)
                self.load(results, index: index + 1, directory: directory, photos: nextPhotos,
                          failures: nextFailures, bytes: nextBytes, completion: completion)
            }
        }
    }

    private func prepare(_ source: URL, in directory: URL) throws -> (url: URL, mime: String, converted: Bool) {
        guard let image = CGImageSourceCreateWithURL(source as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
              let typeName = CGImageSourceGetType(image), let type = UTType(typeName as String) else { throw PhotoError.invalid }
        let formats: [(UTType, String, String)] = [(.jpeg, "jpg", "image/jpeg"), (.png, "png", "image/png"),
            (.gif, "gif", "image/gif"), (.webP, "webp", "image/webp")]
        if let format = formats.first(where: { type.conforms(to: $0.0) }) {
            let target = directory.appendingPathComponent(UUID().uuidString + "." + format.1)
            try FileManager.default.moveItem(at: source, to: target)
            return (target, format.2, false)
        }
        guard type.conforms(to: .heic) || type.conforms(to: .heif) else { throw PhotoError.unsupported }
        let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 4096,
            kCGImageSourceShouldCacheImmediately: false]
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(image, 0, options as CFDictionary) else { throw PhotoError.invalid }
        let target = directory.appendingPathComponent(UUID().uuidString + ".jpg")
        guard let destination = CGImageDestinationCreateWithURL(target as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { throw PhotoError.write }
        // Derivative JPEG; retain no precise location or other EXIF metadata in this conversion.
        CGImageDestinationAddImage(destination, thumbnail, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
        guard CGImageDestinationFinalize(destination),
              let bytes = try target.resourceValues(forKeys: [.fileSizeKey]).fileSize, bytes <= maxBytes else {
            try? FileManager.default.removeItem(at: target); throw PhotoError.write
        }
        return (target, "image/jpeg", true)
    }

    @objc public func cleanup(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = call.getString("selectionId"), UUID(uuidString: id) != nil,
                  let directory = self.batches.removeValue(forKey: id) else {
                call.reject("照片缓存批次无效；不会删除其他文件。"); return
            }
            self.queue.async {
                do {
                    // Directory came only from pick(), not from a JavaScript-supplied file path.
                    if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
                    call.resolve(["ok": true])
                } catch {
                    DispatchQueue.main.async { self.batches[id] = directory }
                    call.reject("临时照片缓存未清理，可稍后重试；系统相册原图不受影响。")
                }
            }
        }
    }
}
