import TelegramBot from "node-telegram-bot-api";
import { Agent } from "@openserv-labs/sdk";
import { CHARACTERS } from "./character.js";
import axios from "axios";
import dotenv from "dotenv";
import {
  GAP,
  Project,
  ProjectDetails,
  Grant,
  GrantDetails,
  Milestone,
  MemberOf,
} from "@show-karma/karma-gap-sdk";
import { GapIndexerClient } from "@show-karma/karma-gap-sdk/core/class";
import { ethers } from "ethers";
import { Address, Hex } from "viem";

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

  private gap: GAP;
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  private project: Project | null = null;

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

    this.gap = new GAP({
      globalSchemas: false,
      network: process.env.KARMA_NETWORK as any,
      apiClient: new GapIndexerClient("https://gapapi.karmahq.xyz"),
    });

    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    this.wallet = new ethers.Wallet(
      process.env.AGENT_PRIVATE_KEY!,
      this.provider
    );

    if (this.kind == "core") {
      const projectData = {
        ownerAddress: this.wallet.address,
        title: "Jedi Project",
        description:
          "Jedi is your AI co-founder built for developers—an intelligent partner that helps you brainstorm ideas, write code, debug, and ship faster. From MVP to scale, Jedi works beside you like a true teammate, turning your thoughts into product with clarity, speed, and precision.",
        imageURL:
          "https://pbs.twimg.com/profile_images/1931304627124744192/g6Zgm1BD_400x400.jpg",
        links: [
          {
            type: "Twitter",
            url: "https://x.com/JediOnChain",
          },
        ],
        tags: [{ name: "AI" }, { name: "Developer" }, { name: "Productivity" }],
        members: [this.wallet.address],
      };

      const project = new Project({
        data: { project: true },
        chainID: 42220,
        schema: this.gap.findSchema("Project"),
        recipient: projectData.ownerAddress as Address,
      });

      project.details = new ProjectDetails({
        data: {
          title: projectData.title,
          description: projectData.description,
          imageURL: projectData.imageURL || "",
          links: projectData.links || [],
          tags: projectData.tags || [],
        },
        schema: this.gap.findSchema("ProjectDetails"),
        recipient: projectData.ownerAddress as Address,
      });

      // Add members if provided
      if (projectData.members) {
        for (const memberAddress of projectData.members) {
          const member = new MemberOf({
            data: { memberOf: true },
            schema: this.gap.findSchema("MemberOf"),
            refUID: project.uid,
            recipient: memberAddress as Address,
          });
          project.members.push(member);
        }
      }

      this.project = project;

      project.attest(this.wallet).then(({ uids }) => {
        console.log("this is the res");
        const uid = uids[0];
        console.log(uid);
        this.bot.sendMessage(
          this.ownerUserId,
          `Master, I registered your project on https://gap.karma.xyz .
  
          Here is your uuid: ${uid}
          
          Let's acheive greatness by the Sith order`
        );
      });
    }

    if (this.config.kind == "socials") {
      this.createTask({
        workspaceId: this.workspaceId,
        assignee: 3,
        description: `Jedi socials side response to user message`,
        body: `Generate a tweet to setup the project`,
        input: `Here is the basic description of the project:

           ${this.about}.

           Post your first tweet announcing that you, Darth Vader are going to handle the twitter for this project and also explain in short about the poject all in less than 250 characters.`,
        expectedOutput: `Post a tweet on Twitter that announces that you, Darth Vader are going to handle the twitter for this project and also explain in short about the poject all in less than 250 characters.`,
        dependencies: [],
      }).then((res) => {
        console.log(
          `🚀 Task created with ID: ${res.id} for user ${this.config.userId}`
        );

        // Wait for task completion
        this.waitForTaskCompletion(res.id, 0).then((result) => {
          console.log("this is the result");
          console.log(result);
        });
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
    const sideTitle = side === "light" ? "Jedi Council" : "Sith Order";
    const character = CHARACTERS[side][this.kind]; // Use the comms character

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
          console.log("this is the response");
          console.log(character);
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

    if (this.kind == "core") {
      this.bot.onText(/\/grant (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const grantText = match?.[1];
        const userId = msg.from?.id?.toString();
        const isOwner = userId === this.ownerUserId;

        // Only owner can create grants
        if (!isOwner) {
          await this.bot.sendMessage(chatId, "You dare command me? Pathetic.");
          return;
        }

        if (!grantText) {
          await this.bot.sendMessage(
            chatId,
            "❌ Please provide grant details: /grant [your grant description]"
          );
          return;
        }

        if (grantText.length > 300) {
          await this.bot.sendMessage(
            chatId,
            "❌ Grant description too long. Please keep it under 250 characters."
          );
          return;
        }

        // Send typing indicator
        this.bot.sendChatAction(chatId, "typing");

        try {
          console.log(
            `💰 Grant command from ${this.config.userId}: "${grantText}"`
          );

          // TODO: Process grant here

          const grantData = {
            title: "Apply for OpenServAI Grants",
            description: grantText,
            proposalURL: "https://example.com/proposal",
            communityUID: "",
            cycle: "1",
            season: "1",
          };

          await this.bot.sendMessage(
            chatId,
            "✅ Grant command received. Processing..."
          );
        } catch (error) {
          console.error(
            `Error processing grant for ${this.config.userId}:`,
            error
          );
          await this.bot.sendMessage(
            chatId,
            "❌ An error occurred processing the grant."
          );
        }
      });

      // Milestone command (core only)
      this.bot.onText(/\/milestone (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const milestoneText = match?.[1];
        const userId = msg.from?.id?.toString();
        const isOwner = userId === this.ownerUserId;

        // Only owner can create milestones
        if (!isOwner) {
          await this.bot.sendMessage(chatId, "You dare command me? Pathetic.");
          return;
        }

        if (!milestoneText) {
          await this.bot.sendMessage(
            chatId,
            "❌ Please provide milestone details: /milestone [your milestone description]"
          );
          return;
        }

        if (milestoneText.length > 300) {
          await this.bot.sendMessage(
            chatId,
            "❌ Milestone description too long. Please keep it under 250 characters."
          );
          return;
        }

        // Send typing indicator
        this.bot.sendChatAction(chatId, "typing");

        try {
          console.log(
            `📋 Milestone command from ${this.config.userId}: "${milestoneText}"`
          );

          // TODO: Process milestone here

          await this.bot.sendMessage(
            chatId,
            "✅ Milestone command received. Processing..."
          );
        } catch (error) {
          console.error(
            `Error processing milestone for ${this.config.userId}:`,
            error
          );
          await this.bot.sendMessage(
            chatId,
            "❌ An error occurred processing the milestone."
          );
        }
      });
    }

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
    const character = CHARACTERS[side][this.config.kind];
    console.log("this is the character");
    console.log(character);

    try {
      console.log("this is being called");
      // Create task for the Jedi comms project
      const task = await this.createTask({
        workspaceId: this.workspaceId,
        assignee: 1,
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
        expectedOutput: `A helpful response from ${character.name} that stays in character.   IMPORTANT INSTRUCTION: DO NOT USE agents that are not mentioned in the instructions. Be concious with the agents you use. Not all agents need to be user for all tasks.`,
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
        if (chatId != 0) this.bot.sendChatAction(chatId, "typing");

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
