import TelegramBot from "node-telegram-bot-api";
import { Agent } from "@openserv-labs/sdk";
import { CHARACTERS } from "./character";
import axios from "axios";

interface BotConfig {
  userId: string;
  botToken: string;
  botName: string;
  walletAddress: string;
  selectedSide: "light" | "dark";
  openservConfig: {
    workspaceId: number;
    agentId: number; // Single agent ID for the comms project
  };
}

interface Character {
  name: string;
  title: string;
  image: string;
  greeting: string;
  personality: string;
}

export class JediBot extends Agent {
  private config: BotConfig;
  private bot: TelegramBot;
  private userSessions: Map<number, unknown> = new Map();
  private workspaceId: number;
  private agentId: number;

  constructor(config: BotConfig, bot: TelegramBot) {
    super({
      systemPrompt: `You are a Jedi AI assistant representing the ${config.selectedSide} side of the Force.`,
      apiKey: process.env.OPENSERV_API_KEY!,
      port: 8000 + parseInt(config.userId), // Unique port per user
    });

    this.config = config;
    this.bot = bot;
    this.workspaceId = config.openservConfig.workspaceId;
    this.agentId = config.openservConfig.agentId;
  }

  async start(): Promise<void> {
    console.log(
      `🌟 Starting Jedi bot for ${this.config.botName} (${this.config.selectedSide} side)`
    );

    // Start the OpenServ agent
    super.start();

    this.setupHandlers();

    console.log(`✅ Jedi bot active for user ${this.config.userId}`);
  }

  private setupHandlers(): void {
    const side = this.config.selectedSide;
    const sideEmoji = side === "light" ? "🔵" : "🔴";
    const sideTitle = side === "light" ? "Jedi Council" : "Sith Order";
    const character = CHARACTERS[side].comms; // Use the comms character

    // Start command
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;

      const welcomeMessage = `${sideEmoji} *Welcome to ${
        this.config.botName
      }* ${sideEmoji}

🌟 Your ${sideTitle} is ready to serve!

${character.image} **${character.name}** - ${character.title}

💰 **Wallet**: ${this.config.walletAddress.slice(
        0,
        6
      )}...${this.config.walletAddress.slice(-4)}
⚡ **Status**: All systems operational
🔮 **Workspace**: ${this.workspaceId}

Simply message me and your Jedi AI will respond with the wisdom of the ${side} side!

*${character.greeting}*

*May the Force be with you!* ⭐`;

      this.bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: "Markdown",
      });
    });

    // Ask command (like in the example)
    this.bot.onText(/\/ask (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const question = match?.[1];

      if (!question) {
        await this.bot.sendMessage(
          chatId,
          "❌ Please write a question: /ask [your question]"
        );
        return;
      }

      // Send typing indicator
      this.bot.sendChatAction(chatId, "typing");

      try {
        console.log(
          `📝 Question received from ${this.config.userId}: "${question}"`
        );

        const response = await this.handleUserMessage(question, chatId);

        if (response) {
          const formattedResponse = `${character.image} **${character.name}**:

${response}

---
*${sideTitle} • ${side === "light" ? "Light Side" : "Dark Side"} Wisdom*`;

          await this.bot.sendMessage(chatId, formattedResponse, {
            parse_mode: "Markdown",
          });
        } else {
          await this.bot.sendMessage(
            chatId,
            "❌ Sorry, I could not process your request. Please try again."
          );
        }
      } catch (error) {
        console.error(
          `Error processing question for ${this.config.userId}:`,
          error
        );
        await this.bot.sendMessage(
          chatId,
          "❌ An error occurred. Please try again."
        );
      }
    });

    // General message handler
    this.bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      const userId = msg.from?.id;

      if (!text || text.startsWith("/") || !userId) return;

      // Send typing indicator
      this.bot.sendChatAction(chatId, "typing");

      try {
        console.log(
          `📝 Message received from ${this.config.userId}: "${text}"`
        );

        const response = await this.handleUserMessage(text, chatId);

        if (response) {
          const formattedResponse = `${character.image} **${character.name}**:

${response}

---
*${sideTitle} • Powered by the Force*`;

          await this.bot.sendMessage(chatId, formattedResponse, {
            parse_mode: "Markdown",
          });
        } else {
          await this.bot.sendMessage(
            chatId,
            `${sideEmoji} *The Force is disturbed...*\n\nThere was an issue processing your request. Please try again.`
          );
        }
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

  private async handleUserMessage(
    message: string,
    chatId: number
  ): Promise<string | null> {
    const side = this.config.selectedSide;
    const character = CHARACTERS[side].comms;

    try {
      // Create task for the Jedi comms project
      const task = await this.createTask({
        workspaceId: this.workspaceId,
        assignee: this.agentId,
        description: `Jedi ${side} side response to user message`,
        body: `User (${this.config.botName}) said: "${message}"

Please respond as ${character.name} from the ${side} side of the Force.

Character context:
- Name: ${character.name}
- Title: ${character.title}
- Personality: ${character.personality}
- Side: ${side} side of the Force

Respond in character while being helpful and wise. Keep the Star Wars theme but focus on actually helping the user.`,
        input: message,
        expectedOutput: `A helpful response from ${character.name} that stays in character`,
        dependencies: [],
      });

      console.log(
        `🚀 Task created with ID: ${task.id} for user ${this.config.userId}`
      );

      // Wait for task completion
      const result = await this.waitForTaskCompletion(task.id, chatId);

      return result;
    } catch (error) {
      console.error("Error creating task:", error);
      return null;
    }
  }

  private async waitForTaskCompletion(
    taskId: number,
    chatId: number
  ): Promise<string | null> {
    const maxWaitTime = 120000; // 2 minutes
    const pollInterval = 5000; // 5 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Continue typing indicator
        this.bot.sendChatAction(chatId, "typing");

        // Check task status
        const taskDetail = await this.getTaskDetail({
          taskId: taskId,
          workspaceId: this.workspaceId,
        });

        console.log(`⏳ Task ${taskId} status: ${taskDetail?.status}`);

        if (taskDetail?.status === "done") {
          console.log(`✅ Task completed!`);

          // Check for output file
          if (taskDetail.attachments && taskDetail.attachments.length > 0) {
            try {
              const files = await this.getFiles({
                workspaceId: this.workspaceId,
              });
              const resultFile = files.find((file: any) =>
                taskDetail.attachments?.some((att: any) =>
                  file.path?.includes(att.path)
                )
              );

              if (resultFile) {
                const fileContent = await axios.get(resultFile.fullUrl);

                // Clean up the file
                await this.deleteFile({
                  workspaceId: this.workspaceId,
                  fileId: resultFile.id,
                }).catch(() => {});

                return (
                  fileContent.data ||
                  "Task completed but could not retrieve result."
                );
              }
            } catch (fileError) {
              console.error("Error reading result file:", fileError);
            }
          }

          // If no file attachment, check task output
          if (taskDetail.output) {
            return taskDetail.output;
          }

          return "Task completed.";
        }

        if (taskDetail?.status === "error") {
          console.error(`❌ Task failed`);
          return null;
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (pollError) {
        console.error("Error during polling:", pollError);
        // Continue polling despite errors
      }
    }

    console.log(`⏰ Task ${taskId} timeout`);
    return "Timeout. The task might still be processing.";
  }
}
