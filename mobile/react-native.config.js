// The watch messaging module is only compiled into the iOS app when the
// Apple Watch app is enabled (NOMI_WATCH=1), so the regular build is unchanged.
module.exports = {
  dependencies: {
    "react-native-watch-connectivity": process.env.NOMI_WATCH === "1" ? {} : { platforms: { ios: null, android: null } },
  },
};
