// Nomi on the home screen and lock screen: a "Start session" widget, and the
// recording session as a Live Activity (lock screen and Dynamic Island).
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: "widget",
  name: "NomiWidget",
  displayName: "Nomi",
  bundleIdentifier: ".widget",
  deploymentTarget: "16.4",
  colors: {
    $accent: { color: "#1B1A17" },
    $widgetBackground: { color: "#FAF9F6" },
    paper: { color: "#FAF9F6" },
    ink: { color: "#1B1A17" },
    soft: { color: "#5E5B55" },
    live: { color: "#2E7D52" },
    orb: { color: "#E8743B" },
  },
  frameworks: ["SwiftUI", "WidgetKit", "ActivityKit"],
});
