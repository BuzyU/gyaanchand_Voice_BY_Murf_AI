// backend/ttsStreamSentences.js - IMPROVED: Natural sentence detection
const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const VOICE_CONFIGS = {
  'en-US-terrell': { id: 'en-US-terrell', style: 'Conversational', speed: 0, pitch: 0, variation: 1 },
  'en-US-michael': { id: 'en-US-michael', style: 'Conversational', speed: 0, pitch: 0, variation: 1 },
  'en-US-wayne': { id: 'en-US-wayne', style: 'Conversational', speed: 0, pitch: 0, variation: 1 },
  'en-US-ryan': { id: 'en-US-ryan', style: 'Conversational', speed: 0, pitch: 0, variation: 1 },
  'en-US-natalie': { id: 'en-US-natalie', style: 'Conversational', speed: 0, pitch: 0, variation: 1 },
  'en-US-lily': { id: 'en-US-lily', style: 'Conversational', speed: 0, pitch: 0, variation: 1 },
  'en-US-claire': { id: 'en-US-claire', style: 'Conversational', speed: 0, pitch: 0, variation: 1 },
  'en-GB-william': { id: 'en-GB-william', style: 'Conversational', speed: 0, pitch: 0, variation: 1 },
  'en-GB-emma': { id: 'en-GB-emma', style: 'Conversational', speed: 0, pitch: 0, variation: 1 }
};

// Add at top of file
let lastMurfCall = 0;
const MURF_RATE_LIMIT_MS = 100; // Minimum time between calls

async function generateChunkTTS(text, voiceId, signal) {
  // ✅ FIX: Rate limiting
  const now = Date.now();
  const timeSinceLastCall = now - lastMurfCall;
  if (timeSinceLastCall < MURF_RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, MURF_RATE_LIMIT_MS - timeSinceLastCall));
  }
  lastMurfCall = Date.now();
  
  const config = VOICE_CONFIGS[voiceId] || VOICE_CONFIGS['en-US-terrell'];
  // ... rest of function
}

