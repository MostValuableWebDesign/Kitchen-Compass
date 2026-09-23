import ARKit
import ExpoModulesCore

public class SpaceScanModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SpaceScan")

    Function("isSupported") { () -> Bool in
      ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
    }

    AsyncFunction("startScan") { (promise: Promise) in
      guard ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh),
            let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.resolve(nil)
        return
      }
      let controller = SpaceScanCaptureController { result in promise.resolve(result) }
      controller.modalPresentationStyle = .fullScreen
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)

    AsyncFunction("openModel") { (uri: String) -> Bool in
      guard let presenter = self.appContext?.utilities?.currentViewController(),
            let url = SpaceScanFiles.validModelURL(uri) else { return false }
      let controller = SpaceScanModelController(modelURL: url)
      controller.modalPresentationStyle = .fullScreen
      presenter.present(controller, animated: true)
      return true
    }.runOnQueue(.main)
  }
}
