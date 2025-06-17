import express from "express";
import { BotManager } from "./manager.js";
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
      commsBotToken,
      socialsBotToken,
      coreBotToken,
      commsBotName,
      socialsBotName,
      coreBotName,
      walletAddress,
      selectedSide,
      about,
    } = req.body;

    // const body = {
    //   userId: userId.toString(),
    //   commsBotToken: state.agents.comms!.token,
    //   socialsBotToken: state.agents.socials!.token,
    //   coreBotToken: state.agents.core!.token,
    //   commsBotName: state.agents.comms!.name,
    //   socialsBotName: state.agents.socials!.name,
    //   coreBotName: state.agents.core!.name,
    //   walletAddress: "0x0000000000000000000000000000000000000000",
    //   selectedSide: state.side,
    // }

    await botManager.createBot({
      userId: userId.toString(),
      about,
      commsBotToken,
      socialsBotToken,
      coreBotToken,
      commsBotName,
      socialsBotName,
      coreBotName,
      walletAddress,
      selectedSide,
    });

    res.json({ success: true, message: `Bots created` });
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
