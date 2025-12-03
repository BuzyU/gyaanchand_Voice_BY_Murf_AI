// Connect to production backend on Render
const WS_URL = window.location.hostname === "localhost"
  ? "ws://localhost:5000"  // Local development
  : "wss://gyaanchand-voice-ai.onrender.com";  // Production

const ws = new WebSocket(WS_URL);
ws.binaryType = "arraybuffer";

console.log("🚀 Gyaanchand Voice Client - Fixed Audio");

const statusBox = document.getElementById("status");
const liveBtn = document.getElementById("liveBtn");
const transcriptDiv = document.getElementById("transcript");
const replyDiv = document.getElementById("reply");
const audioElement = document.getElementById("audio");

let audioContext = null;
let audioWorkletNode = null;
let mediaStream = null;
let liveMode = false;

// Simple: Just store the complete audio blob
let currentAudioBlob = null;

// AudioWorklet processor code
const audioProcessorCode = `
class AudioProcessor extends AudioWorkletProcessor {
  float32ToInt16(float32Array) {
    const int16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      let val = Math.max(-1, Math.min(1, float32Array[i]));
      int16[i] = val < 0 ? val * 0x8000 : val * 0x7FFF;
    }
    return int16;
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0 && input[0]) {
      const pcmData = this.float32ToInt16(input[0]);
      this.port.postMessage({ audio: pcmData.buffer }, [pcmData.buffer]);
    }
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
`;

// Play audio using simple HTML5 audio element
function playAudio(audioBlob) {
  try {
    const url = URL.createObjectURL(audioBlob);
    
    audioElement.src = url;
    audioElement.load();
    
    audioElement.onloadeddata = () => {
      console.log("🔊 Audio loaded, playing...");
      audioElement.play().catch(err => {
        console.error("❌ Play error:", err);
      });
    };
    
    audioElement.onended = () => {
      URL.revokeObjectURL(url);
      console.log("✅ Playback complete");
    };
    
    audioElement.onerror = (e) => {
      console.error("❌ Audio error:", e);
      URL.revokeObjectURL(url);
    };
    
  } catch (err) {
    console.error("❌ Playback error:", err);
  }
}

// WebSocket handlers
ws.onopen = () => {
  console.log("🔌 Connected");
  statusBox.innerText = "Connected - Ready to start";
  statusBox.className = "status-box connected";
};

ws.onclose = () => {
  console.log("🔌 Disconnected");
  statusBox.innerText = "Disconnected";
  statusBox.className = "status-box disconnected";
};

ws.onerror = (e) => {
  console.error("WebSocket error:", e);
  statusBox.innerText = "Connection error";
  statusBox.className = "status-box error";
};

ws.onmessage = async (evt) => {
  // Handle JSON messages
  if (typeof evt.data === "string") {
    let msg;
    try { 
      msg = JSON.parse(evt.data); 
    } catch { 
      return; 
    }

    if (msg.type === "status") {
      statusBox.innerText = msg.status;
      
      if (msg.status.includes("Listening") || msg.status.includes("Ready")) {
        statusBox.className = "status-box listening";
      } else if (msg.status.includes("Thinking")) {
        statusBox.className = "status-box thinking";
      } else if (msg.status.includes("Speaking")) {
        statusBox.className = "status-box speaking";
        currentAudioBlob = null;
      } else {
        statusBox.className = "status-box";
      }
    }

    if (msg.type === "transcript") {
      const displayText = msg.text.trim();
      if (displayText) {
        if (msg.isFinal) {
          transcriptDiv.innerHTML = `<div class="transcript-final"><strong>You:</strong> ${displayText}</div>` + transcriptDiv.innerHTML;
        } else {
          const existingPartial = transcriptDiv.querySelector('.transcript-partial');
          if (existingPartial) {
            existingPartial.innerHTML = `${displayText}...`;
          } else {
            transcriptDiv.innerHTML = `<div class="transcript-partial">${displayText}...</div>` + transcriptDiv.innerHTML;
          }
        }
      }
    }

    if (msg.type === "reply") {
      replyDiv.innerHTML = `<div class="reply-message"><strong>Gyaanchand:</strong> ${msg.text}</div>` + replyDiv.innerHTML;
    }

    if (msg.type === "tts_end") {
      console.log("🎵 TTS complete signal received");
      if (currentAudioBlob) {
        console.log(`🔊 Playing audio (${currentAudioBlob.size} bytes)`);
        playAudio(currentAudioBlob);
        currentAudioBlob = null;
      }
    }

    if (msg.type === "error") {
      console.error("Server error:", msg.message);
      statusBox.innerText = "Error: " + msg.message;
      statusBox.className = "status-box error";
    }

    return;
  }

  // Handle binary audio (complete MP3 file)
  try {
    let arrayBuffer;
    if (evt.data instanceof ArrayBuffer) {
      arrayBuffer = evt.data;
    } else if (evt.data instanceof Blob) {
      arrayBuffer = await evt.data.arrayBuffer();
    } else {
      return;
    }
    
    // Store the complete audio
    currentAudioBlob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
    console.log(`📥 Received complete audio: ${currentAudioBlob.size} bytes`);
    
  } catch (err) {
    console.error("Audio receive error:", err);
  }
};

// Start/Stop live conversation
liveBtn.onclick = async () => {
  if (!liveMode) {
    try {
      console.log("🎤 Starting microphone...");
      
      mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000
        } 
      });

      audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      const blob = new Blob([audioProcessorCode], { type: 'application/javascript' });
      const blobURL = URL.createObjectURL(blob);

      await audioContext.audioWorklet.addModule(blobURL);
      URL.revokeObjectURL(blobURL);

      audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');

      let chunkCount = 0;
      audioWorkletNode.port.onmessage = (event) => {
        if (!liveMode || ws.readyState !== WebSocket.OPEN) return;
        ws.send(event.data.audio);
        chunkCount++;
        if (chunkCount % 50 === 0) {
          console.log(`📤 Sent ${chunkCount} audio chunks`);
        }
      };

      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(audioWorkletNode);
      audioWorkletNode.connect(audioContext.destination);

      ws.send(JSON.stringify({ type: "start_live" }));

      liveBtn.innerText = "Stop";
      liveBtn.className = "btn-stop";
      liveMode = true;

      console.log("✅ Live mode started");
    } catch (e) {
      console.error("❌ Error:", e);
      alert("Could not access microphone.");
    }
  } else {
    console.log("🛑 Stopping...");
    
    liveMode = false;

    if (audioWorkletNode) {
      audioWorkletNode.disconnect();
      audioWorkletNode.port.onmessage = null;
      audioWorkletNode = null;
    }

    if (audioContext) {
      await audioContext.close();
      audioContext = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }

    ws.send(JSON.stringify({ type: "stop_live" }));

    liveBtn.innerText = "Start Live";
    liveBtn.className = "btn-start";

    console.log("✅ Stopped");
  }
};