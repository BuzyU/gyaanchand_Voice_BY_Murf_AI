module.exports = function explain(text) {
  const topic = text.replace(/explain|what is/gi, "").trim();
  return `Here is a simple explanation of ${topic}. ${topic} is commonly used in learning and problem solving.`;
};
