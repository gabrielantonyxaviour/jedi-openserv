import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

interface UserState {
  step:
    | "idle"
    | "choosing_side"
    | "comms_name"
    | "comms_token"
    | "socials_name"
    | "socials_token"
    | "core_name"
    | "core_token"
    | "project_description" // Add this
    | "complete";
  side?: "light" | "dark";
  about?: string; // Add this
  agents: {
    comms?: { name: string; token: string };
    socials?: { name: string; token: string };
    core?: { name: string; token: string };
  };
}

class JediBot {
  private bot: TelegramBot;
  private userStates: Map<number, UserState> = new Map();

  constructor() {
    this.bot = new TelegramBot(BOT_TOKEN!, { polling: true });
    this.setupHandlers();
    console.log("🌟 Jedi Bot activated...");

    axios.post("http://localhost:4000/api/create-bot", {
      userId: 2041446422,
      commsBotToken: "7712251056:AAGmPb5ySEhw6x63UZyZIyPkMmHAt3thFNs",
      socialsBotToken: "7590163125:AAFBxacDGbQ1b9FYeqD-NK813PMRK_SwZY0",
      coreBotToken: "7966730123:AAHCJO_eJwabWySuBjAT0TWgk1JD4fYxbvw",
      commsBotName: "lknk",
      socialsBotName: "bjjkbn",
      coreBotName: "jlnolkn",
      walletAddress: "0x0000000000000000000000000000000000000000",
      selectedSide: "dark",
      about:
        "Jedi is your AI co-founder built for developers—an intelligent partner that helps you brainstorm ideas, write code, debug, and ship faster. From MVP to scale, Jedi works beside you like a true teammate, turning your thoughts into product with clarity, speed, and precision.",
    });
  }

