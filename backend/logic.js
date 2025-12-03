// backend/logic.js
const correctNames = require("./nameCorrector");
const getAIResponse = require("./llm");

/*
 ADVANCED MEMORY ENGINE
 Stores:
  - userName
  - lastUserMessages (rolling window)
  - lastBotMessages
  - topic (auto-detected)
*/
let memory = {
  userName: null,
  lastUserMessages: [],
  lastBotMessages: [],
  topic: null
};

// Store message in rolling memory
function pushMemory(list, text) {
  list.push(text);
  if (list.length > 6) list.shift(); // keep only last 6 messages
}

async function getResponse(text) {
  const raw = text || "";
  const fixedText = correctNames(raw);

  if (!fixedText.trim()) return "I couldn't hear you clearly. Try speaking again.";

  const lowered = fixedText.toLowerCase();

  //
  // 1. NAME DETECTION (Advanced)
  //
  const namePatterns = [
    /my name is (.+)/i,
    /i am (.+)/i,
    /i'm (.+)/i,
    /this is (.+)/i,
    /the name is (.+)/i
  ];

  for (let p of namePatterns) {
    const match = fixedText.match(p);
    if (match && match[1]) {
      let extracted = match[1].split(/[.,!?]/)[0].trim();
      if (extracted.length >= 2) {
        memory.userName = extracted;
      }
    }
  }

  //
  // 2. ANSWER "WHAT IS MY NAME?" FROM MEMORY
  //
  if (lowered.includes("what is my name")) {
    if (memory.userName) {
      return `You told me your name is ${memory.userName}.`;
    } else {
      return "You haven't told me your name yet.";
    }
  }

  //
  // 3. Detect topic (simple)
  //
  if (/ai|machine learning|technology|computer|coding/i.test(fixedText)) {
    memory.topic = "technology";
  } else if (/life|feel|emotion|stress|advice/i.test(fixedText)) {
    memory.topic = "life";
  }

  //
  // 4. PUSH TO MEMORY
  //
  pushMemory(memory.lastUserMessages, fixedText);

  //
  // 5. PROVIDE HISTORY TO LLM
  //
  let memoryContext = "";
  if (memory.userName) {
    memoryContext += `User's name: ${memory.userName}\n`;
  }
  if (memory.topic) {
    memoryContext += `Topic: ${memory.topic}\n`;
  }
  if (memory.lastUserMessages.length > 0) {
    memoryContext += `Recent user messages: ${memory.lastUserMessages.join(" | ")}\n`;
  }
  if (memory.lastBotMessages.length > 0) {
    memoryContext += `Recent assistant messages: ${memory.lastBotMessages.join(" | ")}\n`;
  }

  const aiReply = await getAIResponse(
    `CONTEXT:\n${memoryContext}\n\nUSER SAID:\n${fixedText}`
  );

  // Save bot reply to memory
  pushMemory(memory.lastBotMessages, aiReply);

  return aiReply;
}

module.exports = getResponse;