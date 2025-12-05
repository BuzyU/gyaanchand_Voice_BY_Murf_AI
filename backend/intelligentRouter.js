// backend/intelligentRouter.js - FIXED: Weather API integration + Better memory
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");
const { getWeather } = require("./weatherService");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

let geminiFlashModel = null;
let geminiProModel = null;

function getGeminiFlashModel() {
  if (!geminiFlashModel) {
    geminiFlashModel = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash-latest",
      generationConfig: { 
        temperature: 0.7, 
        topP: 0.85, 
        maxOutputTokens: 250,
        candidateCount: 1
      }
    });
  }
  return geminiFlashModel;
}

function getGeminiProModel() {
  if (!geminiProModel) {
    geminiProModel = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro-latest",
      generationConfig: { 
        temperature: 0.7, 
        topP: 0.9, 
        maxOutputTokens: 350,
        candidateCount: 1
      }
    });
  }
  return geminiProModel;
}

function classifyIntent(text) {
  const lower = text.toLowerCase();
  
  // Weather detection
  if (/weather|temperature|forecast|climate|hot|cold|rain|sunny|cloudy/i.test(text)) {
    return { type: "weather", complexity: "simple" };
  }
  
  // Document detection
  if (/analyze|summarize|extract|tell.*about.*document|what.*document|document.*about|pdf|explain.*pdf/i.test(text)) {
    return { type: "document", complexity: "complex" };
  }
  
  // Simple queries
  if (/^(hi|hey|hello|what's up|how are you|good morning|good evening|who are you|what is your name|my name is)/i.test(text)) {
    return { type: "greeting", complexity: "simple" };
  }
  
  if (text.length < 50 && !/explain|compare|analyze|why|how does|detail/i.test(text)) {
    return { type: "general", complexity: "simple" };
  }
  
  // Complex queries
  if (
    text.length > 100 ||
    /explain.*detail|compare|analyze|what.*difference|step.*step|detailed|comprehensive|thorough/i.test(text) ||
    /tell me about|describe|what is|how does/i.test(text) ||
    /code|program|algorithm|implement/i.test(text)
  ) {
    return { type: "general", complexity: "complex" };
  }
  
  return { type: "general", complexity: "medium" };
}

function extractLocation(text) {
  // Extract location from text
  const locationPatterns = [
    /(?:in|at|for)\s+([A-Z][a-zA-Z\s]+?)(?:\s+city)?(?:\?|$|,|\s+what|\s+how)/i,
    /(?:weather|temperature|forecast)\s+(?:in|at|for)\s+([A-Z][a-zA-Z\s]+)/i,
    /(?:city|location|place)\s+(?:is|:)\s+([A-Z][a-zA-Z\s]+)/i,
    /^([A-Z][a-zA-Z\s]+?)(?:'s|\s+weather|\s+temperature)/i
  ];

  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const location = match[1].trim();
      if (location.length > 2 && location.length < 30) {
        return location;
      }
    }
  }
  
  return null;
}

function getSystemPrompt(intent, hasMemory, hasDocument) {
  const basePrompt = `You are Gyaanchand, a voice assistant created by Umer Zingu.

RESPONSE LENGTH RULES:
- Greetings: 20-40 words
- Simple: 40-70 words
- Medium: 70-110 words
- Complex: 120-180 words

VOICE-OPTIMIZED STYLE:
✅ Clear, conversational tone
✅ Short sentences (8-15 words)
✅ Natural transitions
❌ No "As an AI..." phrases
❌ No robotic language

BE DIRECT AND HELPFUL.`;

  if (intent.type === "greeting") {
    return basePrompt + `\n\nFor greetings: 20-40 words, warm and natural.`;
  }
  
  if (intent.type === "weather") {
    return basePrompt + `\n\nFor weather: Use the provided weather data to give a natural, conversational response. Include temperature, conditions, and helpful advice.`;
  }
  
  if (hasDocument) {
    return basePrompt + `\n\nDOCUMENT CONTEXT PROVIDED: Extract key facts and provide structured analysis.`;
  }
  
  if (intent.complexity === "complex") {
    return basePrompt + `\n\nProvide thorough, well-structured explanation with clear transitions.`;
  }
  
  return basePrompt;
}

function buildMemoryContext(memoryContext) {
  if (!memoryContext || memoryContext.length < 10) return "";
  
  const lines = memoryContext.split('\n').filter(l => l.trim());
  const compact = [];
  
  for (const line of lines) {
    if (line.includes("User:") || line.includes("Location:") || line.includes("Date:")) {
      compact.push(line);
    } else if (line.includes("Recent") && compact.length < 3) {
      const messages = line.split('|').slice(-2).join('|');
      compact.push(messages.substring(0, 150));
    }
  }
  
  return compact.join('\n').substring(0, 250);
}

async function callGeminiFlash(prompt, systemPrompt, signal) {
  console.log("🚀 [AI] Gemini 1.5 Flash");
  
  const model = getGeminiFlashModel();
  const startTime = Date.now();

  try {
    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }
      ]
    });

    const response = result.response.text().trim();
    console.log(`✅ [AI] Flash: ${Date.now() - startTime}ms`);
    return response;
    
  } catch (error) {
    console.error(`❌ [AI] Flash failed: ${error.message}`);
    throw error;
  }
}

