import AVFoundation
import CoreImage
import CoreMedia
// Explicit, even though CoreImage re-exports the header: the JPEG quality
// key (kCGImageDestinationLossyCompressionQuality) is an ImageIO symbol,
// and without this import Swift emits no autolink entry for it — which
// only shows up as an undefined symbol when the APP links, long after
// this file compiles clean.
import ImageIO
import UIKit

protocol DualCameraControllerDelegate: AnyObject {
  /// A freshly composited frame is ready to draw (called on the data queue).
  func dualCamera(didCompose buffer: CVPixelBuffer)
  /// First frame after a start — the preview is live.
  func dualCameraDidStartPreview()
  func dualCamera(didFail message: String)
}

enum DualCameraError: Error, LocalizedError {
  case unsupported
  case notAuthorized
  case missingDevice(String)
  case configurationFailed(String)
  case notRunning
  case alreadyRecording
  case notRecording
  case captureFailed(String)

  var errorDescription: String? {
    switch self {
    case .unsupported:
      return "This device can't run both cameras at once"
    case .notAuthorized:
      return "Camera access has not been granted"
    case .missingDevice(let which):
      return "No \(which) camera available"
    case .configurationFailed(let reason):
      return "Dual camera setup failed: \(reason)"
    case .notRunning:
      return "The dual camera is not running"
    case .alreadyRecording:
      return "Already recording"
    case .notRecording:
      return "Not recording"
    case .captureFailed(let reason):
      return reason
    }
  }
}

struct DualCameraPhoto {
  let path: String
  let width: Int
  let height: Int
}

struct DualCameraVideo {
  let path: String
  let width: Int
  let height: Int
  let duration: TimeInterval
}

/**
 * Owns the one AVCaptureMultiCamSession the app ever runs.
 *
 * A singleton on purpose: iOS allows a single capture session to hold the
 * cameras, and both the React view (preview) and the module's capture
 * functions need to talk to the same one. Keeping it here means a
 * remount of the view doesn't tear the session down and rebuild it — the
 * expensive part of dual-camera start-up.
 *
 * Threading contract:
 *   sessionQueue — configuration and start/stop, never blocks the main thread
 *   dataQueue    — BOTH video outputs and the audio output deliver here, so
 *                  the "latest front frame" handoff and the recorder need no
 *                  locking. Serial by construction.
 */
final class DualCameraController: NSObject {
  static let shared = DualCameraController()

  weak var delegate: DualCameraControllerDelegate?

  private let session = AVCaptureMultiCamSession()
  private let sessionQueue = DispatchQueue(label: "io.pollflow.memo.dualcamera.session")
  private let dataQueue = DispatchQueue(label: "io.pollflow.memo.dualcamera.data")
  private let encodeQueue = DispatchQueue(label: "io.pollflow.memo.dualcamera.encode")

  private var backInput: AVCaptureDeviceInput?
  private var frontInput: AVCaptureDeviceInput?
  private var audioInput: AVCaptureDeviceInput?
  private var backOutput: AVCaptureVideoDataOutput?
  private var frontOutput: AVCaptureVideoDataOutput?
  private var audioOutput: AVCaptureAudioDataOutput?

  private var compositor: DualCameraCompositor?
  private let ciContext: CIContext

  /// The most recent front frame, held until a back frame arrives to pair
  /// with it. Touched only on dataQueue. Retaining it keeps its pool
  /// buffer alive, which is exactly what we want for one frame.
  private var latestFront: CVPixelBuffer?

  private var recorder: DualCameraRecorder?
  /// Set when the session stops with a recording still open. The file is
  /// left finalizable (JS may still stop it and keep the footage), but a
  /// NEW recording must not be refused because of it.
  private var recorderIsStale = false
  /// Photo requests waiting for the next composited frame. Capturing a
  /// still is "hand me the very next thing the user is looking at",
  /// which is what makes preview and result identical.
  private var pendingPhotos: [(Result<DualCameraPhoto, Error>) -> Void] = []

  private var isConfigured = false
  private var hasEmittedPreviewStart = false
  /// What JS asked for, independent of whether the session is actually
  /// running right now (backgrounding stops it without clearing this).
  private var wantsRunning = false
  private var audioEnabled = true

