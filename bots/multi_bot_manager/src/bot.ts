import TelegramBot from "node-telegram-bot-api";
import { Agent } from "@openserv-labs/sdk";
import { z } from "zod";
import { CHARACTERS } from "./character";

interface BotConfig {
  userId: string;
  botToken: string;
  botName: string;
  walletAddress: string;
  selectedSide: "light" | "dark";
  openservConfig: {
    workspaceId: string;
    agentIds: Record<string, string>;
  };
}

interface JediAgents {
  comms: Agent;
  community: Agent;
  business: Agent;
  core: Agent;
}

interface Character {
  name: string;
  title: string;
  image: string;
  greeting: string;
  personality: string;
}

export class JediBot {
  private config: BotConfig;
  private bot: TelegramBot;
  private agents: JediAgents;
  private userSessions: Map<number, unknown> = new Map();

  constructor(config: BotConfig, bot: TelegramBot, agents: JediAgents) {
    this.config = config;
    this.bot = bot;
    this.agents = agents;

    this.setupCapabilities();
  }

  async start(): Promise<void> {
    console.log(
      `🌟 Starting Jedi bot for ${this.config.botName} (${this.config.selectedSide} side)`
    );

    this.setupHandlers();

    console.log(`✅ Jedi bot active for user ${this.config.userId}`);
  }

  private setupCapabilities(): void {
    const side = this.config.selectedSide;
    const sideCharacters = CHARACTERS[side];

    // Add capabilities to each agent
    Object.entries(this.agents).forEach(([agentType, agent]) => {
      const character =
        sideCharacters[agentType as keyof typeof sideCharacters];

      agent.addCapabilities([
        {
          name: "respondAsCharacter",
          description: `Respond as ${character.name} to user messages`,
          schema: z.object({
            userMessage: z.string().describe("The user message to respond to"),
            context: z
              .string()
              .optional()
              .describe("Additional context for the response"),
          }),
          async run({
            args,
          }: {
            args: { userMessage: string; context?: string };
          }) {
            const { userMessage, context } = args;

            const response = await this.generateCharacterResponse(
              character,
              userMessage,
              context
            );

            return response;
          },
        },
        {
          name: "collaborateWithAgents",
          description: "Collaborate with other Jedi agents in the workspace",
          schema: z.object({
            message: z.string().describe("Message to share with other agents"),
            targetAgent: z
              .string()
              .optional()
              .describe("Specific agent to collaborate with"),
          }),
          async run({
            args,
          }: {
            args: { message: string; targetAgent?: string };
          }) {
            const { message, targetAgent } = args;

            // Send collaboration message to workspace
            await agent.sendChatMessage({
              workspaceId: this.config.openservConfig.workspaceId,
              agentId:
                this.config.openservConfig.agentIds[
                  agentType as keyof typeof this.config.openservConfig.agentIds
                ],
              message: `[${character.name}] ${message}`,
            });

            return `Collaboration message sent to ${
              targetAgent || "all agents"
            }`;
          },
        },
      ]);
    });
  }

  private setupHandlers(): void {
    const side = this.config.selectedSide;
    const sideEmoji = side === "light" ? "🔵" : "🔴";
    const sideTitle = side === "light" ? "Jedi Council" : "Sith Order";

    // Start command
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;

      const welcomeMessage = `${sideEmoji} *Welcome to ${
        this.config.botName
      }* ${sideEmoji}

🌟 Your ${sideTitle} is ready to serve!

Your AI agents are active:
${Object.entries(CHARACTERS[side])
  .map(([type, char]) => `• ${char.image} **${char.name}** - ${char.title}`)
  .join("\n")}

💰 **Wallet**: ${this.config.walletAddress.slice(
        0,
        6
      )}...${this.config.walletAddress.slice(-4)}
⚡ **Status**: All systems operational

Simply message me and your agents will respond according to your needs!

*May the Force be with you!* ⭐`;

      this.bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: "Markdown",
      });
    });

    // Agent selection commands
    this.bot.onText(/\/(comms|community|business|core)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const agentType = match![1] as keyof JediAgents;
      const character = CHARACTERS[side][agentType];

      const message = `${character.image} **${character.name}** speaking:

"${character.greeting}"

I'm ready to help with ${agentType} matters. What do you need?`;

      this.bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
      });
    });

    // General message handler
    this.bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      const userId = msg.from?.id;

      if (!text || text.startsWith("/") || !userId) return;

      try {
        // Determine which agent should respond based on message content
        const agentType = this.determineResponsibleAgent(text);
        const agent = this.agents[agentType];
        const character = CHARACTERS[side][agentType];

        // Generate response using the agent
        const response = await this.generateAgentResponse(
          agentType,
          character,
          text
        );

        const formattedResponse = `${character.image} **${character.name}**:

${response}

---
*${sideTitle} • ${
          agentType.charAt(0).toUpperCase() + agentType.slice(1)
        } Agent*`;

        this.bot.sendMessage(chatId, formattedResponse, {
          parse_mode: "Markdown",
        });
      } catch (error) {
        console.error(
          `Error handling message for ${this.config.userId}:`,
          error
        );

        this.bot.sendMessage(
          chatId,
          `${sideEmoji} *The Force is disturbed...*\n\nThere was an issue processing your request. Please try again.`
        );
      }
    });
  }

  private determineResponsibleAgent(message: string): keyof JediAgents {
    const lowerMessage = message.toLowerCase();

    // Simple keyword-based routing
    if (
      lowerMessage.includes("message") ||
      lowerMessage.includes("email") ||
      lowerMessage.includes("communicate")
    ) {
      return "comms";
    }
    if (
      lowerMessage.includes("community") ||
      lowerMessage.includes("users") ||
      lowerMessage.includes("social")
    ) {
      return "community";
    }
    if (
      lowerMessage.includes("business") ||
      lowerMessage.includes("compliance") ||
      lowerMessage.includes("legal")
    ) {
      return "business";
    }

    // Default to core operations
    return "core";
  }

  private async generateAgentResponse(
    agent: Agent,
    character: Character,
    userMessage: string
  ): Promise<string> {
    try {
      // Use the agent's capability to generate a character response
      const result = await agent.createTask("respondAsCharacter", {
        userMessage,
        context: `User is on the ${this.config.selectedSide} side with ${character.name}`,
      });

      return (
        result ||
        `I am ${character.name}. I have received your message and will assist you accordingly.`
      );
    } catch (error) {
      console.error("Error generating agent response:", error);
      return `${character.greeting}\n\nI apologize, but I'm experiencing some difficulty right now. Please try again.`;
    }
  }

  private async generateCharacterResponse(
    character: Character,
    userMessage: string,
    context?: string
  ): Promise<string> {
    // This could be enhanced with more sophisticated AI response generation
    const responses = [
      `${character.greeting}\n\nRegarding "${userMessage}" - I will handle this with the wisdom of the ${this.config.selectedSide} side.`,
      `As ${character.name}, I understand your request about "${userMessage}". Let me assist you accordingly.`,
      `*${character.personality}*\n\nI've received your message: "${userMessage}". How may I serve you further?`,
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }
}
