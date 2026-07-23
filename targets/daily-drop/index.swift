import ActivityKit
import SwiftUI
import WidgetKit

/**
 * Attributes of the daily-drop Live Activity.
 *
 * IMPORTANT: this struct is DUPLICATED in the app-side native module
 * (modules/daily-drop-activity/ios/DailyDropActivityModule.swift) —
 * ActivityKit pairs the running activity with this widget by the type's
 * name and Codable shape, so the two definitions must stay identical.
 */
struct DailyDropAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// When the drop window closes — the countdown target.
    var endsAt: Date
  }

  var albumTitle: String
  var albumId: String
}

@main
struct DailyDropWidgetBundle: WidgetBundle {
  var body: some Widget {
    DailyDropLiveActivity()
  }
}

private func timerRange(to endsAt: Date) -> ClosedRange<Date> {
  // A range whose lower bound is after its upper crashes Text(timerInterval:)
  let now = Date()
  return now...(max(endsAt, now.addingTimeInterval(1)))
}

struct DailyDropLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: DailyDropAttributes.self) { context in
      // ---- Lock screen / banner ----
      HStack(spacing: 14) {
        ZStack {
          Circle()
            .fill(Color.white.opacity(0.12))
            .frame(width: 44, height: 44)
          Image(systemName: "bolt.fill")
            .font(.system(size: 20, weight: .bold))
            .foregroundColor(.yellow)
        }
        VStack(alignment: .leading, spacing: 2) {
          Text("Daily Drop")
            .font(.system(size: 16, weight: .heavy))
            .foregroundColor(.white)
          Text(context.attributes.albumTitle)
            .font(.system(size: 13))
            .foregroundColor(.white.opacity(0.65))
            .lineLimit(1)
        }
        Spacer()
        VStack(alignment: .trailing, spacing: 2) {
          Text(
            timerInterval: timerRange(to: context.state.endsAt),
            countsDown: true
          )
          .font(.system(size: 26, weight: .bold, design: .rounded))
          .monospacedDigit()
          .foregroundColor(.white)
          .frame(width: 78, alignment: .trailing)
          Text("to post")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(.white.opacity(0.55))
        }
      }
      .padding(16)
      .activityBackgroundTint(Color.black.opacity(0.85))
      .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 8) {
            Image(systemName: "bolt.fill")
              .font(.system(size: 18, weight: .bold))
              .foregroundColor(.yellow)
            VStack(alignment: .leading, spacing: 1) {
              Text("Daily Drop")
                .font(.system(size: 14, weight: .heavy))
              Text(context.attributes.albumTitle)
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .lineLimit(1)
            }
          }
          .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(
            timerInterval: timerRange(to: context.state.endsAt),
            countsDown: true
          )
          .font(.system(size: 22, weight: .bold, design: .rounded))
          .monospacedDigit()
          .frame(width: 68, alignment: .trailing)
          .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text("Post a photo before the timer runs out!")
            .font(.system(size: 12))
            .foregroundColor(.secondary)
        }
      } compactLeading: {
        Image(systemName: "bolt.fill")
          .foregroundColor(.yellow)
      } compactTrailing: {
        Text(
          timerInterval: timerRange(to: context.state.endsAt),
          countsDown: true
        )
        .monospacedDigit()
        .font(.system(size: 13, weight: .semibold, design: .rounded))
        .frame(width: 44)
      } minimal: {
        Image(systemName: "bolt.fill")
          .foregroundColor(.yellow)
      }
    }
  }
}
