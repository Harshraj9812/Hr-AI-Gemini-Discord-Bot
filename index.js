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

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;

    // Start typing indicator
    await message.channel.sendTyping();

    // Direct Message Response
    if (message.channel.type === ChannelType.DM && authorizedUsers.includes(message.author.id)) {
      const prompt = message.content;
      try {
        const response = await runGeminiPro(prompt, currentKeyIndex);
        apiCallCount++;
        // If the API call count reaches 60, switch to the next key
        if (apiCallCount >= 60) {
          currentKeyIndex++;
          apiCallCount = 0;
          // If the current key index exceeds the length of the keys array, reset it to 0
          if (currentKeyIndex >= geminiApiKeys.length) {
            currentKeyIndex = 0;
          }
        }
        const responseChunks = splitResponse(response);
        for (const chunk of responseChunks) {
          await message.reply(chunk);
        }
      } catch (error) {
        console.error(error);
        message.reply('there was an error trying to execute that command!');
      }
    }

    // Channel Response
    if (message.channel.type === ChannelType.GuildText) {
      if (!message.mentions.users.has(client.user.id)) return;

      const userId = message.author.id;
      const prompt = message.content;
      let localPath = null;
      let mimeType = null;

      // Check if the user has the allowed role
      if (message.member) {
        const roles = message.member.roles.cache.map(role => role.name);
        // To Check what role user have.
        // console.log(`User Roles: ${roles}`);

        const hasAllowedRole = message.member.roles.cache.some(role => role.name === allowedRole);
        if (!hasAllowedRole) {
          message.reply("You don't have the required role to use this command.");
          return;
        }
      } else {
        console.log('Message member not found.');
        return;
      }

      // Vision model
      if (message.attachments.size > 0) {
        let attachment = message.attachments.first();
        let url = attachment.url;
        mimeType = attachment.contentType;
        let filename = attachment.name;

        const supportedMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
        if (!supportedMimeTypes.includes(mimeType)) {
          console.log("Unsupported File Type: ", mimeType);
          message.reply('Unsupported image format. Supported formats are PNG, JPEG, WEBP, HEIC, and HEIF.');
          return;
        }

          // Define the path where the file will be saved
        localPath = path.join(__dirname, 'image', filename);

          // Ensure the directory exists
        fs.mkdirSync(path.dirname(localPath), { recursive: true });

          // Download the file
        let file = fs.createWriteStream(localPath);
        https.get(url, function (response) {
          response.pipe(file);
          file.on('finish', async function () {
            file.close(async () => {
                // close() is async, call runGeminiVision() here
                // Get file stats
              const stats = fs.statSync(localPath);
                // Get file size in bytes
              const fileSizeInBytes = stats.size;
                // Check if file size exceeds limit
              if (fileSizeInBytes > 3145728) {
                  // File size exceeds limit, handle accordingly
                message.reply('The provided image is too large. Please provide an image smaller than 4M');
                fs.unlink(localPath, (err) => {
                  if (err) console.error(err);
                });
              } else {
                  // File size is within limit, proceed with runGeminiVision
                try {
                    // Get the Image Extension
                    // console.log(mimeType)
                  const result = await runGeminiVision(prompt, localPath, mimeType, currentKeyIndex);
                  apiCallCount++;
                    // If the API call count reaches 60, switch to the next key
                  if (apiCallCount >= 60) {
                    currentKeyIndex++;
                    apiCallCount = 0;
                      // If the current key index exceeds the length of the keys array, reset it to 0
                    if (currentKeyIndex >= geminiApiKeys.length) {
                      currentKeyIndex = 0;
                    }
                  }
                  const responseChunks = splitResponse(result);
                  for (const chunk of responseChunks) {
                    await message.reply(chunk);
                  }
                } catch (error) {
                  console.error(error);
                  message.reply('there was an error trying to execute that command!');
                } finally {
                    // Delete the file after processing
                  fs.unlink(localPath, (err) => {
                    if (err) console.error(err);
                  });
                }
              }
            });
          });
        });
      } else {
        try {
          const result = await runGeminiPro(prompt, currentKeyIndex);
          apiCallCount++;
            // If the API call count reaches 60, switch to the next key
          if (apiCallCount >= 60) {
            currentKeyIndex++;
            apiCallCount = 0;
              // If the current key index exceeds the length of the keys array, reset it to 0
            if (currentKeyIndex >= geminiApiKeys.length) {
              currentKeyIndex = 0;
            }
          }
          const responseChunks = splitResponse(result);
          for (const chunk of responseChunks) {
            await message.reply(chunk);
          }
        } catch (error) {
          console.error(error);
          message.reply('there was an error trying to execute that command!');
        }
      }
    }
  } catch (error) {
    console.error(error);
    message.reply('there was an error trying to execute that command!');
  }
});

function splitResponse(response) {
  const maxChunkLength = 2000;
  let chunks = [];

  for (let i = 0; i < response.length; i += maxChunkLength) {
    chunks.push(response.substring(i, i + maxChunkLength));
  }
  return chunks;
}