  private setupHandlers() {
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id!;

      this.userStates.set(userId, { step: "choosing_side", agents: {} });

      const welcomeMessage = `⭐️ *WELCOME TO JEDI* ⭐️

      Create the only AI co-founder you ever need.

╭─────────────────────╮
│  🌌 Choose Your Path 🌌  │
╰─────────────────────╯

The Force flows through two paths.

Choose wisely, young Padawan.`;

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "🔵 Light Side - Path of the Jedi",
              callback_data: "side_light",
            },
          ],
          [
            {
              text: "🔴 Dark Side - Path of the Sith",
              callback_data: "side_dark",
            },
          ],
        ],
      };

      this.bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    });

    this.bot.on("callback_query", (query) => {
      const chatId = query.message?.chat.id!;
      const userId = query.from.id;
      const data = query.data!;

      this.bot.answerCallbackQuery(query.id);
      this.handleCallback(chatId, userId, data);
    });

    this.bot.on("message", (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id!;
      const text = msg.text?.trim();

      if (!text || text.startsWith("/")) return;

      const state = this.userStates.get(userId);
      if (!state) return;

      this.handleTextInput(chatId, userId, text, state);
    });
  }

  private handleCallback(chatId: number, userId: number, data: string) {
    const state = this.userStates.get(userId);
    if (!state) return;

    if (data.startsWith("side_")) {
      const side = data.split("_")[1] as "light" | "dark";
      state.side = side;
      state.step = "comms_name";
      this.userStates.set(userId, state);

      this.showSideConfirmation(chatId, side);
    }
  }

  private showSideConfirmation(chatId: number, side: "light" | "dark") {
    const isLight = side === "light";
    const sideEmoji = isLight ? "🔵" : "🔴";
    const sideName = isLight ? "LIGHT SIDE" : "DARK SIDE";
    const description = isLight
      ? "✨ Wisdom • Compassion • Peace\n🧙‍♂️ Noble Jedi Masters guide your journey"
      : "⚡ Power • Efficiency • Control\n👤 Dark Sith Lords command your empire";

    const message = `${sideEmoji} *${sideName} CHOSEN!* ${sideEmoji}

╭─────────────────────╮
│     ${description}     │
╰─────────────────────╯

🤖 *AGENT SETUP -  1/3*

💬 **Setup the Commander of Comms**
━━━━━━━━━━━━━━━━━━━━━━━━

Name of the Commander of Comms:`;

    this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  private handleTextInput(
    chatId: number,
    userId: number,
    text: string,
    state: UserState
  ) {
    switch (state.step) {
      case "comms_name":
        state.agents.comms = { name: text, token: "" };
        state.step = "comms_token";
        this.userStates.set(userId, state);

        const commsMessage = `✅ *Welcome, ${text}. Commander of Comms!*

💬 **Your bot** is ready for configuration

  🔑 Now enter the Telegram Bot Token for your bot:`;

        this.bot.sendMessage(chatId, commsMessage, { parse_mode: "Markdown" });
        break;

      case "comms_token":
        if (this.isValidBotToken(text)) {
          state.agents.comms!.token = text;
          state.step = "socials_name";
          this.userStates.set(userId, state);
          this.showSocialsSetup(chatId);
        } else {
          this.showTokenError(chatId);
        }
        break;

      case "socials_name":
        state.agents.socials = { name: text, token: "" };
        state.step = "socials_token";
        this.userStates.set(userId, state);

        const socialsMessage = `✅ *Welcome, ${text}. Commander of Socials!*

💬 **Your bot** is ready for configuration

  🔑 Now enter the Telegram Bot Token for your bot:`;

        this.bot.sendMessage(chatId, socialsMessage, {
          parse_mode: "Markdown",
        });
        break;

      case "socials_token":
        if (this.isValidBotToken(text)) {
          state.agents.socials!.token = text;
          state.step = "core_name";
          this.userStates.set(userId, state);
          this.showCoreSetup(chatId);
        } else {
          this.showTokenError(chatId);
        }
        break;

      case "core_name":
        state.agents.core = { name: text, token: "" };
        state.step = "core_token";
        this.userStates.set(userId, state);

        const coreMessage = `✅ *Welcome, ${text}. Commander of Core!*

💬 **Your bot** is ready for configuration

  🔑 Now enter the Telegram Bot Token for your bot:`;

        this.bot.sendMessage(chatId, coreMessage, { parse_mode: "Markdown" });
        break;

      case "core_token":
        if (this.isValidBotToken(text)) {
          state.agents.core!.token = text;
          state.step = "project_description"; // Changed from "complete"
          this.userStates.set(userId, state);
          this.showProjectDescription(chatId);
        } else {
          this.showTokenError(chatId);
        }
        break;

      case "project_description": // Add this case
        state.about = text;
        state.step = "complete";
        this.userStates.set(userId, state);
        this.showCompletion(chatId, userId, state);
        break;
    }
  }

  private showProjectDescription(chatId: number) {
    const message = `🎉 *Commander of Core Operations is ready!*
  
  🤖 *FINAL STEP*
  
  📝 **Describe Your Project**
  ━━━━━━━━━━━━━━━━━━━━━━━━
  
  Tell us about your project - what does it do, what's the vision?
  
  This will help your commanders understand their mission:`;

    this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  private showSocialsSetup(chatId: number) {
    const message = `🎉 *Commander of Comms is ready!*

🤖 *AGENT SETUP - STEP 2/3*

� **Setup the Commander of Socials**
━━━━━━━━━━━━━━━━━━━━━━━━

Name of the Commander of Socials:`;

    this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  private showCoreSetup(chatId: number) {
    const message = `🎉 *Commander of Socials is ready!*

🤖 *AGENT SETUP -  3/3*

� **Setup the Commander of Core Operations**
━━━━━━━━━━━━━━━━━━━━━━━━

Name of the Commander of Core Operations:`;

    this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  private showTokenError(chatId: number) {
    const message = `❌ *Invalid Bot Token Format*

🔍 **Expected Format:**
\`123456789:ABCdefGHIjklMNOpqrsTUVwxyz\`

💡 **How to get a bot token:**
1. Message @BotFather on Telegram
2. Use /newbot command
3. Follow the instructions
4. Copy the token it gives you

Please try again:`;

    this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  private isValidBotToken(token: string): boolean {
    return /^\d+:[A-Za-z0-9_-]+$/.test(token);
  }

  private async showCompletion(
    chatId: number,
    userId: number,
    state: UserState
  ) {
    const sideEmoji = state.side === "light" ? "🔵" : "🔴";
    const sideName = state.side === "light" ? "LIGHT SIDE" : "DARK SIDE";

    const completionMessage = `🌟 *SETUP COMPLETE!* 🌟

╭─────────────────────╮
│  🎉 AGENTS ACTIVATED! 🎉  │
╰─────────────────────╯

${sideEmoji} **Path:** ${sideName}

🤖 **YOUR COMMANDERS:**

💬 **${state.agents.comms!.name}**
   └ Commander of Comms Ready

📱 **${state.agents.socials!.name}**
   └ Commander of Socials Ready

⚡ **${state.agents.core!.name}**
   └ Commander of Core Operations Ready

━━━━━━━━━━━━━━━━━━━━━━━━
✨ *All systems operational*
🚀 *Ready to serve your empire*
━━━━━━━━━━━━━━━━━━━━━━━━

*May the Force be with you... always.*`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "🔄 Setup New Empire",
            callback_data: "restart",
          },
        ],
      ],
    };

    console.log({
      userId: userId,
      commsBotToken: state.agents.comms!.token,
      socialsBotToken: state.agents.socials!.token,
      coreBotToken: state.agents.core!.token,
      commsBotName: state.agents.comms!.name,
      socialsBotName: state.agents.socials!.name,
      coreBotName: state.agents.core!.name,
      walletAddress: "0x0000000000000000000000000000000000000000",
      selectedSide: state.side,
      about: state.about,
    });
    const response = await axios.post("http://localhost:4000/api/create-bot", {
      userId: userId.toString(),
      commsBotToken: state.agents.comms!.token,
      socialsBotToken: state.agents.socials!.token,
      coreBotToken: state.agents.core!.token,
      commsBotName: state.agents.comms!.name,
      socialsBotName: state.agents.socials!.name,
      coreBotName: state.agents.core!.name,
      walletAddress: "0x0000000000000000000000000000000000000000",
      selectedSide: state.side,
      about: state.about,
    });

    console.log(response.data);

    this.bot.sendMessage(chatId, completionMessage, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });

    // Log configuration
    console.log(`✅ User ${chatId} completed setup:`, {
      side: state.side,
      agents: {
        comms: {
          name: state.agents.comms!.name,
          token: state.agents.comms!.token.substring(0, 10) + "...",
        },
        socials: {
          name: state.agents.socials!.name,
          token: state.agents.socials!.token.substring(0, 10) + "...",
        },
        core: {
          name: state.agents.core!.name,
          token: state.agents.core!.token.substring(0, 10) + "...",
        },
      },
    });
  }
}

new JediBot();
