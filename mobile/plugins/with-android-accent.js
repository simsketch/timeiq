// Android tints switch thumbs, the text cursor and selection handles with the theme's
// colorAccent, which defaults to Material teal. Use the brand tangerine instead.
const { AndroidConfig, withAndroidColors, withAndroidStyles } = require("expo/config-plugins");

const ACCENT = "#F2690D";

module.exports = function withAndroidAccent(config) {
  config = withAndroidColors(config, (c) => {
    c.modResults = AndroidConfig.Colors.assignColorValue(c.modResults, { name: "colorAccent", value: ACCENT });
    return c;
  });
  return withAndroidStyles(config, (c) => {
    c.modResults = AndroidConfig.Styles.assignStylesValue(c.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: "colorAccent",
      value: "@color/colorAccent",
    });
    return c;
  });
};
