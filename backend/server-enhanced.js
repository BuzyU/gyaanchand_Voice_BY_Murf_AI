const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO'; // DEBUG, INFO, WARN, ERROR

const logger = {
  debug: (...args) => { if (['DEBUG'].includes(LOG_LEVEL)) console.log('[DEBUG]', ...args); },
  info: (...args) => { if (['DEBUG', 'INFO'].includes(LOG_LEVEL)) console.log('[INFO]', ...args); },
  warn: (...args) => { if (['DEBUG', 'INFO', 'WARN'].includes(LOG_LEVEL)) console.warn('[WARN]', ...args); },
  error: (...args) => console.error('[ERROR]', ...args)
};

// Replace all console.log with logger.info, etc.

// backend/server-enhanced.js - FIXED: Proper session tracking
require("dotenv").config({ path: require('path').join(__dirname, '../.env') });
const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const path = require("path");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const fs = require("fs");

const routeRequest = require("./intelligentRouter");
const murfStreamSentences = require("./ttsStreamSentences");
const { handleAction } = require("./actionHandler");

const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY;
if (!DEEPGRAM_KEY) {
  console.error("❌ DEEPGRAM_API_KEY not found");
  process.exit(1);
}

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-session-id");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".docx", ".doc"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and DOCX files allowed"));
    }
  }
});

// ✅ FIX: Better session management with WebSocket mapping
const sessionData = new Map();
const wsToSessionMap = new WeakMap(); // Map WebSocket to session ID

function getOrCreateSession(sessionId) {
  if (!sessionData.has(sessionId)) {
    sessionData.set(sessionId, { 
      document: null, 
      voiceId: 'en-US-terrell',
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
    console.log(`🆕 [SESSION] Created: ${sessionId}`);
  } else {
    // Update last activity
    sessionData.get(sessionId).lastActivity = Date.now();
  }
  return sessionData.get(sessionId);
}

app.post("/upload", upload.single("document"), async (req, res) => {
  console.log("\n" + "=".repeat(70));
  console.log("📄 [DOCUMENT-UPLOAD] Request received");
  console.log("=".repeat(70));
  
  try {
    if (!req.file) {
      console.log("❌ [UPLOAD-ERROR] No file provided");
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    console.log(`📁 [FILE-INFO] Name: ${req.file.originalname}`);
    console.log(`📊 [FILE-INFO] Size: ${(req.file.size / 1024).toFixed(2)} KB`);
    console.log(`🏷️ [FILE-INFO] Type: ${req.file.mimetype}`);

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let documentText = "";

    const startTime = Date.now();

    if (ext === ".pdf") {
      console.log("📖 [PDF-PARSER] Extracting content...");
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      documentText = pdfData.text;
      const elapsed = Date.now() - startTime;
      console.log(`✅ [PDF-PARSER] Success: ${pdfData.numpages} pages, ${documentText.length} chars in ${elapsed}ms`);
    } else if (ext === ".docx" || ext === ".doc") {
      console.log("📝 [DOCX-PARSER] Extracting content...");
      const result = await mammoth.extractRawText({ path: filePath });
      documentText = result.value;
      const elapsed = Date.now() - startTime;
      console.log(`✅ [DOCX-PARSER] Success: ${documentText.length} chars in ${elapsed}ms`);
    }

    // ✅ FIX: Use session ID from header or reject
    const sessionId = req.headers["x-session-id"];
    if (!sessionId) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ 
        success: false, 
        error: "Session ID required. Please refresh the page." 
      });
    }
    
    const session = getOrCreateSession(sessionId);
    
    // Store document in session
    session.document = {
      filename: req.file.originalname,
      content: documentText,
      uploadedAt: new Date().toISOString(),
      size: req.file.size
    };
    
    console.log(`💾 [SESSION-STORE] Document stored in session: ${sessionId}`);
    console.log(`📊 [SESSION-STORE] Content length: ${documentText.length} chars`);

    // Cleanup temp file
    fs.unlinkSync(filePath);
    console.log(`🗑️ [CLEANUP] Temporary file removed`);
    
    console.log("=".repeat(70) + "\n");

    res.json({
      success: true,
      filename: req.file.originalname,
      size: req.file.size,
      extracted: documentText.length,
      sessionId: sessionId
    });
} catch (err) {
  console.error(`❌ [UPLOAD-CRITICAL] ${err.message}`);
  
  // ✅ FIX: Clean up temp file on error
  if (req.file && fs.existsSync(req.file.path)) {
    try {
      fs.unlinkSync(req.file.path);
      console.log(`🗑️ [CLEANUP] Temp file removed after error`);
    } catch (cleanupErr) {
      console.error(`❌ [CLEANUP-ERROR] ${cleanupErr.message}`);
    }
  }
  
  console.log("=".repeat(70) + "\n");
  res.status(500).json({ success: false, error: err.message });
}
});

