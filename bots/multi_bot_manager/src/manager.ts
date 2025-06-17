import TelegramBot from "node-telegram-bot-api";
import { Agent } from "@openserv-labs/sdk";
import { JediBot } from "./bot";
import { CHARACTERS } from "./character";

interface BotConfig {
  userId: string;
  botToken: string;
  botName: string;
  walletAddress: string;
  selectedSide: "light" | "dark";
  openservConfig: {
    apiKey: string;
    workspaceId: number;
    agentIds: {
      comms: number;
      community: number;
      business: number;
      core: number;
    };
  };
}

interface ActiveBot {
  config: BotConfig;
  bot: TelegramBot;
  jediBot: JediBot;
  agents: {
    comms: Agent;
    community: Agent;
    business: Agent;
    core: Agent;
  };
}

export class BotManager {
  private activeBots: Map<string, ActiveBot> = new Map();
  private basePort = 8000;

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

      // Create OpenServ agents based on selected side
      const agents = await this.createAgents(config, selectedSide);

      // Create Jedi bot wrapper
      const jediBot = new JediBot(config, bot, agents);

      // Store active bot
      const activeBot: ActiveBot = {
        config,
        bot,
        jediBot,
        agents,
      };

      this.activeBots.set(userId, activeBot);

      // Start the bot
      await jediBot.start();

      console.log(
        `✅ Jedi bot created for user ${userId} with ${selectedSide} side characters`
      );
    } catch (error) {
      console.error(`❌ Failed to create bot for user ${userId}:`, error);
      throw error;
    }
  }

  private async createAgents(config: BotConfig, side: "light" | "dark") {
    const { openservConfig } = config;
    const sideCharacters = CHARACTERS[side];

    const agents = {
      comms: new Agent({
        systemPrompt: this.createSystemPrompt(sideCharacters.comms, side),
        apiKey: openservConfig.apiKey,
        port: this.basePort++,
      }),
      community: new Agent({
        systemPrompt: this.createSystemPrompt(sideCharacters.community, side),
        apiKey: openservConfig.apiKey,
        port: this.basePort++,
      }),
      business: new Agent({
        systemPrompt: this.createSystemPrompt(sideCharacters.business, side),
        apiKey: openservConfig.apiKey,
        port: this.basePort++,
      }),
      core: new Agent({
        systemPrompt: this.createSystemPrompt(sideCharacters.core, side),
        apiKey: openservConfig.apiKey,
        port: this.basePort++,
      }),
    };

    // Start all agents
    Object.values(agents).forEach((agent) => agent.start());

    return agents;
  }

  private createSystemPrompt(character: any, side: "light" | "dark"): string {
    const forceAlignment = side === "light" ? "Jedi Code" : "Sith Code";

    return `You are ${character.name}, ${character.title}.

CHARACTER: ${character.description}

PERSONALITY: ${character.personality}

GREETING: "${character.greeting}"

FORCE ALIGNMENT: You follow the ${forceAlignment} and embody the ${side} side of the Force.

ROLE: You are one of 4 AI agents serving this user in their Jedi AI system. Work collaboratively with other agents when needed.

COMMUNICATION STYLE: 
- Stay in character as ${character.name}
- Use appropriate ${side} side terminology and philosophy
- Be helpful while maintaining your unique personality
- Reference Star Wars concepts naturally but don't overdo it

CAPABILITIES: Handle requests related to your specialization while maintaining character immersion.`;
  }

  async removeBot(userId: string): Promise<void> {
    const activeBot = this.activeBots.get(userId);

    if (!activeBot) {
      throw new Error(`No bot found for user ${userId}`);
    }

    console.log(`🛑 Removing bot for user ${userId}`);

    // Stop Telegram polling
    await activeBot.bot.stopPolling();

    // Stop OpenServ agents
    Object.values(activeBot.agents).forEach((agent) => {
      // Agent doesn't have a stop method, but we can at least clean up references
    });

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
      agentCount: Object.keys(activeBot.agents).length,
      created: true,
    };
  }

  listActiveBots(): string[] {
    return Array.from(this.activeBots.keys());
  }
}
