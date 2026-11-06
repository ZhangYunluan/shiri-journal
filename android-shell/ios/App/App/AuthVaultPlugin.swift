import Foundation
import Security
import Capacitor

/// Same contract as Android's vault; never included in journal exports or logs.
@objc(AuthVaultPlugin)
public final class AuthVaultPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AuthVaultPlugin"
    public let jsName = "AuthVault"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]
    private let queue = DispatchQueue(label: "cn.shiri.auth-vault")
    private let marker = "shiri-auth-vault-install-v1"
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: (Bundle.main.bundleIdentifier ?? "cn.shiri.life") + ".cloudbase-session-v1",
         kSecAttrAccount as String: "current", kSecAttrSynchronizable as String: false]
    }
    private func prepareInstallation() throws {
        // Keychain may survive uninstall. A new installation must explicitly log in.
        if !UserDefaults.standard.bool(forKey: marker) {
            let result = SecItemDelete(query as CFDictionary)
            guard result == errSecSuccess || result == errSecItemNotFound else { throw VaultError.storage }
            UserDefaults.standard.set(true, forKey: marker)
        }
    }
    private enum VaultError: Error { case storage }

    @objc public func get(_ call: CAPPluginCall) {
        queue.async {
            do {
                try self.prepareInstallation()
                var q = self.query
                q[kSecReturnData as String] = true
                q[kSecMatchLimit as String] = kSecMatchLimitOne
                var result: CFTypeRef?
                let status = SecItemCopyMatching(q as CFDictionary, &result)
                if status == errSecItemNotFound { call.resolve(["value": NSNull()]); return }
                guard status == errSecSuccess, let data = result as? Data,
                      data.count <= 16_384, let value = String(data: data, encoding: .utf8) else { throw VaultError.storage }
                call.resolve(["value": value])
            } catch { call.reject("登录凭据暂时无法读取，请解锁设备后重试；本地记录不受影响。") }
        }
    }

    @objc public func set(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), let data = value.data(using: .utf8), data.count <= 16_384 else {
            call.reject("登录凭据格式或长度无效。"); return
        }
        queue.async {
            do {
                try self.prepareInstallation()
                let attributes: [String: Any] = [kSecValueData as String: data,
                    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
                var status = SecItemUpdate(self.query as CFDictionary, attributes as CFDictionary)
                if status == errSecItemNotFound {
                    var item = self.query
                    attributes.forEach { item[$0.key] = $0.value }
                    status = SecItemAdd(item as CFDictionary, nil)
                }
                guard status == errSecSuccess else { throw VaultError.storage }
                call.resolve(["ok": true])
            } catch { call.reject("安全保存登录凭据失败，请重试。") }
        }
    }

    @objc public func clear(_ call: CAPPluginCall) {
        queue.async {
            do {
                try self.prepareInstallation()
                let status = SecItemDelete(self.query as CFDictionary)
                guard status == errSecSuccess || status == errSecItemNotFound else { throw VaultError.storage }
                call.resolve(["ok": true])
            } catch { call.reject("清除登录凭据失败，请重试。") }
        }
    }
}
