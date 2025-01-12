# Hr-AI Discord Bot 🤖

Hr-AI is a Discord bot powered by Google's Gemini AI. It supports multi-API key usage, conversation history tracking, and image processing.

## Features ✨

- **Gemini AI Integration**: Uses Google's Gemini AI for text and image processing.
- **Multi-API Key Support**: Rotates through multiple API keys for load balancing.
- **Conversation History Tracking**: Maintains conversation history for contextual responses.
- **DM and Server Channel Support**: Responds to both direct messages and server channel messages.
- **Message Chunking**: Splits long responses into Discord-friendly chunks.
- **Role-Based Access Control**: Restricts bot usage based on user roles and authorized channels.

## Setup 🛠️

### Prerequisites 📋

- Node.js
- Docker (for building and deploying the bot)

### Installation 📦

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/Hr-AI-Discord-Bot.git
   cd Hr-AI-Discord-Bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and add your configuration:
   ```properties
   DISCORD_TOKEN=your_discord_token
   GEMINI_API_KEYS=your_gemini_api_keys_comma_separated
   ROLE=AI
   AUTHORIZED_USERS=your_authorized_user_ids_comma_separated
   AUTHORIZED_CHANNELS=your_authorized_channel_ids_comma_separated
   ```

### Running the Bot 🚀

To start the bot, run:
```bash
node index.js
```

### Docker Deployment 🐳

1. Pull the Docker image:
   ```bash
   docker pull harshraj9812/hr-ai-gemini-discord-bot:latest
   ```

2. Run the Docker container:
   ```bash
   docker run -d --name hr-ai-discord-bot --env-file .env harshraj9812/hr-ai-gemini-discord-bot:latest
   ```

### Docker Compose 🐙

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  hr-ai-discord-bot:
    image: harshraj9812/hr-ai-gemini-discord-bot:latest
    environment:
      - DISCORD_TOKEN=${DISCORD_TOKEN}
      - GEMINI_API_KEYS=${GEMINI_API_KEYS}
      - ROLE=${ROLE}
      - AUTHORIZED_USERS=${AUTHORIZED_USERS}
      - AUTHORIZED_CHANNELS=${AUTHORIZED_CHANNELS}
    restart: unless-stopped
```

To start the bot using Docker Compose, run:
```bash
docker-compose up -d
```

### GitHub Actions ⚙️

The project includes a GitHub Actions workflow to automate Docker image building and pushing. The workflow is triggered on pushes to the `main` branch.

### Usage 💬

- **Direct Messages**: The bot responds to authorized users in direct messages.
- **Server Channels**: The bot responds to mentions in authorized channels and checks for the required role.

### Contributing 🤝

Contributions are welcome! Please fork the repository and create a pull request with your changes.

### License 📄

This project is licensed under the MIT License.