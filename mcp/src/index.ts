import dotenv from "dotenv";
dotenv.config();

import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import { createJediServer } from "./server.js";

console.error("Starting Jedi Context SSE server...");

const app = express();
const transports: Map<string, SSEServerTransport> = new Map();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || "abcd";

app.use(cors());
app.use(express.json());

app.get("/sse", async (req, res) => {
  let transport: SSEServerTransport;
  const { server, cleanup } = createJediServer();

  if (req?.query?.sessionId) {
    const sessionId = req?.query?.sessionId as string;
    transport = transports.get(sessionId) as SSEServerTransport;
    console.error(
      "Client Reconnecting? This shouldn't happen; when client has a sessionId, GET /sse should not be called again.",
      transport.sessionId
    );
  } else {
    transport = new SSEServerTransport("/message", res);
    transports.set(transport.sessionId, transport);

    await server.connect(transport);
    console.error("Client Connected: ", transport.sessionId);

    server.onclose = async () => {
      console.error("Client Disconnected: ", transport.sessionId);
      transports.delete(transport.sessionId);
      await cleanup();
    };
  }
});

app.post("/message", async (req, res) => {
  const sessionId = req?.query?.sessionId as string;
  const transport = transports.get(sessionId);
  if (transport) {
    console.log("Client Message from", sessionId);
    console.log(req.body);
    try {
      await transport.handlePostMessage(req, res);
    } catch (error) {
      console.error("Error handling POST message:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  } else {
    console.error(`No transport found for sessionId ${sessionId}`);
  }
});

app.listen(PORT, () => {
  console.error(`Jedi Context Server running on port ${PORT}`);
  console.error(`SSE endpoint: http://localhost:${PORT}/sse`);
});
