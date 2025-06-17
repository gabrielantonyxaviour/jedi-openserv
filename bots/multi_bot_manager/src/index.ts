import express from "express";
import { BotManager } from "./manager";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const botManager = new BotManager();

// API endpoint to create a new bot (called by entry_bot)
app.post("/api/create-bot", async (req, res) => {
  try {
    const {
      userId,
      botToken,
      botName,
      walletAddress,
      selectedSide,
      openservConfig,
    } = req.body;

    await botManager.createBot({
      userId,
      botToken,
      botName,
      walletAddress,
      selectedSide,
    });

    res.json({ success: true, message: `Bot created for ${botName}` });
  } catch (error) {
    console.error("Error creating bot:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// API endpoint to get bot status
app.get("/api/bot-status/:userId", (req, res) => {
  const { userId } = req.params;
  const status = botManager.getBotStatus(userId);
  res.json(status);
});

// API endpoint to list all active bots
app.get("/api/active-bots", (req, res) => {
  const activeBots = botManager.listActiveBots();
  res.json({ activeBots, count: activeBots.length });
});

const PORT = process.env.MANAGER_PORT || 4000;

app.listen(PORT, () => {
  console.log(`🌟 Jedi Bot Manager running on port ${PORT}`);
  console.log("Ready to create and manage multiple Jedi bots!");
});
