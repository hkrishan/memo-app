/**
 * The Daily Drop Live Activity widget extension (lock screen banner +
 * Dynamic Island countdown). Compiled into an Xcode target by
 * @bacons/apple-targets during prebuild — the SwiftUI lives in
 * index.swift next to this file.
 *
 * ActivityKit needs iOS 16.2; on older systems the app module no-ops and
 * users just get the regular push.
 */
/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: "widget",
  name: "DailyDropWidget",
  deploymentTarget: "16.2",
  frameworks: ["SwiftUI", "WidgetKit", "ActivityKit"],
};
