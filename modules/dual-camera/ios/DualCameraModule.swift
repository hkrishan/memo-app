import AVFoundation
import ExpoModulesCore

/**
 * JS bridge for the dual (front + back at once) camera.
 *
 * Capture lives on the MODULE rather than on the view: there is exactly
 * one capture session in the app, and routing photo/record calls through a
 * view ref would only add a way for them to arrive at a stale view during
 * a remount.
 */
public class DualCameraModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DualCamera")

    Constants([
      // A12 (iPhone XS / XR) and newer. Simulators report false.
      "isSupported": DualCameraController.isSupported
    ])

    AsyncFunction("setAudioEnabled") { (enabled: Bool) in
      DualCameraController.shared.setAudioEnabled(enabled)
    }

    AsyncFunction("capturePhoto") { (promise: Promise) in
      DualCameraController.shared.capturePhoto { result in
        switch result {
        case .success(let photo):
          promise.resolve([
            "path": photo.path,
            "width": photo.width,
            "height": photo.height,
          ])
        case .failure(let error):
          promise.reject(
            "ERR_DUAL_CAPTURE",
            error.localizedDescription
          )
        }
      }
    }

    AsyncFunction("startRecording") { (promise: Promise) in
      DualCameraController.shared.startRecording { result in
        switch result {
        case .success:
          promise.resolve(nil)
        case .failure(let error):
          promise.reject("ERR_DUAL_RECORD_START", error.localizedDescription)
        }
      }
    }

    AsyncFunction("stopRecording") { (promise: Promise) in
      DualCameraController.shared.stopRecording { result in
        switch result {
        case .success(let video):
          promise.resolve([
            "path": video.path,
            "width": video.width,
            "height": video.height,
            "duration": video.duration,
          ])
        case .failure(let error):
          promise.reject("ERR_DUAL_RECORD_STOP", error.localizedDescription)
        }
      }
    }

    View(DualCameraPreviewView.self) {
      Events("onPreviewStarted", "onError", "onTapPane")

      Prop("isActive") { (view: DualCameraPreviewView, active: Bool) in
        view.setActive(active)
      }

      Prop("layout") { (_: DualCameraPreviewView, value: String) in
        DualCameraController.shared.layout =
          DualCameraLayout(rawValue: value) ?? .horizontal
      }

      Prop("swapped") { (_: DualCameraPreviewView, value: Bool) in
        DualCameraController.shared.swapped = value
      }
    }
  }
}
