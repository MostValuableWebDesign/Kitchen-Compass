import ARKit
import Metal
import SceneKit
import UIKit
import simd

enum SpaceScanFiles {
  static let modelPrefix = "kitchen-compass-space-"

  static func validModelURL(_ uri: String) -> URL? {
    guard let url = URL(string: uri), url.isFileURL,
          url.lastPathComponent.hasPrefix(modelPrefix), url.pathExtension == "obj",
          FileManager.default.fileExists(atPath: url.path) else { return nil }
    let cache = FileManager.default.temporaryDirectory.standardizedFileURL.path
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].standardizedFileURL.path
    let path = url.standardizedFileURL.path
    return path.hasPrefix(cache + "/") || path.hasPrefix(documents + "/") ? url : nil
  }
}

final class SpaceScanCaptureController: UIViewController {
  private let sceneView = ARSCNView(frame: .zero)
  private let countLabel = UILabel()
  private let hintLabel = UILabel()
  private let captureButton = UIButton(type: .system)
  private var timer: Timer?
  private var photoURLs: [URL] = []
  private var lastCameraTransform: simd_float4x4?
  private var lastCaptureTime = Date.distantPast
  private var completed = false
  private let completion: ([String: Any]?) -> Void
  private let photoLimit = 10

  init(completion: @escaping ([String: Any]?) -> Void) {
    self.completion = completion
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    sceneView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(sceneView)
    NSLayoutConstraint.activate([
      sceneView.topAnchor.constraint(equalTo: view.topAnchor),
      sceneView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      sceneView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      sceneView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    ])

    let top = UIStackView()
    top.axis = .horizontal
    top.distribution = .equalSpacing
    top.alignment = .center
    top.translatesAutoresizingMaskIntoConstraints = false
    let cancel = button("Cancel", action: #selector(cancelScan))
    top.addArrangedSubview(cancel)
    countLabel.text = "0 / 10 views"
    countLabel.textColor = .white
    countLabel.font = .boldSystemFont(ofSize: 16)
    top.addArrangedSubview(countLabel)
    view.addSubview(top)
    NSLayoutConstraint.activate([
      top.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
      top.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
      top.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
    ])

    let bottom = UIStackView()
    bottom.axis = .vertical
    bottom.spacing = 12
    bottom.translatesAutoresizingMaskIntoConstraints = false
    hintLabel.text = "Open the space and slowly move around each shelf. Views capture as you move; tap Capture view for a hidden corner."
    hintLabel.textColor = .white
    hintLabel.font = .systemFont(ofSize: 14)
    hintLabel.numberOfLines = 0
    hintLabel.textAlignment = .center
    bottom.addArrangedSubview(hintLabel)
    captureButton.setTitle("Capture view", for: .normal)
    captureButton.setTitleColor(.white, for: .normal)
    captureButton.backgroundColor = UIColor.black.withAlphaComponent(0.65)
    captureButton.layer.cornerRadius = 12
    captureButton.addTarget(self, action: #selector(manualCapture), for: .touchUpInside)
    bottom.addArrangedSubview(captureButton)
    bottom.addArrangedSubview(button("Finish 3D scan", action: #selector(finishScan)))
    view.addSubview(bottom)
    NSLayoutConstraint.activate([
      bottom.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
      bottom.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
      bottom.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
      captureButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
    ])
  }

  private func button(_ title: String, action: Selector) -> UIButton {
    let result = UIButton(type: .system)
    result.setTitle(title, for: .normal)
    result.setTitleColor(.white, for: .normal)
    result.backgroundColor = UIColor.black.withAlphaComponent(0.65)
    result.layer.cornerRadius = 12
    result.addTarget(self, action: action, for: .touchUpInside)
    result.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    return result
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !completed, timer == nil else { return }
    let configuration = ARWorldTrackingConfiguration()
    configuration.sceneReconstruction = .mesh
    configuration.environmentTexturing = .automatic
    sceneView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    timer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
      self?.captureView(force: false)
    }
  }

  private func captureView(force: Bool) {
    guard !completed, photoURLs.count < photoLimit,
          let frame = sceneView.session.currentFrame else { return }
    guard case .normal = frame.camera.trackingState else {
      hintLabel.text = "Move slowly in better light until tracking is ready."
      return
    }
    let transform = frame.camera.transform
    if !force {
      guard Date().timeIntervalSince(lastCaptureTime) >= 2 else { return }
      if let last = lastCameraTransform {
        let previous = SIMD3<Float>(last.columns.3.x, last.columns.3.y, last.columns.3.z)
        let position = SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
        let oldForward = SIMD3<Float>(last.columns.2.x, last.columns.2.y, last.columns.2.z)
        let forward = SIMD3<Float>(transform.columns.2.x, transform.columns.2.y, transform.columns.2.z)
        guard simd_length(position - previous) > 0.18 || simd_dot(oldForward, forward) < 0.94 else { return }
      }
    }
    guard let data = sceneView.snapshot().jpegData(compressionQuality: 0.76) else { return }
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("kitchen-compass-space-view-\(UUID().uuidString).jpg")
    do {
      try data.write(to: url, options: .atomic)
      photoURLs.append(url)
      lastCameraTransform = transform
      lastCaptureTime = Date()
      countLabel.text = "\(photoURLs.count) / \(photoLimit) views"
      hintLabel.text = photoURLs.count == photoLimit
        ? "All 10 views captured. Keep moving to finish the mesh, then tap Finish."
        : "Move to another angle or open drawer. Hidden items cannot be scanned."
      captureButton.isEnabled = photoURLs.count < photoLimit
    } catch { showMessage("View could not be saved. Try again.") }
  }

  @objc private func manualCapture() { captureView(force: true) }

  @objc private func cancelScan() {
    guard !completed else { return }
    completed = true
    stopSession()
    photoURLs.forEach { try? FileManager.default.removeItem(at: $0) }
    dismiss(animated: true) { self.completion(nil) }
  }

  @objc private func finishScan() {
    guard !completed else { return }
    guard photoURLs.count >= 3 else {
      showMessage("Capture at least three views before finishing.")
      return
    }
    guard let anchors = sceneView.session.currentFrame?.anchors.compactMap({ $0 as? ARMeshAnchor }), !anchors.isEmpty else {
      showMessage("No 3D surface yet. Move around the open space in better light.")
      return
    }
    do {
      let modelURL = try exportMesh(anchors)
      completed = true
      stopSession()
      let photos = photoURLs.map { url -> [String: Any] in
        let size = UIImage(contentsOfFile: url.path)?.size ?? .zero
        return ["uri": url.absoluteString, "width": size.width, "height": size.height]
      }
      dismiss(animated: true) {
        self.completion(["modelUri": modelURL.absoluteString, "photos": photos])
      }
    } catch { showMessage("The 3D model could not be saved. Try scanning again.") }
  }

  private func stopSession() {
    timer?.invalidate()
    timer = nil
    sceneView.session.pause()
  }

  private func showMessage(_ text: String) {
    let alert = UIAlertController(title: "Space scan", message: text, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "OK", style: .default))
    present(alert, animated: true)
  }

  private func exportMesh(_ anchors: [ARMeshAnchor]) throws -> URL {
    var lines = ["# Kitchen Compass LiDAR surface mesh", "o StorageSpace"]
    var vertexOffset = 1
    var totalFaces = 0
    for anchor in anchors {
      let vertices = anchor.geometry.vertices
      guard vertices.format == .float3 else { continue }
      for index in 0..<vertices.count {
        let pointer = vertices.buffer.contents().advanced(by: vertices.offset + vertices.stride * index)
        let local = pointer.assumingMemoryBound(to: SIMD3<Float>.self).pointee
        let world = anchor.transform * SIMD4<Float>(local.x, local.y, local.z, 1)
        lines.append("v \(world.x) \(world.y) \(world.z)")
      }
      let faces = anchor.geometry.faces
      let count = min(faces.count, max(0, 200_000 - totalFaces))
      for face in 0..<count {
        var indices: [Int] = []
        for corner in 0..<faces.indexCountPerPrimitive {
          let pointer = faces.buffer.contents().advanced(by: (face * faces.indexCountPerPrimitive + corner) * faces.bytesPerIndex)
          let index = faces.bytesPerIndex == 2 ? Int(pointer.load(as: UInt16.self)) : Int(pointer.load(as: UInt32.self))
          indices.append(index + vertexOffset)
        }
        if indices.count == 3 { lines.append("f \(indices[0]) \(indices[1]) \(indices[2])") }
      }
      vertexOffset += vertices.count
      totalFaces += count
      if totalFaces >= 200_000 { break }
    }
    guard totalFaces > 0 else { throw NSError(domain: "SpaceScan", code: 1) }
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(SpaceScanFiles.modelPrefix)\(UUID().uuidString).obj")
    try lines.joined(separator: "\n").write(to: url, atomically: true, encoding: .utf8)
    return url
  }
}
