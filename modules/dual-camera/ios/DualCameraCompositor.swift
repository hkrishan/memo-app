import AVFoundation
import CoreImage
import UIKit

/**
 * Layout of the two live camera panes, mirroring Snapchat's dual camera.
 *
 * "main" is the primary pane, "secondary" the other one; which physical
 * camera fills which is decided by the controller's `swapped` flag, so a
 * layout is pure geometry.
 */
enum DualCameraLayout: String {
  /// Secondary floats as a rounded inset over a full-bleed main pane.
  case pip
  /// Main on top, secondary below.
  case vertical
  /// Main on the left, secondary on the right — the side-by-side split.
  case horizontal
}

/// Where each pane lands on the output canvas, in UIKit coordinates
/// (origin top-left).
struct DualCameraGeometry {
  let main: CGRect
  let secondary: CGRect
  let cornerRadius: CGFloat
  /// PiP: the secondary is drawn ON TOP of a full-bleed main.
  let overlaps: Bool
  /// Split layouts: the panes keep the camera's aspect ratio, so they don't
  /// reach the canvas edges — the leftover is filled with a blurred backdrop.
  let letterboxed: Bool
}

/**
 * Turns the two camera streams into ONE frame.
 *
 * Everything downstream — the Metal preview, the JPEG written by
 * capturePhoto, and every frame handed to the recorder — reads that single
 * composited buffer, so the preview is literally what gets saved.
 *
 * The canvas is portrait and matches the SCREEN's aspect ratio (not the
 * sensor's), so the fullscreen preview shows the canvas 1:1 with no
 * cover-crop.
 *
 * Not thread-safe on its own — the controller only ever calls it from its
 * serial data queue.
 */
final class DualCameraCompositor {
  /// Output canvas in pixels (portrait, screen-shaped, even dimensions).
  let canvasSize: CGSize

  /// Width/height of ONE upright camera frame (≈0.5625 for a 16:9 sensor).
  /// Split layouts size their panes from this so nothing gets cropped.
  let sourceAspect: CGFloat

  private let context: CIContext
  private var pool: CVPixelBufferPool?

  var layout: DualCameraLayout = .horizontal
  var swapped: Bool = false

  /// Rounded-corner mask + border stroke for the PiP pane, rebuilt only
  /// when the geometry actually changes.
  private var cachedMask: (rect: CGRect, radius: CGFloat, mask: CIImage, border: CIImage)?

  private let black: CIImage

  init(canvasSize: CGSize, sourceAspect: CGFloat, context: CIContext) {
    self.canvasSize = canvasSize
    self.sourceAspect = sourceAspect > 0 ? sourceAspect : 9.0 / 16.0
    self.context = context
    self.black = CIImage(color: CIColor.black)
    createPool()
  }

  var geometry: DualCameraGeometry {
    Self.geometry(for: layout, canvas: canvasSize, sourceAspect: sourceAspect)
  }

  static func geometry(
    for layout: DualCameraLayout,
    canvas: CGSize,
    sourceAspect: CGFloat
  ) -> DualCameraGeometry {
    let aspect = sourceAspect > 0 ? sourceAspect : 9.0 / 16.0

    switch layout {
    case .pip:
      // A deliberate small window — cropping to 3:4 here is a design
      // choice, not an accident, so it stays a comfortable size.
      let width = canvas.width * 0.30
      let height = width * 4 / 3
      let margin = canvas.width * 0.045
      return DualCameraGeometry(
        main: CGRect(origin: .zero, size: canvas),
        secondary: CGRect(
          x: margin,
          y: canvas.height * 0.10,
          width: width,
          height: height
        ),
        cornerRadius: canvas.width * 0.05,
        overlaps: true,
        letterboxed: false
      )

    case .horizontal:
      // Each pane gets half the width and keeps the camera's own aspect
      // ratio, so the full frame survives. Squeezing a 9:16 frame into a
      // half-width full-height slot would throw away most of it.
      let slotWidth = (canvas.width / 2).rounded()
      let paneWidth = min(slotWidth, canvas.height * aspect).rounded()
      let paneHeight = (paneWidth / aspect).rounded()
      let insetX = ((slotWidth - paneWidth) / 2).rounded()
      let originY = ((canvas.height - paneHeight) / 2).rounded()
      return DualCameraGeometry(
        main: CGRect(x: insetX, y: originY, width: paneWidth, height: paneHeight),
        secondary: CGRect(
          x: slotWidth + insetX,
          y: originY,
          width: paneWidth,
          height: paneHeight
        ),
        cornerRadius: 0,
        overlaps: false,
        letterboxed: true
      )

    case .vertical:
      let slotHeight = (canvas.height / 2).rounded()
      let paneHeight = min(slotHeight, canvas.width / aspect).rounded()
      let paneWidth = (paneHeight * aspect).rounded()
      let originX = ((canvas.width - paneWidth) / 2).rounded()
      let insetY = ((slotHeight - paneHeight) / 2).rounded()
      return DualCameraGeometry(
        main: CGRect(x: originX, y: insetY, width: paneWidth, height: paneHeight),
        secondary: CGRect(
          x: originX,
          y: slotHeight + insetY,
          width: paneWidth,
          height: paneHeight
        ),
        cornerRadius: 0,
        overlaps: false,
        letterboxed: true
      )
    }
  }

