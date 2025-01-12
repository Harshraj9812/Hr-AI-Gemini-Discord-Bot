require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const fs = require("fs");
const path = require('path');
const https = require('https');
const { runGeminiPro, runGeminiVision, geminiApiKeys } = require('./gemini.js');

let apiCallCount = 0; // keep track of how many times we've used the API
let currentKeyIndex = 0; // keep track of which key we're using

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers // Ensure this intent is included
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
});

client.login(process.env.DISCORD_TOKEN);

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Getting Authorize User from .ENV
const allowedRole = process.env.ROLE
const authorizedUsers = process.env.AUTHORIZED_USERS.split(',');
// const authorizedChannels = process.env.AUTHORIZED_CHANNELS.split(',');

// Message history storage - key: channelId+userId, value: array of messages
const messageHistory = new Map();
const MAX_HISTORY = 10; // Maximum number of messages to remember per user/channel

// Update message history structure
function updateMessageHistory(userId, channelId, role, parts) {
  const key = `${channelId}-${userId}`;
  if (!messageHistory.has(key)) {
    messageHistory.set(key, []);
  }
  
  const history = messageHistory.get(key);
  history.push({ role: role === 'assistant' ? 'model' : 'user', parts });
  
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
  
  return history;
}

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;

    if (message.content.toLowerCase() === '!history') {
      const key = `${message.channel.id}-${message.author.id}`;
      const history = messageHistory.get(key) || [];
      
      if (history.length === 0) {
        await message.reply('No message history found.');
        return;
      }

      const formattedHistory = history.map((msg, index) => 
        `${index + 1}. ${msg.role}: ${msg.parts.substring(0, 100)}${msg.parts.length > 100 ? '...' : ''}`
      ).join('\n');

      await message.reply(`**Last ${history.length} messages:**\n${formattedHistory}`);
      return;
    }

    // Inside messageCreate event handler
    if (message.channel.type === ChannelType.DM && authorizedUsers.includes(message.author.id)) {
      const history = updateMessageHistory(message.author.id, message.channel.id, 'user', message.content);
      const promptWithHistory = {
        history: history,
        current: message.content
      };

      try {
        const response = await runGeminiPro(promptWithHistory, currentKeyIndex);
        updateMessageHistory(message.author.id, message.channel.id, 'assistant', response);
        
        // Split response and send chunks with typing indicators
        const chunks = splitResponse(response);
        for (const chunk of chunks) {
          await message.channel.sendTyping();
          await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay
          await message.reply(chunk);
        }
      } catch (error) {
        console.error(error);
        await message.reply('Error processing your request.');
      }
    }

    // For Guild Text channels
    if (message.channel.type === ChannelType.GuildText) {
      if (!message.mentions.users.has(client.user.id)) return;
      
      const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();
      const history = updateMessageHistory(message.author.id, message.channel.id, "user", prompt);
      const promptWithHistory = {
        history: history,
        current: prompt
      };

      try {
        await message.channel.sendTyping();
        const result = await runGeminiPro(promptWithHistory, currentKeyIndex);
        updateMessageHistory(message.author.id, message.channel.id, "assistant", result);
        
        const chunks = splitResponse(result);
        for (const chunk of chunks) {
          await message.channel.sendTyping();
          await new Promise(resolve => setTimeout(resolve, 1000));
          await message.reply(chunk);
        }
      } catch (error) {
        console.error(error);
        await message.reply('Error processing your request.');
      }
    }
  } catch (error) {
    console.error('Error:', error);
    await message.reply('Sorry, there was an error processing your request.');
  }
});

function splitResponse(response) {
  const maxChunkLength = 1900; // Buffer for formatting
  const chunks = [];
  
  // Split into sentences first
  const sentences = response.match(/[^.!?]+[.!?]+/g) || [response];
  
  let currentChunk = '';
  for (const sentence of sentences) {
    // If adding this sentence exceeds limit, push current chunk and start new one
    if (currentChunk.length + sentence.length > maxChunkLength) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += sentence + ' ';
  }
  
  // Push remaining text
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  // Add part indicators if multiple chunks
  return chunks.map((chunk, index, array) => 
    array.length > 1 ? `[Part ${index + 1}/${array.length}]\n${chunk}` : chunk
  );
}