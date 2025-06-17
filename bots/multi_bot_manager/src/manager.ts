import TelegramBot from "node-telegram-bot-api";
import { JediBot } from "./bot.js";

interface BotConfig {
  userId: string;
  botToken: string;
  botName: string;
  walletAddress: string;
  selectedSide: "light" | "dark";
}

interface ActiveBot {
  config: BotConfig;
  bot: TelegramBot;
  jediBot: JediBot;
}

export class BotManager {
  private activeBots: Map<string, ActiveBot> = new Map();

  constructor() {
    console.log("🌟 Jedi Bot Manager initialized");
  }

  async createBot(config: BotConfig): Promise<void> {
    const { userId, botToken, selectedSide } = config;

    if (this.activeBots.has(userId)) {
      throw new Error(`Bot already exists for user ${userId}`);
    }

    console.log(
      `🚀 Creating Jedi bot for user ${userId} (${selectedSide} side)`
    );

    try {
      // Create Telegram bot instance
      const bot = new TelegramBot(botToken, { polling: true });

      // Create Jedi bot with OpenServ integration
      const jediBot = new JediBot(
        {
          ...config,
          openservConfig: {
            workspaceId: parseInt(process.env.JEDI_WORKSPACE_ID!), // 4440
            agentId: parseInt(process.env.JEDI_AGENT_ID!), // The comms project agent ID
          },
        },
        bot
      );

      // Store active bot
      const activeBot: ActiveBot = {
        config,
        bot,
        jediBot,
      };

      this.activeBots.set(userId, activeBot);

      // Start the bot
      await jediBot.start();

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
    await activeBot.bot.stopPolling();

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
      botName: activeBot.config.botName,
      side: activeBot.config.selectedSide,
      workspaceId: 4440,
      created: true,
    };
  }

  listActiveBots(): string[] {
    return Array.from(this.activeBots.keys());
  }
}