  // ---------------------------------------------------------------------
  // Compositing
  // ---------------------------------------------------------------------

  /**
   * Composite one back + one front frame into a freshly pooled buffer.
   *
   * `front` is optional: for the first frame or two after start-up only one
   * stream has delivered, and showing the back camera immediately beats
   * holding the screen black.
   */
  func compose(back: CVPixelBuffer, front: CVPixelBuffer?) -> CVPixelBuffer? {
    let geo = geometry
    let backImage = upright(CIImage(cvPixelBuffer: back), position: .back)
    let frontImage = front.map {
      upright(CIImage(cvPixelBuffer: $0), position: .front)
    }

    // `swapped` decides which sensor fills which pane — the layout itself
    // is only geometry.
    let mainSource = swapped ? frontImage : backImage
    let secondarySource = swapped ? backImage : frontImage

    let canvasRect = CGRect(origin: .zero, size: canvasSize)
    var result = black.cropped(to: canvasRect)

    // Blurred fill behind the letterbox bars, so the empty space reads as
    // part of the shot rather than as dead black.
    if geo.letterboxed, let source = mainSource ?? secondarySource {
      result = backdrop(from: source, canvas: canvasRect).composited(over: result)
    }

    if let mainSource {
      result = fill(mainSource, into: ciRect(geo.main)).composited(over: result)
    }

    if let secondarySource {
      var pane = fill(secondarySource, into: ciRect(geo.secondary))
      if geo.overlaps, geo.cornerRadius > 0 {
        let (mask, border) = roundedMask(
          for: ciRect(geo.secondary),
          radius: geo.cornerRadius
        )
        // Keep the pane only where the rounded mask is opaque, then lay the
        // hairline stroke over the seam.
        pane = pane.applyingFilter(
          "CISourceInCompositing",
          parameters: [kCIInputBackgroundImageKey: mask]
        )
        result = border.composited(over: pane.composited(over: result))
      } else {
        result = pane.composited(over: result)
      }
    }

    result = divider(for: geo).composited(over: result)

    guard let buffer = nextBuffer() else { return nil }
    context.render(
      result,
      to: buffer,
      bounds: canvasRect,
      colorSpace: CGColorSpaceCreateDeviceRGB()
    )
    return buffer
  }

  /**
   * Rotate (and mirror) a camera frame to portrait.
   *
   * This is done HERE rather than on the capture connection because a
   * multi-cam session routinely refuses `videoRotationAngle` on a video
   * data output — and it fails silently, delivering landscape buffers. In
   * CoreImage it's deterministic, and it costs nothing: `oriented` is an
   * affine transform that folds into the scale/translate below.
   *
   * The landscape check keeps it correct even if some device does honour
   * the connection-level rotation.
   */
  private func upright(
    _ image: CIImage,
    position: AVCaptureDevice.Position
  ) -> CIImage {
    guard image.extent.width > image.extent.height else { return image }
    // Front is mirrored so a selfie reads the way the user expects.
    return image.oriented(position == .front ? .leftMirrored : .right)
  }

  /// Aspect-FILL a camera frame into a destination rect and crop to it. For
  /// the split layouts the rect already carries the source's aspect ratio,
  /// so this is a pure scale with nothing thrown away.
  private func fill(_ image: CIImage, into rect: CGRect) -> CIImage {
    let extent = image.extent
    guard extent.width > 0, extent.height > 0 else { return image }
    let scale = max(rect.width / extent.width, rect.height / extent.height)
    var out = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    out = out.transformed(
      by: CGAffineTransform(
        translationX: rect.midX - out.extent.midX,
        y: rect.midY - out.extent.midY
      )
    )
    return out.cropped(to: rect)
  }