function sanitizeForTTS(text) {
  if (!text) return "";
  
  text = text.replace(/[""«»„]/g, '"');
  text = text.replace(/['']/g, "'");
  text = text.replace(/…/g, "...");
  text = text.replace(/\*\*/g, '');
  text = text.replace(/`/g, '');
  text = text.replace(/^Gyaanchand:\s*/i, '');
  text = text.replace(/\s+/g, " ").trim();
  text = text.replace(/[\u0000-\u001F\u007F]/g, "");
  
  return text;
}

// ✅ IMPROVED: Better sentence boundary detection
function splitIntoSentences(text) {
  // Split on sentence boundaries while preserving punctuation
  const sentencePattern = /([.!?]+)\s+(?=[A-Z])|([.!?]+)$/g;
  
  const sentences = [];
  let lastIndex = 0;
  let match;
  
  while ((match = sentencePattern.exec(text)) !== null) {
    const sentence = text.substring(lastIndex, match.index + match[0].length).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text if any
  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex).trim();
    if (remaining.length > 0) {
      sentences.push(remaining);
    }
  }
  
  return sentences.filter(s => s.length > 0);
}

// ✅ IMPROVED: Smart chunking with natural breaks
function splitIntoChunks(text) {
  text = sanitizeForTTS(text);
  if (!text) return [];

  const sentences = splitIntoSentences(text);
  const chunks = [];
  let currentChunk = "";
  
  const MIN_CHUNK_SIZE = 80;  // Minimum characters per chunk
  const MAX_CHUNK_SIZE = 160; // Maximum characters per chunk
  const IDEAL_CHUNK_SIZE = 120; // Target size

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const testChunk = currentChunk ? currentChunk + " " + sentence : sentence;
    
    // If adding this sentence keeps us under max, add it
    if (testChunk.length <= MAX_CHUNK_SIZE) {
      currentChunk = testChunk;
      
      // If we're at ideal size or this is the last sentence, flush the chunk
      if (currentChunk.length >= IDEAL_CHUNK_SIZE || i === sentences.length - 1) {
        if (currentChunk.trim().length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }
      }
    } else {
      // Current chunk + sentence would exceed max
      // Flush current chunk if it meets minimum size
      if (currentChunk.trim().length >= MIN_CHUNK_SIZE) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else if (sentence.length <= MAX_CHUNK_SIZE) {
        // Current chunk too small, combine with this sentence
        currentChunk = testChunk;
      } else {
        // Sentence itself is too long, need to split it
        if (currentChunk.trim().length > 0) {
          chunks.push(currentChunk.trim());
        }
        
        // Split long sentence at natural breaks (commas, conjunctions)
        const parts = sentence.split(/,\s+|;\s+|\s+and\s+|\s+but\s+|\s+or\s+/);
        let subChunk = "";
        
        for (const part of parts) {
          const testSub = subChunk ? subChunk + ", " + part : part;
          if (testSub.length <= MAX_CHUNK_SIZE) {
            subChunk = testSub;
          } else {
            if (subChunk.trim().length > 0) {
              chunks.push(subChunk.trim());
            }
            subChunk = part;
          }
        }
        
        currentChunk = subChunk;
      }
    }
  }
  
  // Flush any remaining content
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  console.log(`📝 [TTS-CHUNKING] Split into ${chunks.length} natural chunks`);
  chunks.forEach((chunk, i) => {
    console.log(`   [${i + 1}/${chunks.length}] ${chunk.length} chars: "${chunk.substring(0, 50)}..."`);
  });
  
  return chunks;
}

async function generateChunkTTS(text, voiceId, signal) {
  const config = VOICE_CONFIGS[voiceId] || VOICE_CONFIGS['en-US-terrell'];
  
  console.log(`🎙️ [MURF-API] Voice: ${config.id} | ${text.length} chars`);
  
  const payload = {
    voice_id: config.id,
    style: config.style,
    text: text,
    model: "FALCON",
    format: "MP3",
    sampleRate: 24000,
    channelType: "MONO",
    speed: config.speed,
    pitch: config.pitch,
    variation: config.variation,
    pauseSettings: {
      sentencePause: 420,  // Slightly longer pauses for natural flow
      commaPause: 220
    }
  };

  const startTime = Date.now();

  try {
    const resp = await axios.post(
      "https://global.api.murf.ai/v1/speech/stream",
      payload,
      {
        headers: { 
          "api-key": process.env.MURF_API_KEY, 
          "Content-Type": "application/json" 
        },
        responseType: "arraybuffer",
        timeout: 30000, // Increased timeout for longer chunks
        signal
      }
    );

    const elapsed = Date.now() - startTime;
    const sizeKB = (resp.data.byteLength / 1024).toFixed(1);
    console.log(`✅ [MURF-API] Generated ${sizeKB}KB in ${elapsed}ms`);

    return resp.data;
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    
    if (axios.isCancel && axios.isCancel(error)) {
      console.log(`⛔ [MURF-API] Canceled after ${elapsed}ms`);
      throw error;
    }
    
    console.error(`❌ [MURF-ERROR] ${error.message} (${elapsed}ms)`);
    throw error;
  }
}

async function murfStreamSentences(text, ws, opts = {}) {
  const signal = opts.signal;
  const voiceId = opts.voiceId || 'en-US-terrell';

  console.log(`\n${'='.repeat(70)}`);
  console.log(`🎙️ [TTS-STREAM] Starting`);
  console.log(`   Voice: ${voiceId}`);
  console.log(`   Text: ${text.length} chars, ${text.split(' ').length} words`);
  console.log(`${'='.repeat(70)}`);

  try {
    if (!text || !text.trim()) {
      console.log("⚠️ [TTS-WARNING] Empty text");
      return;
    }

    text = sanitizeForTTS(text);
    const chunks = splitIntoChunks(text);

    if (chunks.length === 0) {
      console.log("⚠️ [TTS-WARNING] No chunks after splitting");
      return;
    }

    let sent = 0;
    let interrupted = false;
    const totalStartTime = Date.now();
    let totalBytes = 0;

    // ✅ IMPROVED: Parallel generation for first 2 chunks (faster start)
    const firstBatch = chunks.slice(0, 2);
    const restChunks = chunks.slice(2);
    
    // Generate first batch in parallel
    const firstBatchPromises = firstBatch.map(chunk => 
      generateChunkTTS(chunk, voiceId, signal).catch(err => {
        console.error(`❌ [BATCH-ERROR] ${err.message}`);
        return null;
      })
    );
    
    const firstBatchResults = await Promise.all(firstBatchPromises);
    
    // Send first batch
    for (let i = 0; i < firstBatchResults.length; i++) {
      const audioBuffer = firstBatchResults[i];
      
      if (signal?.aborted) {
        console.log(`⛔ [INTERRUPT] At chunk ${i + 1}`);
        interrupted = true;
        break;
      }
      
      if (!audioBuffer) continue;
      
      if (ws.readyState === 1) {
        ws.send(audioBuffer);
        sent++;
        totalBytes += audioBuffer.byteLength;
        
        console.log(`✅ [SEND] Chunk ${i + 1}/${chunks.length} (${(audioBuffer.byteLength / 1024).toFixed(1)}KB)`);
        
        // Small gap between chunks
        if (i < firstBatchResults.length - 1) {
          await new Promise(r => setTimeout(r, 120));
        }
      } else {
        console.log(`❌ [WS-CLOSED] At chunk ${i + 1}`);
        break;
      }
    }
    
    // Process remaining chunks one by one
    for (let i = 0; i < restChunks.length && !interrupted; i++) {
      if (signal?.aborted) {
        console.log(`⛔ [INTERRUPT] At chunk ${i + firstBatch.length + 1}`);
        interrupted = true;
        break;
      }

      const chunk = restChunks[i];
      const chunkIndex = i + firstBatch.length;
      
      try {
        const audioBuffer = await generateChunkTTS(chunk, voiceId, signal);
        
        if (signal?.aborted) {
          console.log(`⛔ [INTERRUPT] After generation ${chunkIndex + 1}`);
          interrupted = true;
          break;
        }

        if (ws.readyState === 1) {
          ws.send(audioBuffer);
          sent++;
          totalBytes += audioBuffer.byteLength;
          
          console.log(`✅ [SEND] Chunk ${chunkIndex + 1}/${chunks.length} (${(audioBuffer.byteLength / 1024).toFixed(1)}KB)`);
          
          if (i < restChunks.length - 1) {
            await new Promise(r => setTimeout(r, 120));
          }
        } else {
          console.log(`❌ [WS-CLOSED] At chunk ${chunkIndex + 1}`);
          break;
        }

      } catch (err) {
        if (axios.isCancel && axios.isCancel(err)) {
          console.log(`⛔ [INTERRUPT] Request canceled ${chunkIndex + 1}`);
          interrupted = true;
          break;
        }
        
        console.error(`❌ [ERROR] Chunk ${chunkIndex + 1} failed: ${err.message}`);
        continue;
      }
    }

    const totalElapsed = Date.now() - totalStartTime;
    const avgTime = sent > 0 ? (totalElapsed / sent).toFixed(0) : 0;

    console.log(`\n${'='.repeat(70)}`);
    if (interrupted) {
      console.log(`⛔ [TTS-SUMMARY] Interrupted`);
    } else {
      console.log(`✅ [TTS-SUMMARY] Complete`);
    }
    console.log(`   Delivered: ${sent}/${chunks.length} chunks`);
    console.log(`   Total size: ${(totalBytes / 1024).toFixed(1)}KB`);
    console.log(`   Total time: ${totalElapsed}ms`);
    console.log(`   Average: ${avgTime}ms per chunk`);
    console.log(`${'='.repeat(70)}\n`);

    if (ws.readyState === 1 && !interrupted) {
      setTimeout(() => {
        try {
          ws.send(JSON.stringify({ type: "tts_end" }));
          console.log("📢 [WS] TTS end signal sent");
        } catch {}
      }, 150);
    }

  } catch (err) {
    if (err.name === "CanceledError" || err.message === "canceled") {
      console.log("⛔ [TTS] Aborted");
      return;
    }
    
    console.error(`❌ [TTS-CRITICAL] ${err?.message || err}`);
    
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ 
        type: "error", 
        message: "Voice synthesis failed. Please try again." 
      }));
    }
  }
}

module.exports = murfStreamSentences;