async function callGeminiPro(prompt, systemPrompt, signal) {
  console.log("🔍 [AI] Gemini 1.5 Pro");
  
  const model = getGeminiProModel();
  const startTime = Date.now();

  try {
    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }
      ]
    });

    const response = result.response.text().trim();
    console.log(`✅ [AI] Pro: ${Date.now() - startTime}ms`);
    return response;
    
  } catch (error) {
    console.error(`❌ [AI] Pro failed: ${error.message}`);
    throw error;
  }
}

async function callGroq(prompt, systemPrompt, signal) {
  console.log("⚡ [AI] Groq Llama 3.3 70B");
  
  const startTime = Date.now();

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.75,
      top_p: 0.9
    });

    const content = response.choices[0].message.content.trim();
    console.log(`✅ [AI] Groq: ${Date.now() - startTime}ms`);
    return content;
    
  } catch (error) {
    console.error(`❌ [AI] Groq failed: ${error.message}`);
    throw error;
  }
}

async function routeRequest(text, memoryContext = "", documentContent = null, signal = null) {
  const startTime = Date.now();
  const intent = classifyIntent(text);
  
  console.log(`\n🧠 [INTENT] ${intent.type} | ${intent.complexity}`);

  try {
    const compactMemory = buildMemoryContext(memoryContext);
    const systemPrompt = getSystemPrompt(intent, !!compactMemory, !!documentContent);
    
    let response;
    let finalPrompt;

    // Weather queries
    if (intent.type === "weather") {
      console.log("🌤️ [WEATHER-MODE]");
      
      // Extract location from query or memory
      let location = extractLocation(text);
      
      // Check memory for saved location
      if (!location && compactMemory.includes("Location:")) {
        const locationMatch = compactMemory.match(/Location:\s*([^\n]+)/);
        if (locationMatch) {
          location = locationMatch[1].trim();
          console.log(`📍 [MEMORY] Using saved location: ${location}`);
        }
      }
      
      // Default to "current" if no location
      if (!location) {
        location = "current";
      }
      
      console.log(`🌍 [WEATHER] Fetching for: ${location}`);
      
      const weatherResult = await getWeather(location);
      
      if (weatherResult.success) {
        const weatherData = weatherResult.data;
        
        finalPrompt = `${compactMemory ? 'Context:\n' + compactMemory + '\n\n' : ''}WEATHER DATA:
Location: ${weatherData.location}, ${weatherData.country}
Temperature: ${weatherData.temperature}°C (feels like ${weatherData.feelsLike}°C)
Conditions: ${weatherData.description}
Humidity: ${weatherData.humidity}%
Wind Speed: ${weatherData.windSpeed} m/s

USER: ${text}

Provide a natural, conversational weather response (40-70 words) including the temperature, conditions, and helpful advice based on the weather.`;
        
        try {
          response = await callGeminiFlash(finalPrompt, systemPrompt, signal);
        } catch (err) {
          if (err.name === 'AbortError') throw err;
          response = await callGroq(finalPrompt, systemPrompt, signal);
        }
      } else {
        // Weather API failed
        response = weatherResult.message;
      }
    }
    // Document queries
    else if (documentContent && (intent.type === "document" || /document|pdf|file|summarize|uploaded/i.test(text))) {
      console.log("📄 [DOCUMENT-MODE]");
      
      finalPrompt = `${compactMemory ? 'Context:\n' + compactMemory + '\n\n' : ''}DOCUMENT:
${documentContent.substring(0, 3500)}

USER: ${text}

Provide clear response (80-120 words) with specific facts from document.`;
      
      try {
        response = await callGeminiPro(finalPrompt, systemPrompt, signal);
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        response = await callGroq(finalPrompt, systemPrompt, signal);
      }
    }
    // Greetings - Use fastest model
    else if (intent.type === "greeting") {
      finalPrompt = `${compactMemory ? 'Context: ' + compactMemory + '\n\n' : ''}User: ${text}

Respond warmly in 20-40 words.`;
      
      try {
        response = await callGeminiFlash(finalPrompt, systemPrompt, signal);
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        response = await callGroq(finalPrompt, systemPrompt, signal);
      }
    }
    // Simple queries
    else if (intent.complexity === "simple") {
      finalPrompt = `${compactMemory ? 'Context: ' + compactMemory + '\n\n' : ''}User: ${text}

Answer clearly in 40-70 words.`;
      
      try {
        response = await callGeminiFlash(finalPrompt, systemPrompt, signal);
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        response = await callGroq(finalPrompt, systemPrompt, signal);
      }
    }
    // Complex queries
    else {
      finalPrompt = `${compactMemory ? 'Context: ' + compactMemory + '\n\n' : ''}User: ${text}

Provide thorough response in 120-180 words with clear structure.`;
      
      try {
        response = await callGeminiPro(finalPrompt, systemPrompt, signal);
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        response = await callGroq(finalPrompt, systemPrompt, signal);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ [PERFORMANCE] ${elapsed}ms | ${response.length} chars\n`);
    
    return response.replace(/^Gyaanchand:\s*/i, "").trim();

  } catch (error) {
    if (error.name === 'AbortError') {
      console.log("⛔ [INTERRUPT] Aborted\n");
      throw error;
    }
    
    console.error(`❌ [ERROR] ${error.message}\n`);
    return "I'm having trouble right now. Could you try again?";
  }
}

module.exports = routeRequest;