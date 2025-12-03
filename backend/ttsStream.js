// backend/ttsStream.js - ULTRA NATURAL VERSION with multiple voice options
const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

/**
 * Try these voices for most natural sound:
 * - en-US-natalie (Female, very natural)
 * - en-US-terrell (Male, smooth)
 * - en-US-riley (Current)
 * - en-IN-kavya (Indian English, female)
 * - en-IN-priya (Indian English, female, warm)
 */

async function murfStream(text, ws) {
  try {
    // Clean the text - remove "Gyaanchand:" prefix and other markers
    let cleanedText = text
      .replace(/^Gyaanchand:\s*/gi, '')  // Remove "Gyaanchand:" at start
      .replace(/\bGyaanchand:\s*/gi, '') // Remove "Gyaanchand:" anywhere
      .replace(/\*\*/g, '')               // Remove markdown bold
      .replace(/\*/g, '')                 // Remove markdown italic
      .replace(/`/g, '')                  // Remove code markers
      .replace(/😊|😄|👍|✨/g, '')        // Remove emojis
      .replace(/\n{2,}/g, '. ')           // Replace multiple newlines
      .replace(/\s+/g, ' ')               // Normalize spaces
      .trim();

    if (!cleanedText) {
      console.log("⚠️ Empty text after cleaning, skipping TTS");
      return;
    }

    // Choose voice (uncomment the one you want to try)
    const voiceConfig = {
      // Option 1: Riley (current) - more natural settings
      voice_id: "en-US-riley",
      speed: 92,        // Slower = more natural
      pitch: -3,        // Lower = warmer
      
      // Option 2: Natalie (try this! very natural female voice)
      // voice_id: "en-US-natalie",
      // speed: 95,
      // pitch: 0,
      
      // Option 3: Terrell (smooth male voice)
      // voice_id: "en-US-terrell",
      // speed: 90,
      // pitch: -2,
      
      // Option 4: Indian English - Kavya
      // voice_id: "en-IN-kavya",
      // speed: 93,
      // pitch: 0,
      
      // Option 5: Indian English - Priya (warm, friendly)
      // voice_id: "en-IN-priya",
      // speed: 95,
      // pitch: 1,
    };

    const payload = {
      voice_id: voiceConfig.voice_id,
      text: cleanedText,
      model: "FALCON",
      format: "MP3",
      sampleRate: 24000,
      channelType: "MONO",
      speed: voiceConfig.speed,
      pitch: voiceConfig.pitch,
      variation: 3,           // Maximum natural variation
      pauseSettings: {
        sentencePause: 500,   // Natural pause between sentences (ms)
        commaPause: 300       // Natural pause at commas (ms)
      }
    };

    console.log(`🎙️ Murf AI: ${voiceConfig.voice_id} (speed: ${voiceConfig.speed}, pitch: ${voiceConfig.pitch})`);
    console.log(`📝 Text: "${cleanedText.substring(0, 60)}..."`);

    const resp = await axios.post(
      "https://global.api.murf.ai/v1/speech/stream",
      payload,
      {
        headers: {
          "api-key": process.env.MURF_API_KEY,
          "Content-Type": "application/json"
        },
        responseType: "stream",
        timeout: 120000
      }
    );

    const chunks = [];
    let totalBytes = 0;

    resp.data.on("data", (chunk) => {
      chunks.push(chunk);
      totalBytes += chunk.length;
    });

    resp.data.on("end", () => {
      console.log(`✅ Received: ${chunks.length} chunks, ${totalBytes} bytes`);
      
      if (ws.readyState === 1) {
        const completeAudio = Buffer.concat(chunks);
        console.log(`📤 Sending complete audio (${completeAudio.length} bytes)...`);
        ws.send(completeAudio);
        
        setTimeout(() => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "tts_end" }));
            console.log("✅ TTS complete");
          }
        }, 100);
      }
    });

    resp.data.on("error", (err) => {
      console.error("❌ Stream error:", err.message || err);
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "error", message: "TTS error" }));
      }
    });

  } catch (err) {
    console.error("❌ Murf Error:", err.response?.data || err.message);
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "error", message: "TTS failed" }));
    }
  }
}

module.exports = murfStream;