  /// Heavily blurred fill for the letterbox bars.
  private func backdrop(from image: CIImage, canvas: CGRect) -> CIImage {
    let extent = image.extent
    guard extent.width > 0, extent.height > 0 else {
      return black.cropped(to: canvas)
    }
    // Downscale hard before blurring — a full-resolution gaussian every
    // frame is pure waste when the result is this soft anyway.
    let scale = 160 / max(extent.width, extent.height)
    let small = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let smallExtent = small.extent
    let blurred =
      small
      .clampedToExtent()
      .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 10])
      .cropped(to: smallExtent)
    return fill(blurred, into: canvas)
  }

  /// Hairline seam between two touching panes, so a split doesn't read as
  /// one continuous (broken-looking) image. Skipped when the letterbox
  /// already leaves a gap between them.
  private func divider(for geo: DualCameraGeometry) -> CIImage {
    guard !geo.overlaps else { return .empty() }
    let thickness = max(2, (canvasSize.width * 0.004).rounded())
    let rect: CGRect
    switch layout {
    case .horizontal:
      guard abs(geo.secondary.minX - geo.main.maxX) < 1 else { return .empty() }
      rect = CGRect(
        x: geo.main.maxX - thickness / 2,
        y: geo.main.minY,
        width: thickness,
        height: geo.main.height
      )
    case .vertical:
      guard abs(geo.secondary.minY - geo.main.maxY) < 1 else { return .empty() }
      rect = CGRect(
        x: geo.main.minX,
        y: geo.main.maxY - thickness / 2,
        width: geo.main.width,
        height: thickness
      )
    case .pip:
      return .empty()
    }
    return CIImage(color: CIColor.black).cropped(to: ciRect(rect))
  }

  // ---------------------------------------------------------------------
  // PiP mask + border (cached)
  // ---------------------------------------------------------------------

  private func roundedMask(
    for rect: CGRect,
    radius: CGFloat
  ) -> (mask: CIImage, border: CIImage) {
    if let cached = cachedMask,
      cached.rect == rect,
      cached.radius == radius
    {
      return (cached.mask, cached.border)
    }

    let size = rect.size
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.opaque = false
    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    let local = CGRect(origin: .zero, size: size)

    let maskImage = renderer.image { _ in
      UIColor.white.setFill()
      UIBezierPath(roundedRect: local, cornerRadius: radius).fill()
    }
    let lineWidth = max(2, canvasSize.width * 0.005)
    let borderImage = renderer.image { _ in
      UIColor.white.withAlphaComponent(0.9).setStroke()
      let path = UIBezierPath(
        roundedRect: local.insetBy(dx: lineWidth / 2, dy: lineWidth / 2),
        cornerRadius: radius
      )
      path.lineWidth = lineWidth
      path.stroke()
    }

    // Both are drawn in the pane's own space — move them onto the canvas.
    let place = CGAffineTransform(translationX: rect.minX, y: rect.minY)
    let mask = (CIImage(image: maskImage) ?? .empty()).transformed(by: place)
    let border = (CIImage(image: borderImage) ?? .empty()).transformed(by: place)

    cachedMask = (rect, radius, mask, border)
    return (mask, border)
  }

  /// UIKit rect (origin top-left) → CoreImage rect (origin bottom-left).
  private func ciRect(_ rect: CGRect) -> CGRect {
    CGRect(
      x: rect.minX,
      y: canvasSize.height - rect.maxY,
      width: rect.width,
      height: rect.height
    )
  }

  // ---------------------------------------------------------------------
  // Output buffer pool
  // ---------------------------------------------------------------------

  private func createPool() {
    let attributes: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: Int(canvasSize.width),
      kCVPixelBufferHeightKey as String: Int(canvasSize.height),
      kCVPixelBufferMetalCompatibilityKey as String: true,
      kCVPixelBufferIOSurfacePropertiesKey as String: [:],
    ]
    let poolAttributes: [String: Any] = [
      kCVPixelBufferPoolMinimumBufferCountKey as String: 6
    ]
    CVPixelBufferPoolCreate(
      kCFAllocatorDefault,
      poolAttributes as CFDictionary,
      attributes as CFDictionary,
      &pool
    )
  }

  private func nextBuffer() -> CVPixelBuffer? {
    guard let pool else { return nil }
    var buffer: CVPixelBuffer?
    guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &buffer)
      == kCVReturnSuccess
    else {
      return nil
    }
    return buffer
  }
}
