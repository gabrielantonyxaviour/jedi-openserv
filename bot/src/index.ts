export const hello = () => "Hello, world!";
import TelegramBot from "node-telegram-bot-api";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || "https://your-domain.com";

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

interface UserSession {
  walletAddress?: string;
  selectedSide?: "light" | "dark";
  selectedAgents?: string[];
  paymentVerified?: boolean;
  lastActivity: Date;
}

class JediTelegramBot {
  private bot: TelegramBot;
  private app: express.Application;
  private userSessions: Map<number, UserSession> = new Map();

  constructor() {
    this.bot = new TelegramBot(BOT_TOKEN!, { polling: true });
    this.app = express();
    this.setupWebApp();
    this.setupHandlers();
    console.log("🌟 Jedi Bot activated...");
  }

  private setupWebApp() {
    this.app.use(express.static("./src/webapp"));
    this.app.use(express.json());

    this.app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "webapp", "index.html"));
    });

    // API endpoints for the mini app
    this.app.post("/api/select-side", (req, res) => {
      const { userId, side } = req.body;
      const session = this.userSessions.get(userId) || {
        lastActivity: new Date(),
      };
      session.selectedSide = side;
      session.lastActivity = new Date();
      this.userSessions.set(userId, session);
      res.json({ success: true });
    });

    this.app.post("/api/connect-wallet", (req, res) => {
      const { userId, walletAddress } = req.body;
      const session = this.userSessions.get(userId) || {
        lastActivity: new Date(),
      };
      session.walletAddress = walletAddress;
      session.lastActivity = new Date();
      this.userSessions.set(userId, session);
      res.json({ success: true });
    });

    this.app.post("/api/verify-payment", (req, res) => {
      const { userId, txHash } = req.body;
      // In production, verify the transaction on Base Sepolia
      const session = this.userSessions.get(userId) || {
        lastActivity: new Date(),
      };
      session.paymentVerified = true;
      session.lastActivity = new Date();
      this.userSessions.set(userId, session);
      res.json({ success: true, verified: true });
    });

    const PORT = process.env.PORT || 3000;
    this.app.listen(PORT, () => {
      console.log(`🚀 Web app running on port ${PORT}`);
    });
  }

  private setupHandlers() {
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (userId) {
        this.userSessions.set(userId, { lastActivity: new Date() });
      }

      const webAppButton = {
        text: "🌟 Enter the Jedi Universe",
        web_app: { url: `${WEBAPP_URL}?user_id=${userId}` },
      };

      const welcomeMessage = `⭐ *Welcome, Young Padawan* ⭐

The Force has guided you to *Jedi AI* - your personal AI agent system inspired by the greatest saga in the galaxy.

🌌 Choose your path:
- 🔵 **Light Side** - Noble Jedi Masters guide your journey
- 🔴 **Dark Side** - Powerful Sith Lords command your empire

Your destiny awaits with 4 specialized AI agents ready to serve you across:
- 💬 **Communications** 
- 👥 **Community Management**
- 💼 **Business & Compliance**
- ⚡ **Core Operations**

*The Force will be with you... always.*`;

      this.bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: "Markdown",
        reply_markup: {
          keyboard: [[webAppButton]],
          resize_keyboard: true,
        },
      });
    });

    this.bot.on("message", (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const text = msg.text;

      if (text?.startsWith("/")) return;

      if (!userId || !text) return;

      const session = this.userSessions.get(userId);

      if (session?.paymentVerified) {
        this.handleJediMessage(chatId, userId, text, session);
      } else {
        this.bot.sendMessage(
          chatId,
          `🌟 Complete your Jedi training first!\n\nOpen the Jedi Universe to:\n• Choose your side\n• Meet your agents\n• Connect wallet & pay 0.0001 ETH\n\nThen I'll be ready to serve you!`
        );
      }
    });
  }

  private handleJediMessage(
    chatId: number,
    userId: number,
    text: string,
    session: UserSession
  ) {
    const side = session.selectedSide;
    const sideEmoji = side === "light" ? "🔵" : "🔴";
    const sideTitle = side === "light" ? "Jedi Council" : "Sith Order";

    const response = `${sideEmoji} *${sideTitle} Response*

🤖 Your ${side} side agents are processing: "${text}"

⚡ *Status*: All 4 agents activated
🌌 *Side*: ${side === "light" ? "Light Side" : "Dark Side"}
💰 *Wallet*: ${session.walletAddress?.slice(
      0,
      6
    )}...${session.walletAddress?.slice(-4)}

🛠️ *Development Mode*: Your agents will soon provide intelligent responses using the Force of AI!

May the Force be with you! ⭐`;

    this.bot.sendMessage(chatId, response, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🌟 Open Jedi Universe",
              web_app: { url: `${WEBAPP_URL}?user_id=${userId}` },
            },
          ],
        ],
      },
    });
  }
}

const jediBot = new JediTelegramBot();
