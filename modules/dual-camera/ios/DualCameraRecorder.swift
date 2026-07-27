import AVFoundation
import CoreMedia
import CoreVideo

/**
 * Writes composited dual-camera frames to an .mp4.
 *
 * There is no AVCaptureMovieFileOutput here — a multi-cam session hands us
 * two independent streams, and the file has to contain the SAME single
 * frame the compositor already built for the preview. So frames go through
 * an AVAssetWriter pixel-buffer adaptor, and mic audio rides along on a
 * second input.
 *
 * The canvas is already portrait, so no preferredTransform is needed:
 * the file is natively upright everywhere it's played.
 *
 * Every method is called from the controller's serial data queue except
 * `finish`, which hops through it internally.
 */
final class DualCameraRecorder {
  enum RecorderError: Error, LocalizedError {
    case setupFailed(String)
    case noFrames

    var errorDescription: String? {
      switch self {
      case .setupFailed(let reason): return "Recorder setup failed: \(reason)"
      case .noFrames: return "Recording produced no frames"
      }
    }
  }

  let outputURL: URL

  private let writer: AVAssetWriter
  private let videoInput: AVAssetWriterInput
  private let audioInput: AVAssetWriterInput?
  private let adaptor: AVAssetWriterInputPixelBufferAdaptor

  /// Session time base: set from the first video frame so the movie starts
  /// at zero even though capture timestamps are host-clock based.
  private var startTime: CMTime?
  private var lastTime: CMTime?
  private var finished = false

  /// Seconds of media actually written (0 until the first frame lands).
  var duration: TimeInterval {
    guard let startTime, let lastTime else { return 0 }
    return CMTimeGetSeconds(CMTimeSubtract(lastTime, startTime))
  }

  init(size: CGSize, includeAudio: Bool) throws {
    outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("dual-\(UUID().uuidString).mp4")

    do {
      writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
    } catch {
      throw RecorderError.setupFailed(error.localizedDescription)
    }

    let width = Int(size.width)
    let height = Int(size.height)
    // ~0.11 bits per pixel per frame at 30fps — visually clean for a
    // full-screen portrait canvas without producing huge uploads.
    let bitrate = Int(Double(width * height) * 30 * 0.11)
    let videoSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: bitrate,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoAllowFrameReorderingKey: true,
      ],
    ]
    videoInput = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: videoSettings
    )
    videoInput.expectsMediaDataInRealTime = true

    adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: videoInput,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
      ]
    )

    guard writer.canAdd(videoInput) else {
      throw RecorderError.setupFailed("video input rejected")
    }
    writer.add(videoInput)

    if includeAudio {
      let audioSettings: [String: Any] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVNumberOfChannelsKey: 1,
        AVSampleRateKey: 44100,
        AVEncoderBitRateKey: 96000,
      ]
      let input = AVAssetWriterInput(
        mediaType: .audio,
        outputSettings: audioSettings
      )
      input.expectsMediaDataInRealTime = true
      if writer.canAdd(input) {
        writer.add(input)
        audioInput = input
      } else {
        audioInput = nil
      }
    } else {
      audioInput = nil
    }

    guard writer.startWriting() else {
      throw RecorderError.setupFailed(
        writer.error?.localizedDescription ?? "startWriting failed"
      )
    }
  }

  // ---------------------------------------------------------------------
  // Appending
  // ---------------------------------------------------------------------

  func appendVideo(_ buffer: CVPixelBuffer, at time: CMTime) {
    guard !finished, writer.status == .writing else { return }

    // The first composited frame defines t=0. Audio arriving before it is
    // dropped rather than stretching the movie with silence.
    if startTime == nil {
      writer.startSession(atSourceTime: time)
      startTime = time
    }
    guard videoInput.isReadyForMoreMediaData else { return }
    if adaptor.append(buffer, withPresentationTime: time) {
      lastTime = time
    }
  }

  func appendAudio(_ sampleBuffer: CMSampleBuffer) {
    guard !finished, writer.status == .writing,
      startTime != nil,
      let audioInput, audioInput.isReadyForMoreMediaData
    else {
      return
    }
    audioInput.append(sampleBuffer)
  }

  // ---------------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------------

  /// Marks the inputs finished and flushes the file. Safe to call twice —
  /// a second call reports the same failure rather than crashing.
  func finish(completion: @escaping (Result<URL, Error>) -> Void) {
    guard !finished else {
      completion(.failure(RecorderError.noFrames))
      return
    }
    finished = true

    guard startTime != nil, writer.status == .writing else {
      // Nothing was ever written (stopped within a frame of starting) —
      // cancel so no zero-byte file is left in tmp.
      writer.cancelWriting()
      try? FileManager.default.removeItem(at: outputURL)
      completion(.failure(RecorderError.noFrames))
      return
    }

    videoInput.markAsFinished()
    audioInput?.markAsFinished()

    let url = outputURL
    writer.finishWriting { [writer] in
      if writer.status == .completed {
        completion(.success(url))
      } else {
        try? FileManager.default.removeItem(at: url)
        completion(
          .failure(
            writer.error
              ?? RecorderError.setupFailed("writer status \(writer.status.rawValue)")
          )
        )
      }
    }
  }

  /// Abandon the recording without producing a file (session torn down,
  /// screen closed mid-record).
  func cancel() {
    guard !finished else { return }
    finished = true
    writer.cancelWriting()
    try? FileManager.default.removeItem(at: outputURL)
  }
}
