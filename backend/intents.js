function detectIntent(text) {
  text = (text || "").toLowerCase();

  if (text.includes("explain") || text.includes("what is")) return "explain";
  if (text.includes("summarize")) return "summarize";
  if (text.includes("plan")) return "plan";
  if (text.includes("remind")) return "reminder";
  return "general";
}

module.exports = detectIntent;
