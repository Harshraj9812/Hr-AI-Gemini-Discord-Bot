/**
 * Hr-AI Discord Bot
 * Features:
 * - Gemini AI Integration with multi-API key support
 * - Conversation history tracking
 * - DM and Server channel support
 * - Message chunking for long responses
 * - Role-based access control
 */

// External dependencies
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const fs = require("fs");
const path = require('path');
const https = require('https');
const { runGeminiPro, runGeminiVision, geminiApiKeys } = require('./gemini.js');

// API key rotation counters
let apiCallCount = 0;     // Tracks total API calls for load balancing
let currentKeyIndex = 0;  // Index of current API key in rotation

/**
 * Discord client configuration
 * Sets up required permissions and partial structures for the bot
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,         // Required for server interaction
    GatewayIntentBits.GuildMessages,  // Read/send messages in servers
    GatewayIntentBits.MessageContent, // View message content
    GatewayIntentBits.DirectMessages, // Handle DM conversations
    GatewayIntentBits.GuildMembers    // Access member permissions
  ],
  partials: [
    Partials.Message,   // Handle message edits/deletes
    Partials.Channel,   // Access DM channels
    Partials.Reaction   // Handle message reactions
  ]
});

// Initialize bot connection
client.login(process.env.DISCORD_TOKEN);

// Bot startup confirmation
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

/**
 * Authorization Settings
 * ROLE: Discord role ID required to use bot
 * AUTHORIZED_USERS: Comma-separated list of user IDs
 */
const allowedRole = process.env.ROLE;
const authorizedUsers = process.env.AUTHORIZED_USERS.split(',');

/**
 * Message history tracking system
 * @type {Map<string, Array>} - Stores conversation history
 * Key format: channelId-userId
 * Value: Array of message objects {role, parts}
 */
const messageHistory = new Map();
const MAX_HISTORY = 5; // Maximum messages per conversation

/**
 * Updates conversation history for a user/channel pair
 * @param {string} userId - Discord user's ID
 * @param {string} channelId - Channel where message occurred 
 * @param {string} role - Either 'user' or 'assistant'
 * @param {string} parts - Message content
 * @returns {Array} Updated conversation history
 */
function updateMessageHistory(userId, channelId, role, parts) {
  const key = `${channelId}-${userId}`;
  if (!messageHistory.has(key)) {
    messageHistory.set(key, []);
  }
  
  const history = messageHistory.get(key);
  history.push({ role: role === 'assistant' ? 'model' : 'user', parts });
  
  // Maintain history size limit
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
  
  return history;
}

/**
 * Validates user permissions based on role and channel access
 * @param {object} message - Discord message object
 * @returns {boolean} - True if user has permission, false otherwise
 */
function hasPermission(message) {
  // 1. Super users always have access
  if (authorizedUsers.includes(message.author.id)) {
    return true;
  }

  // 2. DM Channel Check
  if (message.channel.type === ChannelType.DM) {
    return false; // Only authorized users can DM
  }

  // 3. Guild Channel Checks
  if (message.channel.type === ChannelType.GuildText) {
    // Channel restriction check
    if (process.env.AUTHORIZED_CHANNELS) {
      const authorizedChannels = process.env.AUTHORIZED_CHANNELS.split(',');
      if (!authorizedChannels.includes(message.channel.id)) {
        return false;
      }
    }

    // Role check
    const hasRole = message.member.roles.cache.some(role => 
      role.name === process.env.ROLE || role.id === process.env.ROLE
    );

    return hasRole;
  }

  return false; // Default deny for unknown channel types
}

/**
 * Main message event handler
 * Processes: 
 * - History commands
 * - DM messages
 * - Server channel messages
 * Includes typing indicators and chunked responses
 */
client.on('messageCreate', async (message) => {
  try {
    // Ignore bot messages
    if (message.author.bot) return;

    // For DM channels - only allow authorized users
    if (message.channel.type === ChannelType.DM) {
      if (!authorizedUsers.includes(message.author.id)) {
        // console.log(`Unauthorized DM from user: ${message.author.id}`);
        await message.reply("⚠️ You are not authorized to use this bot in DMs.");
        return;
      }
    }

    // For Guild channels - check mentions, roles and channel permissions
    if (message.channel.type === ChannelType.GuildText) {
      // Only respond to mentions
      if (!message.mentions.users.has(client.user.id)) return;

      // Check channel authorization
      if (process.env.AUTHORIZED_CHANNELS) {
        const authorizedChannels = process.env.AUTHORIZED_CHANNELS.split(',');
        if (!authorizedChannels.includes(message.channel.id)) {
          // console.log(`Unauthorized channel: ${message.channel.id}`);
          await message.reply("⚠️ Bot is not authorized in this channel.");
          return;
        }
      }

      // Check role authorization
      if (!authorizedUsers.includes(message.author.id)) {
        const hasRole = message.member?.roles.cache.some(role => 
          role.name === process.env.ROLE || role.id === process.env.ROLE
        );
        
        if (!hasRole) {
          // console.log(`User ${message.author.id} missing required role`);
          await message.reply(`⚠️ You need the ${process.env.ROLE} role to use this bot.`);
          return;
        }
      }
    }

    // Continue with existing message processing
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
      let typingInterval;
      try {
        // Start continuous typing animation
        typingInterval = setInterval(() => {
          message.channel.sendTyping();
        }, 5000); // Discord typing lasts ~10s, refresh every 5s

        const history = updateMessageHistory(message.author.id, message.channel.id, 'user', message.content);
        const promptWithHistory = {
          history: history,
          current: message.content
        };

        const response = await runGeminiPro(promptWithHistory, currentKeyIndex);
        updateMessageHistory(message.author.id, message.channel.id, 'assistant', response);
        
        // Clear typing interval
        clearInterval(typingInterval);
        
        const chunks = splitResponse(response);
        for (const chunk of chunks) {
          await message.reply(chunk);
          await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause between chunks
        }
      } catch (error) {
        clearInterval(typingInterval);
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

/**
 * Splits long responses into Discord-friendly chunks
 * @param {string} response - Full AI response
 * @returns {Array<string>} Array of message chunks
 * Features:
 * - Splits on sentence boundaries
 * - Respects Discord's 2000 char limit
 * - Adds part numbers for multi-chunk messages
 */
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