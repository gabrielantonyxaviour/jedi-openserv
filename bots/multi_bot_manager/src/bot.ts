import TelegramBot from "node-telegram-bot-api";
import { Agent } from "@openserv-labs/sdk";
import { CHARACTERS } from "./character.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

interface BotConfig {
  nonce: number;
  userId: string;
  about: string;
  botName: string;
  kind: "comms" | "socials" | "core";
  walletAddress: string;
  selectedSide: "light" | "dark";
}

export class JediBot extends Agent {
  private config: BotConfig;
  private bot: TelegramBot;
  private userSessions: Map<number, unknown> = new Map();
  private workspaceId: number;
  private agentId: number;
  private ownerUserId: string;
  private nonce: number;
  private kind: "comms" | "socials" | "core";
  private about: string;

  constructor(config: BotConfig, bot: TelegramBot) {
    super({
      systemPrompt: `Your name is ${config.botName}. You are the Jedi ${
        config.kind
      } AI assistant representing the ${
        config.selectedSide
      } side of the Force. ${
        config.kind == "comms"
          ? "our work is to respond to the questions asked by people. You are a helpful assistant. Trigger the appropriate agents only for your task. "
          : config.kind === "socials"
          ? "You are the content creator and community manager. You manage X account of the project. "
          : "You need to perform any task provided to you by the founder. You should not reply to anyone else."
      }. Here is the description of the project we are working on: ${
        config.about
      }`,
      apiKey:
        config.kind === "comms"
          ? process.env.COMMS_AGENT_API_KEY!
          : config.kind === "socials"
          ? process.env.SOCIALS_AGENT_API_KEY!
          : process.env.CORE_AGENT_API_KEY!,
      port: 8000 + config.nonce, // Unique port per user
    });
    this.ownerUserId = config.userId;
    this.about = config.about;
    this.nonce = config.nonce;
    this.config = config;
    this.kind = config.kind;
    this.bot = bot;
    this.workspaceId = parseInt(process.env.WORKSPACE_ID || "4484");
    this.agentId = parseInt(
      config.kind === "comms"
        ? process.env.COMMS_AGENT_ID!
        : config.kind === "socials"
        ? process.env.SOCIALS_AGENT_ID!
        : process.env.CORE_AGENT_ID!
    );

    if (this.config.kind == "socials") {
      this.createTask({
        workspaceId: this.workspaceId,
        assignee: parseInt(process.env.GENERAL_AGENT_ID || "3"),
        description: `Jedi socials side response to user message`,
        body: `Generate a tweet to setup the project`,
        input: `Here is the basic description of the project:
         ${this.about}. 
         
         Create a first tweet announcing that you, Darth Vader are going to handle the twitter for this project and also explain in short about the poject all in less than 250 characters.`,
        expectedOutput: `A tweet that announces that you, Darth Vader are going to handle the twitter for this project and also explain in short about the poject all in less than 250 characters.`,
        dependencies: [],
      });
    }
  }

