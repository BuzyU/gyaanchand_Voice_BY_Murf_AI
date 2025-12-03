// backend/voiceStyle.js
function conversationalize(text) {
  if (!text || text.trim().length === 0) 
    return "Hmm... I didn’t quite catch that, let me say it again.";

  text = text.trim();
  text = text.replace(/\s+/g, " ");
  text = text.replace(/\.{2,}/g, ".");
  text = text.replace(/,/g, ", ");
  if (!text.endsWith(".")) text += ".";

  if (Math.random() < 0.35) {
    text = "Hmm… " + text;
  }

  text = text.replace(/\bbut\b/gi, "but…");
  text = text.replace(/\bbecause\b/gi, "because…");
  text = text.replace(/\bso\b/gi, "so…");

  if (text.length > 140) {
    text = text.replace(/, /g, "… ");
    text = text.replace(/\. /g, ".  ");
  }

  const warmeners = [
    "Alright, let me explain this naturally. ",
    "Sure, here’s how I’d say it. ",
    "Okay, I’ll put this in a simple way. ",
    "Let’s break this down together. ",
    "Here's the way I’d think about it. "
  ];

  if (Math.random() < 0.50) {
    const intro = warmeners[Math.floor(Math.random() * warmeners.length)];
    text = intro + text;
  }

  text += "  ";
  return text;
}

module.exports = conversationalize;