  /// Canvas geometry, needed on the main thread for tap hit-testing. Both
  /// are written once during configuration, before the session runs.
  private(set) var canvasSize: CGSize = .zero
  private(set) var sourceAspect: CGFloat = 9.0 / 16.0

  var isRunning: Bool { session.isRunning }

  static var isSupported: Bool { AVCaptureMultiCamSession.isMultiCamSupported }

  // ---------------------------------------------------------------------

  private override init() {
    let device = MTLCreateSystemDefaultDevice()
    ciContext =
      device.map {
        CIContext(mtlDevice: $0, options: [.cacheIntermediates: false])
      } ?? CIContext(options: [.cacheIntermediates: false])
    super.init()

    let center = NotificationCenter.default
    center.addObserver(
      self,
      selector: #selector(handleRuntimeError(_:)),
      name: .AVCaptureSessionRuntimeError,
      object: session
    )
    center.addObserver(
      self,
      selector: #selector(handleDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleWillEnterForeground),
      name: UIApplication.willEnterForegroundNotification,
      object: nil
    )
  }

  // ---------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------

  var layout: DualCameraLayout = .horizontal {
    didSet {
      let value = layout
      dataQueue.async { [weak self] in self?.compositor?.layout = value }
    }
  }

  var swapped: Bool = false {
    didSet {
      let value = swapped
      dataQueue.async { [weak self] in self?.compositor?.swapped = value }
    }
  }

  /// Whether the mic is wired in. Read once, at configuration time — the
  /// session is not rebuilt to add audio later.
  func setAudioEnabled(_ enabled: Bool) {
    guard !isConfigured else { return }
    audioEnabled = enabled
  }

  /// Pane rectangles in canvas space, for hit-testing taps on the preview.
  func geometry() -> DualCameraGeometry {
    DualCameraCompositor.geometry(
      for: layout,
      canvas: canvasSize,
      sourceAspect: sourceAspect
    )
  }

  // ---------------------------------------------------------------------
  // Start / stop
  // ---------------------------------------------------------------------

  func start() {
    wantsRunning = true
    sessionQueue.async { [weak self] in
      guard let self else { return }
      do {
        try self.configureIfNeeded()
      } catch {
        self.reportFailure(error)
        return
      }
      guard !self.session.isRunning else { return }
      // Owned by dataQueue (the only other writer is the frame callback)
      self.dataQueue.async { self.hasEmittedPreviewStart = false }
      self.session.startRunning()
    }
  }

  func stop() {
    wantsRunning = false
    sessionQueue.async { [weak self] in
      guard let self else { return }
      if self.session.isRunning { self.session.stopRunning() }
      self.dataQueue.async {
        // An in-flight recording is deliberately NOT cancelled: the writer
        // is independent of the session, so whatever was filmed before the
        // interruption still finalizes into a valid (just shorter) file
        // when JS stops it. Throwing it away would lose real footage.
        if self.recorder != nil { self.recorderIsStale = true }
        self.latestFront = nil
        // A photo, though, can only ever be "the next frame" — and there
        // won't be one.
        let pending = self.pendingPhotos
        self.pendingPhotos = []
        pending.forEach { $0(.failure(DualCameraError.notRunning)) }
      }
    }
  }

  @objc private func handleDidEnterBackground() {
    sessionQueue.async { [weak self] in
      guard let self, self.session.isRunning else { return }
      self.session.stopRunning()
    }
  }

  @objc private func handleWillEnterForeground() {
    guard wantsRunning else { return }
    start()
  }

  @objc private func handleRuntimeError(_ note: Notification) {
    let error = note.userInfo?[AVCaptureSessionErrorKey] as? AVError
    // .mediaServicesWereReset is recoverable by restarting; anything else
    // is surfaced so JS can fall back to the single-camera screen.
    if error?.code == .mediaServicesWereReset, wantsRunning {
      sessionQueue.async { [weak self] in
        guard let self, !self.session.isRunning else { return }
        self.session.startRunning()
      }
      return
    }
    reportFailure(
      DualCameraError.captureFailed(
        error?.localizedDescription ?? "Camera session error"
      )
    )
  }