app.get("/health", (req, res) => {
  const memUsage = process.memoryUsage();
  
  res.json({ 
    status: "ok", 
    timestamp: new Date(), 
    uptime: process.uptime(),
    sessions: {
      active: sessionData.size,
      total: sessionData.size
    },
    memory: {
      heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function openDeepgramSocket(clientWs, sessionId) {
  console.log("\n" + "=".repeat(70));
  console.log("🎙️ [DEEPGRAM-INIT] Starting ASR connection");
  console.log(`   Session: ${sessionId}`);
  console.log("=".repeat(70));
  
const url =
  `wss://api.deepgram.com/v1/listen?` +
  `model=nova-2&` +
  `language=en-IN&` +
  `encoding=linear16&` +
  `sample_rate=16000&` +
  `channels=1&` +
  `punctuate=true&` +
  `interim_results=true&` +
  `endpointing=300&` + // ✅ Reduced from 350ms for faster response
  `vad_events=true&` +
  `smart_format=true`; // ✅ Better formatting

  const dgWs = new WebSocket(url, {
    headers: { Authorization: `Token ${DEEPGRAM_KEY}` },
  });

  let processingAudio = false;
  let isOpen = false;
  let keepAliveInterval = null;
  let transcriptTimeout = null;
  let currentTTSController = null;
  let audioChunksSent = 0;

  // Session memory
  let memory = {
    userName: null,
    lastUserMessages: [],
    lastBotMessages: []
  };

  const updateMemory = (userMsg, botMsg) => {
    if (userMsg) {
      memory.lastUserMessages.push(userMsg);
      if (memory.lastUserMessages.length > 4) memory.lastUserMessages.shift();
    }
    if (botMsg) {
      memory.lastBotMessages.push(botMsg);
      if (memory.lastBotMessages.length > 4) memory.lastBotMessages.shift();
    }

    try {
      clientWs.send(JSON.stringify({
        type: "memory_update",
        memory: {
          userName: memory.userName,
          history: memory.lastUserMessages.slice(-3).map((msg, i) => ({
            user: msg,
            assistant: memory.lastBotMessages[i] || ""
          }))
        }
      }));
    } catch (e) {}
  };

  dgWs.on("open", () => {
    isOpen = true;
    console.log("✅ [DEEPGRAM] WebSocket connected");
    console.log(`📡 [DEEPGRAM] Ready to receive audio\n`);
    
    clientWs.send(JSON.stringify({ type: "status", status: "Listening - Start speaking" }));

    keepAliveInterval = setInterval(() => {
      if (isOpen && dgWs.readyState === WebSocket.OPEN) {
        try { 
          dgWs.send(JSON.stringify({ type: "KeepAlive" }));
        } catch (err) {}
      }
    }, 5000);
  });

  dgWs.on("message", async (msg) => {
    if (!isOpen) return;
    
    try {
      const data = JSON.parse(msg.toString());

      if (data.type === "Results") {
        const channel = data.channel;
        if (!channel?.alternatives?.[0]) return;

        const transcript = channel.alternatives[0].transcript || "";
        const isFinal = data.is_final || false;
        const confidence = channel.alternatives[0].confidence || 0;

        // Interrupt handling
        if (processingAudio && !isFinal && transcript.length > 2) {
          console.log("\n⛔ [USER-INTERRUPT] Detected - Canceling TTS\n");
          
          if (currentTTSController) {
            currentTTSController.abort();
            currentTTSController = null;
          }
          
          try { 
            clientWs.send(JSON.stringify({ type: "stop_audio" })); 
          } catch (e) {}
          
          processingAudio = false;
        }

        if (confidence < 0.5 && transcript.length < 3) return;

        if (transcript?.trim()) {
          if (!isFinal) {
            clientWs.send(JSON.stringify({ type: "transcript", text: transcript, isFinal: false }));
            return;
          }

          if (isFinal && transcript.trim().length > 1) {
            console.log(`\n${'='.repeat(70)}`);
            console.log(`🎤 [SPEECH-RECOGNIZED]`);
            console.log(`   Text: "${transcript}"`);
            console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
            console.log(`${'='.repeat(70)}`);
            
            if (transcriptTimeout) clearTimeout(transcriptTimeout);

            clientWs.send(JSON.stringify({ type: "transcript", text: transcript, isFinal: true }));

            // Detect name
            const nameMatch = transcript.match(/(?:my name is|i am|i'm|call me)\s+([A-Za-z]+)/i);
            if (nameMatch && nameMatch[1].length > 2) {
              memory.userName = nameMatch[1];
              console.log(`👤 [MEMORY] User name detected: ${memory.userName}`);
            }

            const shouldProcess =
              data.speech_final ||
              transcript.length > 8 ||
              transcript.includes("?") ||
              confidence > 0.9;

            if (shouldProcess && !processingAudio) {
              transcriptTimeout = setTimeout(async () => {
                if (processingAudio) return;
                processingAudio = true;

                console.log(`\n⏳ [PROCESSING] Starting AI pipeline`);
                clientWs.send(JSON.stringify({ type: "status", status: "Thinking..." }));

                try {
                  // Build memory context
                  let memoryContext = "";
                  if (memory.userName) {
                    memoryContext += `User: ${memory.userName}\n`;
                  }
                  if (memory.lastUserMessages.length) {
                    const recent = memory.lastUserMessages.slice(-2).join(" | ");
                    memoryContext += `Recent: ${recent.substring(0, 150)}\n`;
                  }

                  // ✅ FIX: Get document from session
                  let documentContent = null;
                  const session = sessionData.get(sessionId);
                  
                  if (session?.document?.content) {
                    documentContent = session.document.content;
                    console.log(`📄 [DOCUMENT] Using: ${session.document.filename}`);
                    console.log(`📄 [DOCUMENT] Content: ${documentContent.length} chars`);
                  }

                  // Check for action requests
                  const actionResult = await handleAction(transcript, transcript);
                  
                  if (actionResult) {
                    console.log(`🎯 [ACTION] Processed`);
                    
                    clientWs.send(JSON.stringify({ 
                      type: "reply", 
                      text: actionResult.message
                    }));
                    clientWs.send(JSON.stringify({ type: "status", status: "Speaking..." }));

                    updateMemory(transcript, actionResult.message);

                    const voiceId = session?.voiceId || 'en-US-terrell';
                    currentTTSController = new AbortController();

                    await murfStreamSentences(actionResult.message, clientWs, { 
                      signal: currentTTSController.signal,
                      voiceId: voiceId
                    });
                    
                    currentTTSController = null;
                    processingAudio = false;
                    clientWs.send(JSON.stringify({ type: "status", status: "Listening..." }));
                    
                    console.log(`✅ [CYCLE] Complete\n`);
                    return;
                  }

                  // AI processing
                  currentTTSController = new AbortController();
                  
                  console.log(`🤖 [AI-REQUEST] Routing`);
                  
                  const aiReply = await routeRequest(
                    transcript, 
                    memoryContext, 
                    documentContent,
                    currentTTSController.signal
                  );

                  console.log(`💬 [AI-REPLY] ${aiReply.length} chars | ${aiReply.split(' ').length} words`);

                  updateMemory(transcript, aiReply);

                  clientWs.send(JSON.stringify({ 
                    type: "reply", 
                    text: aiReply
                  }));
                  clientWs.send(JSON.stringify({ type: "status", status: "Speaking..." }));

                  const voiceId = session?.voiceId || 'en-US-terrell';

                  await murfStreamSentences(aiReply, clientWs, { 
                    signal: currentTTSController.signal,
                    voiceId: voiceId
                  });
                  
                  currentTTSController = null;

                  console.log(`✅ [CYCLE] Complete\n`);
                  
                  clientWs.send(JSON.stringify({ type: "status", status: "Listening..." }));
                  processingAudio = false;
                  
                } catch (err) {
                  if (err.name === 'AbortError') {
                    console.log(`⛔ [ABORT] User interrupted\n`);
                  } else {
                    console.error(`❌ [ERROR] ${err.message}`);
                    clientWs.send(JSON.stringify({ 
                      type: "error", 
                      message: "Processing error: " + err.message 
                    }));
                  }
                  clientWs.send(JSON.stringify({ type: "status", status: "Listening..." }));
                  processingAudio = false;
                  currentTTSController = null;
                }
              }, data.speech_final ? 100 : 400);
            }
          }
        }
      }
    } catch (e) {
      console.error(`❌ [DEEPGRAM-ERROR] ${e.message}`);
    }
  });

  dgWs.on("close", (code) => {
    isOpen = false;
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    if (transcriptTimeout) clearTimeout(transcriptTimeout);
    console.log(`\n❌ [DEEPGRAM] Closed: Code ${code}`);
    console.log(`📊 [STATS] Audio chunks: ${audioChunksSent}\n`);
  });

  dgWs.on("error", (e) => {
    isOpen = false;
    console.error(`\n❌ [DEEPGRAM-ERROR] ${e.message}\n`);
  });

  return { 
    dgWs, 
    isOpen: () => isOpen, 
    cancelCurrentTTS: () => { 
      if (currentTTSController) {
        currentTTSController.abort(); 
        currentTTSController = null;
      }
    },
    incrementAudioChunks: () => { audioChunksSent++; }
  };
}

wss.on("connection", (ws) => {
  let sessionId = null;
  let dgConnection = null;
  
  console.log(`\n👤 [CLIENT-CONNECT] New WebSocket connection\n`);

  ws.on("message", async (data, isBinary) => {
    if (isBinary && dgConnection?.isOpen()) {
      try {
        dgConnection.dgWs.send(Buffer.from(data));
        dgConnection.incrementAudioChunks();
      } catch (err) {
        console.error(`❌ [WS-ERROR] Audio forward failed: ${err.message}`);
      }
      return;
    }

    try {
      const msg = JSON.parse(data.toString());
      
      // ✅ FIX: Handle handshake with session ID
      if (msg.type === "handshake") {
        sessionId = msg.sessionId;
        wsToSessionMap.set(ws, sessionId);
        getOrCreateSession(sessionId); // Ensure session exists
        
        console.log(`🤝 [HANDSHAKE] Session linked: ${sessionId}`);
        
        // Update voice if provided
        if (msg.voice) {
          const session = sessionData.get(sessionId);
          if (session) {
            session.voiceId = msg.voice;
          }
        }
        
        ws.send(JSON.stringify({ 
          type: "session_confirmed", 
          sessionId: sessionId 
        }));
        return;
      }
      
      if (msg.type === "start_live") {
        // ✅ FIX: Use session ID from handshake or message
        if (msg.sessionId) {
          sessionId = msg.sessionId;
          wsToSessionMap.set(ws, sessionId);
        }
        
        if (!sessionId) {
          ws.send(JSON.stringify({ 
            type: "error", 
            message: "No session ID. Please refresh the page." 
          }));
          return;
        }
        
        console.log(`🎙️ [START-LIVE] Session: ${sessionId}`);
        ws.send(JSON.stringify({ type: "status", status: "Connecting..." }));
        dgConnection = openDeepgramSocket(ws, sessionId);
      }

      if (msg.type === "stop_live") {
        console.log(`\n🛑 [STOP-LIVE] Session: ${sessionId}\n`);
        if (dgConnection?.isOpen()) {
          try { dgConnection.dgWs.close(); } catch (e) {}
        }
        dgConnection = null;
        ws.send(JSON.stringify({ type: "status", status: "Stopped" }));
      }

      if (msg.type === "client_stop_tts") {
        console.log(`⛔ [STOP-TTS] Session: ${sessionId}`);
        if (dgConnection) dgConnection.cancelCurrentTTS();
        try { ws.send(JSON.stringify({ type: "stop_audio" })); } catch (e) {}
      }

      if (msg.type === "voice_change") {
        const sid = msg.sessionId || sessionId;
        if (sid) {
          const session = getOrCreateSession(sid);
          session.voiceId = msg.voice;
          console.log(`🎵 [VOICE-CHANGE] ${msg.voice} [${sid}]`);
          ws.send(JSON.stringify({ type: "voice_changed", voice: msg.voice }));
        }
      }
    } catch (e) {}
  });

ws.on("close", () => {
  console.log(`\n👋 [CLIENT-DISCONNECT] Session: ${sessionId || 'unknown'}\n`);
  
  // ✅ FIX: Ensure Deepgram connection is closed
  if (dgConnection) {
    if (dgConnection.isOpen()) {
      try { 
        dgConnection.cancelCurrentTTS();
        dgConnection.dgWs.close(); 
      } catch (e) {
        console.error(`❌ [DG-CLOSE-ERROR] ${e.message}`);
      }
    }
    dgConnection = null; // Clear reference
  }
  
  // Keep session for 5 minutes after disconnect
  if (sessionId) {
    setTimeout(() => {
      if (sessionData.has(sessionId)) {
        const session = sessionData.get(sessionId);
        // Only delete if session hasn't been reused
        if (Date.now() - session.lastActivity > 5 * 60 * 1000) {
          sessionData.delete(sessionId);
          console.log(`🗑️ [CLEANUP] Session ${sessionId} removed`);
        }
      }
    }, 5 * 60 * 1000);
  }
});
});

// Periodic cleanup of old sessions
setInterval(() => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes
  let cleaned = 0;
  
  for (const [sessionId, session] of sessionData.entries()) {
    if (now - session.lastActivity > timeout) {
      sessionData.delete(sessionId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 [CLEANUP] Removed ${cleaned} inactive sessions`);
  }
}, 10 * 60 * 1000); // Every 10 minutes

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("\n" + "=".repeat(70));
  console.log("🚀 Gyaanchand - Production Voice AI Assistant");
  console.log("=".repeat(70));
  console.log(`📡 WebSocket: ws://localhost:${PORT}`);
  console.log(`📤 Upload: http://localhost:${PORT}/upload`);
  console.log(`💚 Health: http://localhost:${PORT}/health`);
  console.log(`\n🎙️ STACK:`);
  console.log(`   • Creator: Umer Zingu`);
  console.log(`   • ASR: Deepgram Nova-2`);
  console.log(`   • TTS: Murf AI`);
  console.log(`   • AI: Gemini 1.5 + Groq Llama 3.3 70B`);
  console.log("=".repeat(70) + "\n");
});

// Performance tracking
const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  averageResponseTime: 0,
  responseTimes: []
};

function updateMetrics(success, responseTime) {
  metrics.totalRequests++;
  if (success) {
    metrics.successfulRequests++;
  } else {
    metrics.failedRequests++;
  }
  
  metrics.responseTimes.push(responseTime);
  if (metrics.responseTimes.length > 100) {
    metrics.responseTimes.shift();
  }
  
  metrics.averageResponseTime = 
    metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length;
}

// Add endpoint to view metrics
app.get("/metrics", (req, res) => {
  res.json({
    ...metrics,
    successRate: (metrics.successfulRequests / metrics.totalRequests * 100).toFixed(2) + '%',
    averageResponseTime: metrics.averageResponseTime.toFixed(2) + 'ms'
  });
});

// Graceful shutdown
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n📛 [SHUTDOWN] Received ${signal}, shutting down gracefully...`);
  
  // Stop accepting new connections
  wss.close(() => {
    console.log('✅ [SHUTDOWN] WebSocket server closed');
  });
  
  server.close(() => {
    console.log('✅ [SHUTDOWN] HTTP server closed');
    
    // Clean up resources
    sessionData.clear();
    console.log('✅ [SHUTDOWN] Sessions cleared');
    
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⚠️ [SHUTDOWN] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));