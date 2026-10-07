// Nomi for Apple Watch: record a networking session from your wrist.
// Only added to the iOS build when NOMI_WATCH=1 (see app.config.js and README.md).
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: "watch",
  name: "NomiWatch",
  displayName: "Nomi",
  bundleIdentifier: ".watchkitapp",
  deploymentTarget: "10.0",
  icon: "../../assets/images/icon.png",
  colors: { $accent: { color: "#F08A4B", darkColor: "#F08A4B" } },
  frameworks: ["SwiftUI", "AVFoundation", "WatchConnectivity"],
});