  private func reportFailure(_ error: Error) {
    let message = error.localizedDescription
    DispatchQueue.main.async { [weak self] in
      self?.delegate?.dualCamera(didFail: message)
    }
  }

  // ---------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------

  /// Screen height/width. Configuration runs on sessionQueue, so this may
  /// need to hop to the main thread — never the other way round, so it
  /// can't deadlock.
  private static func screenAspect() -> CGFloat {
    let read: () -> CGFloat = {
      let size = UIScreen.main.bounds.size
      return size.width > 0 ? size.height / size.width : 16.0 / 9.0
    }
    return Thread.isMainThread ? read() : DispatchQueue.main.sync(execute: read)
  }

  private func configureIfNeeded() throws {
    guard !isConfigured else { return }
    guard AVCaptureMultiCamSession.isMultiCamSupported else {
      throw DualCameraError.unsupported
    }
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
      throw DualCameraError.notAuthorized
    }

    // Canvas is screen-shaped so the preview shows it 1:1: a cover-crop
    // would shave the outer edge off BOTH panes of a split layout.
    let width: CGFloat = 1080
    // H.264 wants even dimensions; round to 4 to keep encoders happy.
    let height = (width * Self.screenAspect() / 4).rounded() * 4
    canvasSize = CGSize(width: width, height: height)

    session.beginConfiguration()
    do {
      let (bIn, bOut) = try addCamera(position: .back)
      backInput = bIn
      backOutput = bOut
      let (fIn, fOut) = try addCamera(position: .front)
      frontInput = fIn
      frontOutput = fOut
      if audioEnabled,
        AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
      {
        try? addAudio()
      }
    } catch {
      session.commitConfiguration()
      teardown()
      throw error
    }
    session.commitConfiguration()

    // Multi-cam has a fixed hardware budget (>1.0 means the session will
    // refuse to run or drop frames). Step the resolution down until it
    // fits — an iPhone XS needs this where a 15 Pro doesn't.
    var cap: Int32 = 1920
    while session.hardwareCost > 1.0 && cap > 640 {
      cap = cap == 1920 ? 1280 : 640
      applyFormats(maxDimension: cap)
    }

    // Read AFTER the hardware-cost ladder above has settled on the final
    // formats — a step down changes the frame's aspect ratio, and the split
    // layouts size their panes from it.
    sourceAspect = currentSourceAspect()

    let composer = DualCameraCompositor(
      canvasSize: canvasSize,
      sourceAspect: sourceAspect,
      context: ciContext
    )
    composer.layout = layout
    composer.swapped = swapped
    dataQueue.sync { self.compositor = composer }

