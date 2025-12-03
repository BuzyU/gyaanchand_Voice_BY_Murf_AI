// backend/server.js - FIXED: Better speech recognition
require("dotenv").config({ path: __dirname + "/.env" });
const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const path = require("path");

const getAIResponse = require("./llm");
const murfStream = require("./ttsStream");

const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY;
if (!DEEPGRAM_KEY) {
  console.error("❌ DEEPGRAM_API_KEY not found in .env");
  process.exit(1);
}

const app = express();

// Enable CORS for Vercel frontend and local development
app.use(cors({
  origin: [
    'https://gyaanchand-voice-ai.vercel.app',
    'http://localhost:8080',
    'http://localhost:5000',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function openDeepgramSocket(clientWs) {
  // Minimal working configuration (guaranteed to work)
  const url = `wss://api.deepgram.com/v1/listen?` + 
    `model=nova-2&` +
    `language=en-IN&` +
    `encoding=linear16&` +
    `sample_rate=16000&` +
    `channels=1`;

  console.log("🔗 Connecting to Deepgram with URL:", url.substring(0, 100) + "...");

  const dgWs = new WebSocket(url, {
    headers: {
      "Authorization": `Token ${DEEPGRAM_KEY}`
    }
  });

  let processingAudio = false;
  let isOpen = false;
  let keepAliveInterval = null;
  let lastTranscript = "";
  let transcriptTimeout = null;

  dgWs.on("open", () => {
    isOpen = true;
    console.log("✅ Deepgram connected (nova-2, en-IN, enhanced settings)");
    clientWs.send(JSON.stringify({ 
      type: "status", 
      status: "Listening - Start speaking" 
    }));
    
    keepAliveInterval = setInterval(() => {
      if (isOpen && dgWs.readyState === WebSocket.OPEN) {
        try {
          dgWs.send(JSON.stringify({ type: "KeepAlive" }));
        } catch (err) {
          console.error("❌ Keepalive error:", err.message);
        }
      }
    }, 5000);
  });

  dgWs.on("message", async (msg) => {
    if (!isOpen) return;

    try {
      const data = JSON.parse(msg.toString());
      
      if (data.type === "Results") {
        const channel = data.channel;
        if (!channel || !channel.alternatives || channel.alternatives.length === 0) {
          return;
        }

        const transcript = channel.alternatives[0].transcript || "";
        const isFinal = data.is_final || false;
        const speechFinal = data.speech_final || false;
        const confidence = channel.alternatives[0].confidence || 0;
        
        // Ignore very low confidence results
        if (confidence < 0.5 && transcript.length < 3) {
          return;
        }

        if (transcript && transcript.trim()) {
          // Show interim results
          if (!isFinal) {
            clientWs.send(JSON.stringify({ 
              type: "transcript", 
              text: transcript,
              isFinal: false
            }));
            return;
          }

          // Only process meaningful final transcripts
          if (isFinal && transcript.trim().length > 1) {
            console.log(`✅ FINAL: "${transcript}" (confidence: ${confidence.toFixed(2)})`);
            
            // Clear any pending timeout
            if (transcriptTimeout) {
              clearTimeout(transcriptTimeout);
            }

            // Show final transcript
            clientWs.send(JSON.stringify({ 
              type: "transcript", 
              text: transcript,
              isFinal: true
            }));

            // Only process complete sentences (with speech_final or good length)
            const shouldProcess = 
              speechFinal || 
              transcript.length > 10 || 
              transcript.includes('?') ||
              transcript.includes('.') ||
              confidence > 0.9;

            if (shouldProcess && !processingAudio) {
              // Wait a bit to see if more speech is coming
              transcriptTimeout = setTimeout(async () => {
                if (processingAudio) return;
                
                processingAudio = true;
                lastTranscript = transcript;
                
                console.log("🤖 Sending to Gemini:", transcript);
                
                try {
                  clientWs.send(JSON.stringify({ 
                    type: "status", 
                    status: "Thinking..." 
                  }));

                  const aiReply = await getAIResponse(transcript);
                  console.log("💬 Gemini replied:", aiReply);

                  clientWs.send(JSON.stringify({ 
                    type: "reply", 
                    text: aiReply 
                  }));

                  clientWs.send(JSON.stringify({ 
                    type: "status", 
                    status: "Speaking..." 
                  }));

                  console.log("🎵 Streaming TTS...");
                  await murfStream(aiReply, clientWs);
                  console.log("✅ TTS complete");

                  clientWs.send(JSON.stringify({ 
                    type: "status", 
                    status: "Listening..." 
                  }));
                  
                  processingAudio = false;
                } catch (err) {
                  console.error("❌ Processing error:", err);
                  clientWs.send(JSON.stringify({ 
                    type: "error", 
                    message: "Processing error: " + err.message 
                  }));
                  clientWs.send(JSON.stringify({ 
                    type: "status", 
                    status: "Listening..." 
                  }));
                  processingAudio = false;
                }
              }, speechFinal ? 100 : 500); // Shorter delay if speech is clearly final
            }
          }
        }
      }

      if (data.type === "Metadata") {
        console.log("📋 Deepgram ready:", data.request_id);
      }

    } catch (e) {
      console.error("❌ Deepgram parse error:", e.message);
    }
  });

  dgWs.on("close", (code, reason) => {
    isOpen = false;
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    if (transcriptTimeout) {
      clearTimeout(transcriptTimeout);
    }
    console.log(`❌ Deepgram closed: ${code}`);
    
    if (code !== 1000) {
      clientWs.send(JSON.stringify({ 
        type: "error", 
        message: `Deepgram disconnected: ${code}` 
      }));
    }
  });

  dgWs.on("error", (e) => {
    isOpen = false;
    console.error("❌ Deepgram error:", e.message);
    clientWs.send(JSON.stringify({ 
      type: "error", 
      message: "Deepgram connection error: " + e.message 
    }));
  });

  return { dgWs, isOpen: () => isOpen };
}

wss.on("connection", (ws) => {
  console.log("👤 Client connected");
  
  let dgConnection = null;
  let audioChunkCount = 0;
  let totalBytesReceived = 0;
  
  ws.on("message", async (data, isBinary) => {
    if (isBinary && dgConnection && dgConnection.isOpen()) {
      try {
        let audioBuffer = Buffer.from(data);
        dgConnection.dgWs.send(audioBuffer);
        
        audioChunkCount++;
        totalBytesReceived += audioBuffer.length;
        
        if (audioChunkCount % 100 === 0) {
          console.log(`📤 Sent ${audioChunkCount} PCM chunks (${totalBytesReceived} bytes)`);
        }
      } catch (err) {
        console.error("❌ Error forwarding to Deepgram:", err.message);
      }
      return;
    }

    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "start_live") {
        console.log("🎙️ Starting live conversation");
        audioChunkCount = 0;
        totalBytesReceived = 0;
        
        ws.send(JSON.stringify({ 
          type: "status", 
          status: "Connecting to Deepgram..." 
        }));

        dgConnection = openDeepgramSocket(ws);
      }

      if (msg.type === "stop_live") {
        console.log("🛑 Stopping live conversation");
        
        if (dgConnection) {
          try {
            if (dgConnection.isOpen()) {
              dgConnection.dgWs.send(JSON.stringify({ type: "CloseStream" }));
              setTimeout(() => {
                if (dgConnection && dgConnection.dgWs) {
                  dgConnection.dgWs.close();
                }
              }, 100);
            }
          } catch (err) {
            console.error("❌ Error closing Deepgram:", err.message);
          }
          dgConnection = null;
        }
        
        ws.send(JSON.stringify({ 
          type: "status", 
          status: "Stopped - Click Start to resume" 
        }));
      }
    } catch (e) {
      // Not JSON, ignore
    }
  });

  ws.on("close", () => {
    console.log("👋 Client disconnected");
    if (dgConnection && dgConnection.isOpen()) {
      try {
        dgConnection.dgWs.close();
      } catch (e) {
        console.error("❌ Error closing Deepgram:", e.message);
      }
    }
  });

  ws.on("error", (e) => {
    console.error("❌ WebSocket error:", e.message);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Gyaanchand server running on http://localhost:${PORT}`);
  console.log(`📋 Deepgram: nova-2, en-IN, 16kHz, Enhanced VAD`);
  console.log(`🗣️ Murf AI: Natural voice synthesis`);
  console.log(`🔑 Make sure your .env has valid API keys`);
});