# 🎙️ Gyaanchand - Natural Voice AI Assistant

> **Built using Murf Falcon – the consistently fastest TTS API.**

A real-time conversational voice AI assistant powered by Murf Falcon TTS, Deepgram ASR, and Google Gemini AI. Gyaanchand features natural voice interactions, contextual memory, and seamless speech-to-speech conversations.

## ✨ Features

- **🎤 Real-time Speech Recognition** - Powered by Deepgram's Nova-2 model with Indian English support
- **🗣️ Natural Voice Synthesis** - Ultra-fast and natural-sounding speech using Murf Falcon TTS API
- **🧠 Contextual Memory** - Remembers your name, preferences, and conversation history
- **💬 Natural Conversations** - Fluid back-and-forth dialogue with minimal latency
- **🎯 Smart Intent Detection** - Understands context and responds appropriately
- **⚡ Low-latency Streaming** - Real-time audio processing with WebSocket communication

## 🎥 Demo Video

[Watch the demo video here](#) *(Add your demo video link)*

## 🏗️ Architecture

```
User Speech → Deepgram ASR → Gemini AI → Murf Falcon TTS → Audio Playback
                    ↓                                    ↑
              WebSocket Server ←─────────────────────────┘
```

### Components:
- **Frontend**: HTML5 + JavaScript with AudioWorklet API for real-time audio capture
- **Backend**: Node.js + Express + WebSocket server
- **ASR**: Deepgram Nova-2 (English-Indian, 16kHz)
- **LLM**: Google Gemini 2.0 Flash for intelligent responses
- **TTS**: Murf Falcon API with natural voice synthesis

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Microphone-enabled device
- Modern web browser (Chrome/Edge recommended)

### API Keys Required

1. **Deepgram API Key** - [Get free credits](https://deepgram.com/)
2. **Murf AI API Key** - [Sign up for 1M free characters](https://murf.ai/)
3. **Google Gemini API Key** - [Get API key](https://ai.google.dev/)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/YOUR_USERNAME/gyaanchand-voice-agent.git
cd gyaanchand-voice-agent
```

2. **Install backend dependencies**
```bash
cd backend
npm install
```

3. **Set up environment variables**

Create a `.env` file in the `backend/` directory:

```env
DEEPGRAM_API_KEY=your_deepgram_api_key_here
MURF_API_KEY=your_murf_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
PORT=5000
```

⚠️ **IMPORTANT**: Never commit your `.env` file to GitHub!

4. **Start the backend server**
```bash
npm start
```

The backend WebSocket server will start on `http://localhost:5000`

5. **Serve the frontend**

You have two options:

**Option A: Serve from Backend (Recommended)**
The backend server automatically serves the frontend from the `frontend/` directory.
Simply navigate to `http://localhost:5000`

**Option B: Serve Frontend Separately**
If you prefer to run the frontend on a different port:

```bash
# Install http-server globally (one-time only)
npm install -g http-server

# Navigate to frontend directory
cd frontend

# Start the frontend server
npx http-server -p 8080
```

Then open `http://localhost:8080` in your browser.

⚠️ **Note**: If using Option B, update the WebSocket URL in `frontend/app.js`:
```javascript
const WS_URL = "ws://localhost:5000"; // Backend WebSocket server
```

## 🎮 Usage

1. Click the **"Start Live"** button to begin the conversation
2. Allow microphone access when prompted
3. Start speaking naturally - Gyaanchand will listen and respond
4. The conversation history is displayed in real-time
5. Click **"Stop"** to end the session

### Example Conversations

- "Hi, my name is Alex" → Gyaanchand remembers your name
- "What is my name?" → Retrieves from memory
- "Tell me about artificial intelligence" → Provides intelligent response
- "What did we discuss earlier?" → Recalls previous conversation

## 🔧 Configuration

### Voice Customization

Edit `backend/ttsStream.js` to change voice settings:

```javascript
const voiceConfig = {
  voice_id: "en-US-riley",    // Voice model
  speed: 92,                   // Speech speed (80-120)
  pitch: -3,                   // Pitch adjustment (-10 to 10)
  variation: 3                 // Natural variation (1-5)
};
```

Available voices:
- `en-US-riley` - Default female voice
- `en-US-natalie` - Very natural female
- `en-US-terrell` - Smooth male
- `en-IN-kavya` - Indian English female
- `en-IN-priya` - Warm Indian English female

### ASR Configuration

Modify Deepgram settings in `backend/server.js`:

```javascript
const url = `wss://api.deepgram.com/v1/listen?` + 
  `model=nova-2&` +
  `language=en-IN&` +
  `encoding=linear16&` +
  `sample_rate=16000`;
```

## 📁 Project Structure

```
gyaanchand-voice-agent/
├── backend/
│   ├── server.js              # WebSocket server & main logic
│   ├── asr.js                 # Deepgram ASR integration
│   ├── llm.js                 # Gemini AI integration
│   ├── ttsStream.js           # Murf TTS streaming
│   ├── logic.js               # Conversation logic & memory
│   ├── nameCorrector.js       # Name recognition enhancement
│   ├── intents.js             # Intent detection
│   ├── voiceStyle.js          # Voice naturalization
│   ├── test-client.html       # Testing interface
│   ├── utils/
│   │   ├── summarizer.js      # Text summarization utilities
│   │   ├── explainer.js       # Explanation utilities
│   │   └── planner.js         # Planning utilities
│   ├── package.json           # Backend dependencies
│   └── .env                   # Environment variables (DO NOT COMMIT)
│
├── frontend/
│   ├── index.html             # Main UI interface
│   ├── styles.css             # Styling
│   ├── app.js                 # Frontend client code
│   └── audio-processor.js     # AudioWorklet processor
│
├── .gitignore                 # Git ignore rules
└── README.md                  # This file
```

## 🔐 Security Best Practices

- ✅ All API keys stored in `backend/.env` file
- ✅ `.env` added to `.gitignore`
- ✅ Environment variables loaded using `dotenv`
- ✅ No hardcoded credentials in source code
- ⚠️ Never share your API keys publicly

## 🎯 Key Technologies

- **Murf Falcon TTS** - Ultra-fast, natural voice synthesis
- **Deepgram Nova-2** - Highly accurate speech recognition
- **Google Gemini 2.0** - Advanced conversational AI
- **WebSocket** - Real-time bidirectional communication
- **AudioWorklet API** - Low-latency audio processing
- **Express.js** - Web server framework
- **Node.js** - Backend runtime

## 🧩 Backend Modules

### Core Services
- `server.js` - Main WebSocket server and request handling
- `asr.js` - Speech-to-text conversion via Deepgram
- `llm.js` - AI response generation using Gemini
- `ttsStream.js` - Text-to-speech conversion via Murf Falcon

### Intelligence Layer
- `logic.js` - Conversation flow and memory management
- `intents.js` - User intent detection and classification
- `voiceStyle.js` - Natural speech pattern generation
- `nameCorrector.js` - Indian name recognition and correction

### Utility Functions
- `utils/summarizer.js` - Content summarization
- `utils/explainer.js` - Detailed explanations
- `utils/planner.js` - Task planning assistance

## 🐛 Troubleshooting

### Microphone not working
- Ensure browser has microphone permissions
- Use HTTPS or localhost only (required for getUserMedia)
- Check if another app is using the microphone

### No audio output
- Verify browser audio is not muted
- Check console for error messages
- Ensure Murf API key is valid

### Connection issues
- Verify all API keys are correctly set in `backend/.env`
- Check if port 5000 is available (backend WebSocket server)
- If running frontend separately, ensure port 8080 is available
- Check that WebSocket URL in `app.js` points to correct backend address
- Ensure stable internet connection

### CORS or WebSocket connection errors
- If running frontend on different port, ensure backend allows CORS
- Verify WebSocket URL format: `ws://localhost:5000` (not `http://`)
- Check browser console for specific error messages

### Module not found errors
- Make sure you ran `npm install` in the `backend/` directory
- Verify all dependencies are listed in `backend/package.json`

## 📊 Performance

- **ASR Latency**: ~100-300ms
- **LLM Response**: ~500-1500ms
- **TTS Generation**: ~200-500ms
- **Total Round-trip**: ~1-2 seconds

## 🧪 Testing

### Backend Test Client
Use the included `backend/test-client.html` for development testing:

```bash
cd backend
npm start
```

Then open `http://localhost:5000/test-client.html` in your browser.

### Frontend Development Server
For frontend development with live reload:

```bash
# Terminal 1: Start backend
cd backend
npm start

# Terminal 2: Start frontend server
cd frontend
npx http-server -p 8080
```

Access the frontend at `http://localhost:8080`

## 🎓 Hackathon Details

**Competition**: Techfest 2025-26 - Murf Voice Agent Hackathon

**Built for**: Demonstrating Murf Falcon's real-time TTS capabilities in a conversational AI application

**Tags**: `murf-ai` `voice-assistant` `real-time-tts` `deepgram` `gemini-ai`

## 👨‍💻 Creator

**Umer Zingu**

## 📝 License

This project is created for the Murf Voice Agent Hackathon.

## 🙏 Acknowledgments

- Murf AI for the amazing Falcon TTS API
- Deepgram for accurate speech recognition
- Google for the Gemini AI model
- Techfest 2025-26 for organizing this hackathon

---

**Built using Murf Falcon – the consistently fastest TTS API.**

🔗 **LinkedIn Post**: [Add your LinkedIn post link here]

⭐ If you found this project interesting, please star the repository!#   g y a a n c h a n d _ V o i c e _ A I  
 