  async start(): Promise<void> {
    console.log(
      `🌟 Starting Jedi ${this.config.kind} bot for ${this.config.botName} (${this.config.selectedSide} side)`
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
    const character = CHARACTERS[side][this.config.kind]; // Use the comms character

    // Start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id?.toString();
      const isOwner = userId === this.ownerUserId;

      // Apply same logic as regular messages
      if (this.kind === "socials" && !isOwner) {
        await this.bot.sendMessage(
          chatId,
          "Please use our main communications bot for questions. Thank you!"
        );
        return;
      }

      if (this.kind === "core" && !isOwner) {
        await this.bot.sendMessage(chatId, "You dare command me? Pathetic.");
        return;
      }

      const welcomeMessage = `${character.greeting}`;

      this.bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: "Markdown",
      });
    });

    // Ask command (like in the example)
    this.bot.onText(/\/ask (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const question = match?.[1];
      const userId = msg.from?.id?.toString();
      const isOwner = userId === this.ownerUserId;

      if (!question) {
        await this.bot.sendMessage(
          chatId,
          "❌ Please write a question: /ask [your question]"
        );
        return;
      }

      // Apply same logic as regular messages
      if (this.kind === "socials" && !isOwner) {
        await this.bot.sendMessage(
          chatId,
          "Please use our main communications bot for questions. Thank you!"
        );
        return;
      }

      if (this.kind === "core" && !isOwner) {
        await this.bot.sendMessage(chatId, "You dare command me? Pathetic.");
        return;
      }

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

    // Replace the general message handler
    this.bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      const userId = msg.from?.id?.toString();
      const isGroup =
        msg.chat.type === "group" || msg.chat.type === "supergroup";

      if (!text || text.startsWith("/") || !userId) return;

      // For groups, only respond if mentioned (except core which always responds rudely to non-owners)
      if (isGroup && !this.isBotMentioned(text) && this.kind !== "core") return;

      // Send typing indicator
      this.bot.sendChatAction(chatId, "typing");

      try {
        console.log(`📝 Message received from ${userId}: "${text}"`);

        let response: string | null = null;
        const isOwner = userId === this.ownerUserId;

        if (this.kind === "comms") {
          // Comms always uses createTask for everyone
          response = await this.handleUserMessage(text, chatId);
        } else if (this.kind === "socials") {
          if (isOwner) {
            response = await this.handleUserMessage(text, chatId);
          } else {
            response =
              "Hello! For questions and support, please reach out to our main communications bot instead. Thank you! 🙏";
          }
        } else if (this.kind === "core") {
          if (isOwner) {
            response = await this.handleUserMessage(text, chatId);
          } else {
            const rudeResponses = [
              "Access denied. You're not authorized to speak with me.",
              "I don't respond to peasants. Move along.",
              "Your inadequacy disturbs me. Begone.",
              "Only my master may command me. You are nothing.",
              "Silence, fool. You are unworthy of my attention.",
            ];
            response =
              rudeResponses[Math.floor(Math.random() * rudeResponses.length)];
          }
        }

        if (response) {
          const character = CHARACTERS[this.config.selectedSide].comms;
          const sideTitle =
            this.config.selectedSide === "light"
              ? "Jedi Council"
              : "Sith Order";

          // Only format with character info for comms or when owner is messaging
          if (this.kind === "comms" || isOwner) {
            const formattedResponse = `${character.image} **${character.name}**:

${response}

---
*${sideTitle} • Powered by the Force*`;

            await this.bot.sendMessage(chatId, formattedResponse, {
              parse_mode: "Markdown",
            });
          } else {
            // Simple response for non-owner socials/core
            await this.bot.sendMessage(chatId, response);
          }
        }
      } catch (error) {
        console.error(`Error handling message for ${userId}:`, error);
        this.bot.sendMessage(chatId, "❌ An error occurred. Please try again.");
      }
    });
  }

  private isBotMentioned(text: string): boolean {
    return (
      text.includes(`@${this.config.botName}`) ||
      text.includes(this.config.botName)
    );
  }

  private async handleUserMessage(
    message: string,
    chatId: number
  ): Promise<string | null> {
    const side = this.config.selectedSide;
    const character = CHARACTERS[side].comms;

    try {
      console.log("this is being called");
      // Create task for the Jedi comms project
      const task = await this.createTask({
        workspaceId: this.workspaceId,
        assignee: this.agentId,
        description: `Jedi ${side} side response to user message`,
        body: `${
          this.kind == "comms" ? "Someone asked:" : "The founder asked:"
        } "${message}"

        ${
          this.kind == "comms"
            ? "You should reply to this question by either triggering the Research Assistant if the task involves external research. If its a basic question trigger the General assistant. If the user wants you to talk more about something, Research Assistant followed by Essay Assistant. If someone speaks in a foreign language use MultiLigual Agnet for translation. If someone asks you to generate an image use Dall E Agent."
            : this.kind == "socials"
            ? "You should reply to this question by either triggering the Research Assistant if the task involves external research. If its a basic tweet request, use General Assistant. If the founder, wants you to make a tweet in a different language, use MultiLigual Agnet then General Assistant to make the tweet. Only if the user specificallty asks for an image or video, you must generate the video or image using apporpirate agents and include them in the tweet. "
            : "You should reply to the founder in the best of your knowledge."
        }
        
        IMPORTANT INSTRUCTION: DO NOT USE agents that are not mentioned in the instructions. Be concious with the agents you use. Not all agents need to be user for all tasks.
        `,
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