    isConfigured = true
  }

  private func addCamera(
    position: AVCaptureDevice.Position
  ) throws -> (AVCaptureDeviceInput, AVCaptureVideoDataOutput) {
    let label = position == .back ? "back" : "front"
    guard
      let device = AVCaptureDevice.default(
        .builtInWideAngleCamera,
        for: .video,
        position: position
      )
    else {
      throw DualCameraError.missingDevice(label)
    }

    let input: AVCaptureDeviceInput
    do {
      input = try AVCaptureDeviceInput(device: device)
    } catch {
      throw DualCameraError.configurationFailed(error.localizedDescription)
    }
    guard session.canAddInput(input) else {
      throw DualCameraError.configurationFailed("\(label) input rejected")
    }
    // Multi-cam requires building connections by hand: the implicit
    // add-and-wire path only supports one video source.
    session.addInputWithNoConnections(input)

    setFormat(on: device, maxDimension: 1920)

    let output = AVCaptureVideoDataOutput()
    output.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]
    // Compositing is the bottleneck, not capture — dropping late frames
    // keeps the preview live instead of building a backlog.
    output.alwaysDiscardsLateVideoFrames = true
    output.setSampleBufferDelegate(self, queue: dataQueue)
    guard session.canAddOutput(output) else {
      throw DualCameraError.configurationFailed("\(label) output rejected")
    }
    session.addOutputWithNoConnections(output)

    guard
      let port = input.ports(
        for: .video,
        sourceDeviceType: device.deviceType,
        sourceDevicePosition: position
      ).first
    else {
      throw DualCameraError.configurationFailed("\(label) port unavailable")
    }
    let connection = AVCaptureConnection(inputPorts: [port], output: output)
    guard session.canAddConnection(connection) else {
      throw DualCameraError.configurationFailed("\(label) connection rejected")
    }
    session.addConnection(connection)
    // NOTE: deliberately NOT setting videoRotationAngle / isVideoMirrored
    // here. A multi-cam session routinely refuses hardware rotation on a
    // video data output and does so SILENTLY — the connection just keeps
    // delivering landscape buffers, which showed up as a preview lying on
    // its side. The compositor rotates instead, where it's deterministic
    // and folds into the transform it already applies.

    return (input, output)
  }

  private func addAudio() throws {
    guard let device = AVCaptureDevice.default(for: .audio) else { return }
    let input = try AVCaptureDeviceInput(device: device)
    guard session.canAddInput(input) else { return }
    session.addInputWithNoConnections(input)

    let output = AVCaptureAudioDataOutput()
    output.setSampleBufferDelegate(self, queue: dataQueue)
    guard session.canAddOutput(output) else { return }
    session.addOutputWithNoConnections(output)

    guard let port = input.ports.first(where: { $0.mediaType == .audio })
    else { return }
    let connection = AVCaptureConnection(inputPorts: [port], output: output)
    guard session.canAddConnection(connection) else { return }
    session.addConnection(connection)

    audioInput = input
    audioOutput = output
  }

  /// Width/height of ONE upright camera frame, taken from the format the
  /// back camera actually settled on. Fixed for the life of the session, so
  /// the preview can read it on the main thread for tap hit-testing without
  /// racing the capture queue.
  private func currentSourceAspect() -> CGFloat {
    guard let device = backInput?.device else { return 9.0 / 16.0 }
    let dims = CMVideoFormatDescriptionGetDimensions(
      device.activeFormat.formatDescription
    )
    let short = CGFloat(min(dims.width, dims.height))
    let long = CGFloat(max(dims.width, dims.height))
    guard short > 0, long > 0 else { return 9.0 / 16.0 }
    return short / long
  }

  private func applyFormats(maxDimension: Int32) {
    session.beginConfiguration()
    [backInput?.device, frontInput?.device].compactMap { $0 }.forEach {
      setFormat(on: $0, maxDimension: maxDimension)
    }
    session.commitConfiguration()
  }

  /// Pick the largest multi-cam-capable format within a width budget.
  /// Only `isMultiCamSupported` formats are eligible — the high-res ones
  /// the single-camera screen prefers simply cannot run two at a time.
  private func setFormat(on device: AVCaptureDevice, maxDimension: Int32) {
    let candidates = device.formats.filter { format in
      guard format.isMultiCamSupported else { return false }
      let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
      guard max(dims.width, dims.height) <= maxDimension else { return false }
      return format.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= 30 }
    }
    let best = candidates.max { a, b in
      let da = CMVideoFormatDescriptionGetDimensions(a.formatDescription)
      let db = CMVideoFormatDescriptionGetDimensions(b.formatDescription)
      return Int(da.width) * Int(da.height) < Int(db.width) * Int(db.height)
    }
    guard let best else { return }
    do {
      try device.lockForConfiguration()
      device.activeFormat = best
      // Pin to 30fps: higher rates multiply the multi-cam hardware cost
      // for no visible benefit at these resolutions.
      let frameDuration = CMTime(value: 1, timescale: 30)
      device.activeVideoMinFrameDuration = frameDuration
      device.activeVideoMaxFrameDuration = frameDuration
      device.unlockForConfiguration()
    } catch {
      // Keep whatever format the session picked automatically
    }
  }

  private func teardown() {
    session.inputs.forEach { session.removeInput($0) }
    session.outputs.forEach { session.removeOutput($0) }
    backInput = nil
    frontInput = nil
    audioInput = nil
    backOutput = nil
    frontOutput = nil
    audioOutput = nil
    isConfigured = false
  }

  // ---------------------------------------------------------------------
  // Capture
  // ---------------------------------------------------------------------

  func capturePhoto(completion: @escaping (Result<DualCameraPhoto, Error>) -> Void) {
    dataQueue.async { [weak self] in
      guard let self else { return }
      guard self.session.isRunning else {
        completion(.failure(DualCameraError.notRunning))
        return
      }
      self.pendingPhotos.append(completion)
    }
  }

  func startRecording(completion: @escaping (Result<Void, Error>) -> Void) {
    dataQueue.async { [weak self] in
      guard let self else { return }
      guard self.session.isRunning, let compositor = self.compositor else {
        completion(.failure(DualCameraError.notRunning))
        return
      }
      if self.recorder != nil {
        // A recording left open by a screen that closed mid-record would
        // otherwise block dual recording for the rest of the app's life.
        guard self.recorderIsStale else {
          completion(.failure(DualCameraError.alreadyRecording))
          return
        }
        self.recorder?.cancel()
        self.recorder = nil
      }
      self.recorderIsStale = false
      do {
        self.recorder = try DualCameraRecorder(
          size: compositor.canvasSize,
          includeAudio: self.audioOutput != nil
        )
        completion(.success(()))
      } catch {
        completion(.failure(error))
      }
    }
  }

  func stopRecording(completion: @escaping (Result<DualCameraVideo, Error>) -> Void) {
    dataQueue.async { [weak self] in
      guard let self, let recorder = self.recorder else {
        completion(.failure(DualCameraError.notRecording))
        return
      }
      self.recorder = nil
      self.recorderIsStale = false
      let size = self.canvasSize
      let duration = recorder.duration
      recorder.finish { result in
        switch result {
        case .success(let url):
          completion(
            .success(
              DualCameraVideo(
                path: url.absoluteString,
                width: Int(size.width),
                height: Int(size.height),
                duration: duration
              )
            )
          )
        case .failure(let error):
          completion(.failure(error))
        }
      }
    }
  }

  private func writePhoto(
    _ buffer: CVPixelBuffer,
    callbacks: [(Result<DualCameraPhoto, Error>) -> Void]
  ) {
    let image = CIImage(cvPixelBuffer: buffer)
    let width = CVPixelBufferGetWidth(buffer)
    let height = CVPixelBufferGetHeight(buffer)
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("dual-\(UUID().uuidString).jpg")
    do {
      guard
        let data = ciContext.jpegRepresentation(
          of: image,
          colorSpace: CGColorSpaceCreateDeviceRGB(),
          options: [
            kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption:
              0.92
          ]
        )
      else {
        throw DualCameraError.captureFailed("Could not encode the photo")
      }
      try data.write(to: url, options: .atomic)
      let photo = DualCameraPhoto(
        path: url.absoluteString,
        width: width,
        height: height
      )
      callbacks.forEach { $0(.success(photo)) }
    } catch {
      callbacks.forEach { $0(.failure(error)) }
    }
  }
}

