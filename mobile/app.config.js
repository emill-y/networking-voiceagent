// Adds the optional Apple Watch app when NOMI_WATCH=1 (see targets/watch/README.md).
// Everything else comes from app.json.
module.exports = ({ config }) => {
  if (process.env.NOMI_WATCH !== "1") return config;
  return { ...config, plugins: [...(config.plugins ?? []), "@bacons/apple-targets"] };
};
