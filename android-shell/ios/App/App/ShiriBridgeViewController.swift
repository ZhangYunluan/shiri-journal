import Capacitor

final class ShiriBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AuthVaultPlugin())
        bridge?.registerPluginInstance(ShiriPhotoPickerPlugin())
    }
}
