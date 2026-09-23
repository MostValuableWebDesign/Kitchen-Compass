import ModelIO
import SceneKit
import SceneKit.ModelIO
import UIKit

final class SpaceScanModelController: UIViewController {
  private let modelURL: URL

  init(modelURL: URL) {
    self.modelURL = modelURL
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    let sceneView = SCNView(frame: .zero)
    sceneView.translatesAutoresizingMaskIntoConstraints = false
    sceneView.backgroundColor = UIColor(red: 0.08, green: 0.10, blue: 0.12, alpha: 1)
    sceneView.allowsCameraControl = true
    sceneView.autoenablesDefaultLighting = true
    let scene = SCNScene(mdlAsset: MDLAsset(url: modelURL))
    sceneView.scene = scene
    view.addSubview(sceneView)
    NSLayoutConstraint.activate([
      sceneView.topAnchor.constraint(equalTo: view.topAnchor),
      sceneView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      sceneView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      sceneView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    ])
    let (minimum, maximum) = scene.rootNode.boundingBox
    let center = SCNVector3((minimum.x + maximum.x) / 2, (minimum.y + maximum.y) / 2, (minimum.z + maximum.z) / 2)
    let extent = max(maximum.x - minimum.x, max(maximum.y - minimum.y, maximum.z - minimum.z))
    let cameraNode = SCNNode()
    cameraNode.camera = SCNCamera()
    cameraNode.camera?.zFar = max(100, Double(extent * 10))
    cameraNode.position = SCNVector3(center.x, center.y, center.z + max(extent * 2.5, 0.5))
    scene.rootNode.addChildNode(cameraNode)
    sceneView.pointOfView = cameraNode
    let close = UIButton(type: .system)
    close.translatesAutoresizingMaskIntoConstraints = false
    close.setTitle("Close", for: .normal)
    close.setTitleColor(.white, for: .normal)
    close.backgroundColor = UIColor.black.withAlphaComponent(0.7)
    close.layer.cornerRadius = 12
    close.addTarget(self, action: #selector(closeViewer), for: .touchUpInside)
    view.addSubview(close)
    NSLayoutConstraint.activate([
      close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
      close.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
      close.widthAnchor.constraint(greaterThanOrEqualToConstant: 80),
      close.heightAnchor.constraint(equalToConstant: 44),
    ])
  }

  @objc private func closeViewer() { dismiss(animated: true) }
}
