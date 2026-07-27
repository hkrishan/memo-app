import CoreImage
import ExpoModulesCore
import Metal
import MetalKit
import UIKit

/**
 * The React view: a Metal surface that draws whatever the compositor last
 * produced.
 *
 * It renders the composited buffer rather than hosting two
 * AVCaptureVideoPreviewLayers, which is what makes the preview honest —
 * the pixels on screen are the same pixels that get written to the photo
 * or the movie, PiP corner radius and all.
 */
final class DualCameraPreviewView: ExpoView, DualCameraControllerDelegate {
  let onPreviewStarted = EventDispatcher()
  let onError = EventDispatcher()
  let onTapPane = EventDispatcher()

  private let metalView: MTKView
  private let ciContext: CIContext
  private let commandQueue: MTLCommandQueue?

  /// Latest composited frame, handed over from the capture queue.
  private var pendingBuffer: CVPixelBuffer?
  private let bufferLock = NSLock()
  /// Set while a draw is already queued, so a slow main thread drops
  /// frames instead of building a backlog of stale ones.
  private var drawScheduled = false

  private var isActive = false

  required init(appContext: AppContext? = nil) {
    let device = MTLCreateSystemDefaultDevice()
    metalView = MTKView(frame: .zero, device: device)
    commandQueue = device?.makeCommandQueue()
    ciContext =
      device.map {
        CIContext(mtlDevice: $0, options: [.cacheIntermediates: false])
      } ?? CIContext(options: [.cacheIntermediates: false])

    super.init(appContext: appContext)

    backgroundColor = .black
    // Driven frame-by-frame off the capture callback — no display-link
    // polling, so no redraws when nothing changed.
    metalView.isPaused = true
    metalView.enableSetNeedsDisplay = false
    // CIContext renders into the drawable's texture, which needs it
    // readable/writable.
    metalView.framebufferOnly = false
    metalView.backgroundColor = .black
    metalView.contentMode = .scaleAspectFill
    metalView.delegate = self
    metalView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    metalView.frame = bounds
    addSubview(metalView)

    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    addGestureRecognizer(tap)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    metalView.frame = bounds
  }

  // ---------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------

  func setActive(_ active: Bool) {
    guard active != isActive else { return }
    isActive = active
    let controller = DualCameraController.shared
    if active {
      controller.delegate = self
      controller.start()
    } else {
      if controller.delegate === self { controller.delegate = nil }
      controller.stop()
      bufferLock.lock()
      pendingBuffer = nil
      bufferLock.unlock()
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    // Navigating away (or an unmount) must release the cameras — nothing
    // else in the app can open them while this session holds them.
    if window == nil, isActive {
      setActive(false)
    }
  }

  // ---------------------------------------------------------------------
  // Tap → swap panes
  // ---------------------------------------------------------------------

  @objc private func handleTap(_ recognizer: UITapGestureRecognizer) {
    let point = recognizer.location(in: self)
    let canvas = DualCameraController.shared.canvasSize
    guard canvas.width > 0, canvas.height > 0, bounds.width > 0 else { return }

    // Same aspect-fill mapping the renderer uses, inverted.
    let scale = max(bounds.width / canvas.width, bounds.height / canvas.height)
    let drawn = CGSize(width: canvas.width * scale, height: canvas.height * scale)
    let originX = (bounds.width - drawn.width) / 2
    let originY = (bounds.height - drawn.height) / 2
    let canvasPoint = CGPoint(
      x: (point.x - originX) / scale,
      y: (point.y - originY) / scale
    )

    let geometry = DualCameraController.shared.geometry()
    // Secondary first: in the PiP layout it sits inside the main rect, and
    // tapping it is the gesture that promotes it.
    let pane: String
    if geometry.secondary.contains(canvasPoint) {
      pane = "secondary"
    } else if geometry.main.contains(canvasPoint) {
      pane = "main"
    } else {
      return
    }
    onTapPane(["pane": pane])
  }

  // ---------------------------------------------------------------------
  // DualCameraControllerDelegate — called on the capture queue
  // ---------------------------------------------------------------------

  func dualCamera(didCompose buffer: CVPixelBuffer) {
    bufferLock.lock()
    pendingBuffer = buffer
    let alreadyScheduled = drawScheduled
    drawScheduled = true
    bufferLock.unlock()
    guard !alreadyScheduled else { return }

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.bufferLock.lock()
      self.drawScheduled = false
      self.bufferLock.unlock()
      self.metalView.draw()
    }
  }

  func dualCameraDidStartPreview() {
    onPreviewStarted()
  }

  func dualCamera(didFail message: String) {
    onError(["message": message])
  }
}

extension DualCameraPreviewView: MTKViewDelegate {
  func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

  func draw(in view: MTKView) {
    bufferLock.lock()
    let buffer = pendingBuffer
    bufferLock.unlock()

    guard let buffer,
      let drawable = view.currentDrawable,
      let commandQueue,
      let commandBuffer = commandQueue.makeCommandBuffer()
    else {
      return
    }

    let target = CGSize(
      width: drawable.texture.width,
      height: drawable.texture.height
    )
    var image = CIImage(cvPixelBuffer: buffer)
    let extent = image.extent
    guard extent.width > 0, extent.height > 0 else { return }

    // Aspect-fill into the drawable. The canvas is already screen-shaped,
    // so in practice this is a straight scale with nothing cropped — the
    // max() is only insurance for odd container sizes.
    let scale = max(target.width / extent.width, target.height / extent.height)
    image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    image = image.transformed(
      by: CGAffineTransform(
        translationX: (target.width - image.extent.width) / 2 - image.extent.minX,
        y: (target.height - image.extent.height) / 2 - image.extent.minY
      )
    )

    ciContext.render(
      image,
      to: drawable.texture,
      commandBuffer: commandBuffer,
      bounds: CGRect(origin: .zero, size: target),
      colorSpace: CGColorSpaceCreateDeviceRGB()
    )
    commandBuffer.present(drawable)
    commandBuffer.commit()
  }
}