// -----------------------------------------------------------------------
// Sample buffer delivery — one serial queue for all three outputs, so the
// front-frame handoff needs no locking.
// -----------------------------------------------------------------------

extension DualCameraController: AVCaptureVideoDataOutputSampleBufferDelegate,
  AVCaptureAudioDataOutputSampleBufferDelegate
{
  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    if output === audioOutput {
      recorder?.appendAudio(sampleBuffer)
      return
    }

    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }

    // The front stream only parks its newest frame; the back stream is the
    // clock that drives compositing, so the output runs at a steady 30fps
    // even if the two sensors aren't perfectly in step.
    if output === frontOutput {
      latestFront = pixelBuffer
      return
    }
    guard output === backOutput, let compositor else { return }

    guard let composed = compositor.compose(back: pixelBuffer, front: latestFront)
    else {
      return  // pool exhausted — skip this frame rather than stall capture
    }

    let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    recorder?.appendVideo(composed, at: time)

    if !hasEmittedPreviewStart {
      hasEmittedPreviewStart = true
      DispatchQueue.main.async { [weak self] in
        self?.delegate?.dualCameraDidStartPreview()
      }
    }
    delegate?.dualCamera(didCompose: composed)

    if !pendingPhotos.isEmpty {
      let callbacks = pendingPhotos
      pendingPhotos = []
      // JPEG encoding is slow enough to drop frames if done inline.
      encodeQueue.async { [weak self] in
        self?.writePhoto(composed, callbacks: callbacks)
      }
    }
  }
}
