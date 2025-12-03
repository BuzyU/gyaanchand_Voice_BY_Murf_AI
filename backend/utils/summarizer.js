module.exports = function summarize(text) {
  return "Summary: " + text.split(" ").slice(0, 20).join(" ") + "...";
};
