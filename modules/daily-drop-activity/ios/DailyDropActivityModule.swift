import ActivityKit
import ExpoModulesCore

/**
 * Attributes of the daily-drop Live Activity.
 *
 * IMPORTANT: duplicated in the widget extension
 * (targets/daily-drop/index.swift) — ActivityKit pairs a requested
 * activity with the widget's ActivityConfiguration by this type's name
 * and Codable shape, so both definitions must stay identical.
 */
struct DailyDropAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var endsAt: Date
  }

  var albumTitle: String
  var albumId: String
}

public class DailyDropActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DailyDropActivity")

    Function("areActivitiesEnabled") { () -> Bool in
      guard #available(iOS 16.2, *) else { return false }
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /**
     * Start the countdown activity. Ends any previous daily-drop
     * activities first — one drop window on screen at a time.
     * Returns false when unsupported, disabled, or already past endsAt.
     */
    Function("startActivity") {
      (albumId: String, albumTitle: String, endsAtMs: Double) -> Bool in
      guard #available(iOS 16.2, *) else { return false }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        return false
      }
      let endsAt = Date(timeIntervalSince1970: endsAtMs / 1000)
      guard endsAt > Date() else { return false }

      let previous = Activity<DailyDropAttributes>.activities
      Task {
        for activity in previous {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
      }

      let attributes = DailyDropAttributes(
        albumTitle: albumTitle,
        albumId: albumId
      )
      let content = ActivityContent(
        state: DailyDropAttributes.ContentState(endsAt: endsAt),
        // Past the deadline the timer would show 0:00 forever — mark it
        // stale so the system dims/removes it if the app never ends it
        staleDate: endsAt
      )
      do {
        _ = try Activity.request(attributes: attributes, content: content)
        return true
      } catch {
        NSLog("DailyDropActivity: start failed: \(error)")
        return false
      }
    }

    /** End every daily-drop activity (drop closed, submitted, logout). */
    Function("endAllActivities") {
      guard #available(iOS 16.2, *) else { return }
      Task {
        for activity in Activity<DailyDropAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
      }
    }
  }
}
