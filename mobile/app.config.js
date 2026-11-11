// Native iPhone extras from targets/ (via @bacons/apple-targets):
//   targets/widget  the "Start session" widget and the recording Live Activity (always)
//   targets/watch   the Apple Watch app, only when NOMI_WATCH=1 (see targets/watch/README.md)
// Everything else comes from app.json.
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ["@bacons/apple-targets", { match: process.env.NOMI_WATCH === "1" ? "*" : "widget" }],
  ],
});
