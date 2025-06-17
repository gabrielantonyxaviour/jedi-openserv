import TelegramBot from "node-telegram-bot-api";
import { JediBot } from "./bot.js";

interface BotConfig {
  userId: string;
  commsBotToken: string;
  socialsBotToken: string;
  coreBotToken: string;
  commsBotName: string;
  socialsBotName: string;
  coreBotName: string;
  walletAddress: string;
  selectedSide: "light" | "dark";
}

interface ActiveBot {
  config: BotConfig;
  commsBot: TelegramBot;
  jediCommsBot: JediBot;
  socialsBot: TelegramBot;
  jediSocialsBot: JediBot;
  coreBot: TelegramBot;
  jediCoreBot: JediBot;
}

export class BotManager {
  private activeBots: Map<string, ActiveBot> = new Map();
  private nonce: number = 0;

  constructor() {
    console.log("🌟 Jedi Bot Manager initialized");
  }

  async createBot(config: BotConfig): Promise<void> {
    const {
      userId,
      commsBotName,
      socialsBotName,
      coreBotName,
      commsBotToken,
      socialsBotToken,
      coreBotToken,
      walletAddress,
      selectedSide,
    } = config;

    if (this.activeBots.has(userId)) {
      throw new Error(`Bot already exists for user ${userId}`);
    }

    console.log(
      `🚀 Creating Jedi bot for user ${userId} (${selectedSide} side)`
    );

    try {
      // Create Telegram bot instance
      const commsTelegramBot = new TelegramBot(commsBotToken, {
        polling: true,
      });

      const socialsTelegramBot = new TelegramBot(socialsBotToken, {
        polling: true,
      });

      const coreTelegramBot = new TelegramBot(coreBotToken, { polling: true });

      const jediCommsBot = new JediBot(
        {
          nonce: this.nonce,
          userId: userId,
          botName: commsBotName,
          kind: "comms",
          walletAddress,
          selectedSide,
        },
        commsTelegramBot
      );
      const jediSocialsBot = new JediBot(
        {
          nonce: this.nonce + 1,
          userId: userId,
          botName: socialsBotName,
          kind: "socials",
          walletAddress,
          selectedSide,
        },
        socialsTelegramBot
      );
      const jediCoreBot = new JediBot(
        {
          nonce: this.nonce + 2,
          userId: userId,
          botName: coreBotName,
          kind: "core",
          walletAddress,
          selectedSide,
        },
        coreTelegramBot
      );

      // Store active bot
      const activeBot: ActiveBot = {
        config,
        commsBot: commsTelegramBot,
        jediCommsBot,
        socialsBot: socialsTelegramBot,
        jediSocialsBot: jediSocialsBot,
        coreBot: coreTelegramBot,
        jediCoreBot: jediCoreBot,
      };

      this.activeBots.set(userId, activeBot);

      // Start the bot
      await jediCommsBot.start();
      await jediSocialsBot.start();
      await jediCoreBot.start();

      console.log(
        `✅ Jedi bot created for user ${userId} with ${selectedSide} side`
      );
    } catch (error) {
      console.error(`❌ Failed to create bot for user ${userId}:`, error);
      throw error;
    }
  }

  async removeBot(userId: string): Promise<void> {
    const activeBot = this.activeBots.get(userId);

    if (!activeBot) {
      throw new Error(`No bot found for user ${userId}`);
    }

    console.log(`🛑 Removing bot for user ${userId}`);

    // Stop Telegram polling
    await activeBot.commsBot.stopPolling();
    await activeBot.socialsBot.stopPolling();
    await activeBot.coreBot.stopPolling();

    // Remove from active bots
    this.activeBots.delete(userId);

    console.log(`✅ Bot removed for user ${userId}`);
  }

  getBotStatus(userId: string): any {
    const activeBot = this.activeBots.get(userId);

    if (!activeBot) {
      return { status: "inactive" };
    }

    return {
      status: "active",
      commsBotName: activeBot.config.commsBotName,
      socialsBotName: activeBot.config.socialsBotName,
      coreBotName: activeBot.config.coreBotName,
      side: activeBot.config.selectedSide,
      workspaceId: process.env.WORKSPACE_ID,
      created: true,
    };
  }

  listActiveBots(): string[] {
    return Array.from(this.activeBots.keys());
  }
}
