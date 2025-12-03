// backend/asr.js
const axios = require("axios");

async function transcribeAudio(buffer) {
  try {
    const resp = await axios.post(
      "https://api.deepgram.com/v1/listen?model=nova-2&language=en-IN&punctuate=true",
      buffer,
      {
        headers: {
          "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": "audio/webm; codecs=opus"
        }
      }
    );

    return resp.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  } catch (err) {
    console.error("ASR Error:", err.response?.data || err.message);
    return "";
  }
}

module.exports = transcribeAudio;