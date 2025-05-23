require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');

const geminiApiKeys = process.env.GEMINI_API_KEYS.split(',');

// For text-only input, use the gemini-pro model
async function runGeminiPro(prompt, index) {
  const genAI = new GoogleGenerativeAI(geminiApiKeys[index]);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-lite",
    system_instruction: "You are Hr AI, a helpful Discord bot made by Harsh Raj. You have access to chat history and should use it to provide contextual responses."
  });

  // Start chat
  const chat = model.startChat();
  
  // Send message with history if available
  let result;
  if (Array.isArray(prompt)) {
    // Handle history array format
    for (const message of prompt) {
      if (message.role === 'user') {
        result = await chat.sendMessage(message.parts);
      }
    }
  } else if (typeof prompt === 'object' && prompt.history) {
    // Send previous messages to establish context
    for (const historyMsg of prompt.history) {
      await chat.sendMessage(historyMsg.parts);
    }
    // Send current message
    result = await chat.sendMessage(prompt.current);
  } else {
    // Handle simple text prompt
    result = await chat.sendMessage(prompt);
  }
  
  const response = await result.response;
  return response.text();
}

// Converts local file information to a GoogleGenerativeAI.Part object.
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}

// For text and image input, use the gemini-pro-vision model
async function runGeminiVision(prompt, imageData, mimeType, index) {
  const genAI = new GoogleGenerativeAI(geminiApiKeys[index]);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const imagePart = {
    inlineData: {
      data: imageData.toString('base64'),
      mimeType: mimeType
    }
  };

  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;
  return response.text();
}

module.exports = { runGeminiPro, runGeminiVision };