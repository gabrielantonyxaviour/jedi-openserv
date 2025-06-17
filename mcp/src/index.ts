import dotenv from "dotenv";
dotenv.config();

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";

interface SharedContext {
  owner: string;
  communications: {
    telegramUserId?: number;
    activeConversations: Array<{
      id: string;
      contact: string;
      status: string;
      lastUpdate: Date;
    }>;
    pendingActions: Array<{
      id: string;
      type: string;
      priority: number;
      dueDate?: Date;
    }>;
    recentInteractions: Array<{
      contact: string;
      type: string;
      summary: string;
      timestamp: Date;
    }>;
  };
  social: {
    scheduledPosts: Array<{
      platform: string;
      content: string;
      scheduledFor: Date;
      status: string;
    }>;
    engagement: {
      followers: number;
      engagement_rate: number;
      lastUpdated: Date;
    };
    contentPipeline: Array<{
      id: string;
      type: string;
      status: string;
      topic: string;
    }>;
  };
  business: {
    activeDeals: Array<{
      id: string;
      contact: string;
      value: number;
      stage: string;
      nextAction: string;
    }>;
    compliance: {
      tasks: Array<{ id: string; type: string; dueDate: Date; status: string }>;
    };
    similarProjects: Array<{
      name: string;
      similarity: number;
      notes: string;
      lastChecked: Date;
    }>;
  };
  core: {
    funds: {
      balance: number;
      recent_transactions: Array<{
        amount: number;
        description: string;
        date: Date;
      }>;
    };
    activeTasks: Array<{
      id: string;
      project: string;
      description: string;
      status: string;
      assignee?: string;
    }>;
    scripts: Array<{
      name: string;
      purpose: string;
      lastRun?: Date;
      status: string;
    }>;
  };
  events: Array<{
    id: string;
    source: string;
    type: string;
    data: any;
    timestamp: Date;
    processed: boolean;
  }>;
  metadata: {
    createdAt: Date;
    lastActive: Date;
    walletAddress: string;
  };
}

interface WalletContexts {
  [walletAddress: string]: SharedContext;
}

// Shared storage across all sessions
const globalWalletContexts: WalletContexts = {};

const createJediServer = () => {
  const server = new Server(
    {
      name: "jedi-context-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  const normalizeWallet = (address: string): string => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error(`Invalid wallet address: ${address}`);
    }
    return address.toLowerCase();
  };

  const getWalletContext = (walletAddress: string): SharedContext => {
    const normalizedWallet = normalizeWallet(walletAddress);

    if (!globalWalletContexts[normalizedWallet]) {
      globalWalletContexts[normalizedWallet] =
        initializeContext(normalizedWallet);
    }

    globalWalletContexts[normalizedWallet].metadata.lastActive = new Date();
    return globalWalletContexts[normalizedWallet];
  };

  const initializeContext = (walletAddress: string): SharedContext => {
    return {
      owner: walletAddress,
      communications: {
        activeConversations: [],
        pendingActions: [],
        recentInteractions: [],
      },
      social: {
        scheduledPosts: [],
        engagement: {
          followers: 0,
          engagement_rate: 0,
          lastUpdated: new Date(),
        },
        contentPipeline: [],
      },
      business: {
        activeDeals: [],
        compliance: { tasks: [] },
        similarProjects: [],
      },
      core: {
        funds: { balance: 0, recent_transactions: [] },
        activeTasks: [],
        scripts: [],
      },
      events: [],
      metadata: {
        createdAt: new Date(),
        lastActive: new Date(),
        walletAddress,
      },
    };
  };

  const addEvent = (walletAddress: string, event: any) => {
    const context = getWalletContext(walletAddress);
    context.events.push({
      id: event.id || generateId(),
      ...event,
      timestamp: new Date(),
    });

    if (context.events.length > 1000) {
      context.events = context.events.slice(-1000);
    }
  };

  const setNestedValue = (obj: any, path: string, value: any) => {
    const keys = path.split(".");
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  };

  const getNestedValue = (obj: any, path: string) => {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  };

  const removeNestedValue = (obj: any, path: string) => {
    const keys = path.split(".");
    const lastKey = keys.pop()!;
    const parent = keys.reduce((current, key) => current?.[key], obj);
    if (parent && lastKey in parent) {
      delete parent[lastKey];
    }
  };

  const searchInObject = (obj: any, query: string): any[] => {
    const results: any[] = [];
    const search = (current: any, path: string = "") => {
      if (
        typeof current === "string" &&
        current.toLowerCase().includes(query)
      ) {
        results.push({ path, value: current });
      } else if (Array.isArray(current)) {
        current.forEach((item, index) => search(item, `${path}[${index}]`));
      } else if (typeof current === "object" && current !== null) {
        Object.entries(current).forEach(([key, value]) =>
          search(value, path ? `${path}.${key}` : key)
        );
      }
    };
    search(obj);
    return results;
  };

  const generateId = (): string => {
    return Math.random().toString(36).substr(2, 9);
  };

  const updateContext = (args: any) => {
    const { walletAddress, area, operation, path, data } = args;
    const context = getWalletContext(walletAddress);
    const target = context[area as keyof SharedContext];

    switch (operation) {
      case "set":
        if (path) {
          setNestedValue(target, path, data);
        } else {
          Object.assign(target, data);
        }
        break;
      case "append":
        if (Array.isArray(target)) {
          target.push(data);
        } else if (path && Array.isArray(getNestedValue(target, path))) {
          getNestedValue(target, path).push(data);
        }
        break;
      case "update":
        const existing = path ? getNestedValue(target, path) : target;
        Object.assign(existing, data);
        break;
      case "remove":
        if (path) {
          removeNestedValue(target, path);
        }
        break;
    }

    addEvent(walletAddress, {
      source: "context-server",
      type: "context_updated",
      data: { area, operation, path, timestamp: new Date() },
    });

    return {
      content: [
        {
          type: "text",
          text: `Context updated for ${walletAddress}: ${area}.${
            path || "root"
          }`,
        },
      ],
    };
  };

  const emitEvent = (args: any) => {
    const { walletAddress, ...eventData } = args;
    const event = {
      ...eventData,
      id: generateId(),
      timestamp: new Date(),
      processed: false,
    };

    addEvent(walletAddress, event);
    return {
      content: [
        {
          type: "text",
          text: `Event emitted for ${walletAddress}: ${event.id}`,
        },
      ],
    };
  };

  const queryContext = (args: any) => {
    const {
      walletAddress,
      query,
      areas = ["communications", "social", "business", "core"],
    } = args;

    const context = getWalletContext(walletAddress);
    const results: any[] = [];

    for (const area of areas) {
      const contextData = context[area as keyof SharedContext];
      const matches = searchInObject(contextData, query.toLowerCase());
      if (matches.length > 0) {
        results.push({ area, matches });
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  };

  const getEvents = (args: any) => {
    const { walletAddress, since, limit = 50, source, type } = args;
    const context = getWalletContext(walletAddress);
    let events = context.events;

    if (since) {
      const sinceDate = new Date(since);
      events = events.filter((e) => e.timestamp > sinceDate);
    }

    if (source) {
      events = events.filter((e) => e.source === source);
    }

    if (type) {
      events = events.filter((e) => e.type === type);
    }

    events = events.slice(-limit);

    return {
      content: [{ type: "text", text: JSON.stringify(events, null, 2) }],
    };
  };

  const linkTelegram = (args: any) => {
    const { walletAddress, telegramUserId } = args;
    const context = getWalletContext(walletAddress);

    context.communications.telegramUserId = telegramUserId;

    addEvent(walletAddress, {
      source: "context-server",
      type: "telegram_linked",
      data: { telegramUserId, timestamp: new Date() },
    });

    return {
      content: [
        {
          type: "text",
          text: `Telegram user ${telegramUserId} linked to wallet ${walletAddress}`,
        },
      ],
    };
  };

  const getWalletByTelegram = (args: any) => {
    const { telegramUserId } = args;

    for (const [walletAddress, context] of Object.entries(
      globalWalletContexts
    )) {
      if (context.communications.telegramUserId === telegramUserId) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ walletAddress, found: true }),
            },
          ],
        };
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ walletAddress: null, found: false }),
        },
      ],
    };
  };

  // Set up handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "context://communications",
        mimeType: "application/json",
        name: "Communications Context",
        description:
          "Active conversations, pending actions, recent interactions (requires walletAddress)",
      },
      {
        uri: "context://social",
        mimeType: "application/json",
        name: "Social Media Context",
        description:
          "Scheduled posts, engagement metrics, content pipeline (requires walletAddress)",
      },
      {
        uri: "context://business",
        mimeType: "application/json",
        name: "Business & Compliance Context",
        description:
          "Active deals, compliance tasks, similar projects (requires walletAddress)",
      },
      {
        uri: "context://core",
        mimeType: "application/json",
        name: "Core Operations Context",
        description: "Funds, active tasks, scripts (requires walletAddress)",
      },
      {
        uri: "context://events",
        mimeType: "application/json",
        name: "Event Stream",
        description:
          "Cross-project events and notifications (requires walletAddress)",
      },
      {
        uri: "context://metadata",
        mimeType: "application/json",
        name: "Wallet Metadata",
        description:
          "Wallet creation and activity metadata (requires walletAddress)",
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const [, contextKey] = uri.split("://");
    const walletAddress = request.params.walletAddress;

    if (!walletAddress) {
      throw new Error("Wallet address required for context access");
    }

    const context = getWalletContext(walletAddress as string);

    if (contextKey in context) {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              context[contextKey as keyof SharedContext],
              null,
              2
            ),
          },
        ],
      };
    }

    throw new Error(`Resource not found: ${uri}`);
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "update_context",
        description: "Update shared context for a specific wallet/project area",
        inputSchema: {
          type: "object",
          properties: {
            walletAddress: {
              type: "string",
              description: "Wallet address of the context owner",
            },
            area: {
              type: "string",
              enum: ["communications", "social", "business", "core"],
            },
            operation: {
              type: "string",
              enum: ["set", "append", "update", "remove"],
            },
            path: {
              type: "string",
              description: "Dot notation path to update",
            },
            data: { type: "object", description: "Data to update" },
          },
          required: ["walletAddress", "area", "operation", "data"],
        },
      },
      {
        name: "emit_event",
        description: "Emit cross-project event for specific wallet",
        inputSchema: {
          type: "object",
          properties: {
            walletAddress: {
              type: "string",
              description: "Wallet address of the context owner",
            },
            source: {
              type: "string",
              enum: [
                "jedi-comms",
                "jedi-community",
                "jedi-business",
                "jedi-core",
              ],
            },
            type: { type: "string" },
            data: { type: "object" },
            targets: {
              type: "array",
              items: { type: "string" },
              description: "Target projects to notify",
            },
          },
          required: ["walletAddress", "source", "type", "data"],
        },
      },
      {
        name: "query_context",
        description: "Query shared context across projects for specific wallet",
        inputSchema: {
          type: "object",
          properties: {
            walletAddress: {
              type: "string",
              description: "Wallet address of the context owner",
            },
            query: { type: "string", description: "Natural language query" },
            areas: {
              type: "array",
              items: { type: "string" },
              description: "Context areas to search",
            },
          },
          required: ["walletAddress", "query"],
        },
      },
      {
        name: "get_events",
        description:
          "Get events for specific wallet since timestamp or last N events",
        inputSchema: {
          type: "object",
          properties: {
            walletAddress: {
              type: "string",
              description: "Wallet address of the context owner",
            },
            since: { type: "string", description: "ISO timestamp" },
            limit: { type: "number", default: 50 },
            source: {
              type: "string",
              description: "Filter by source project",
            },
            type: { type: "string", description: "Filter by event type" },
          },
          required: ["walletAddress"],
        },
      },
      {
        name: "link_telegram",
        description: "Link Telegram user ID to wallet address",
        inputSchema: {
          type: "object",
          properties: {
            walletAddress: { type: "string", description: "Wallet address" },
            telegramUserId: {
              type: "number",
              description: "Telegram user ID",
            },
          },
          required: ["walletAddress", "telegramUserId"],
        },
      },
      {
        name: "get_wallet_by_telegram",
        description: "Get wallet address by Telegram user ID",
        inputSchema: {
          type: "object",
          properties: {
            telegramUserId: {
              type: "number",
              description: "Telegram user ID",
            },
          },
          required: ["telegramUserId"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "update_context":
        return updateContext(args);
      case "emit_event":
        return emitEvent(args);
      case "query_context":
        return queryContext(args);
      case "get_events":
        return getEvents(args);
      case "link_telegram":
        return linkTelegram(args);
      case "get_wallet_by_telegram":
        return getWalletByTelegram(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  const cleanup = async () => {
    // Any cleanup logic here
  };

  return { server, cleanup };
};

// Main SSE server setup
console.error("Starting Jedi Context SSE server...");

const app = express();
const transports: Map<string, SSEServerTransport> = new Map();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || "abcd";

app.use(cors());
app.use(express.json());

const authenticateApiKey = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  // const apiKey = req.headers["api-key"] || req.headers["API_KEY"];
  // if (apiKey !== API_KEY) {
  //   res.status(401).json({ error: "Invalid API key" });
  //   return;
  // }
  next();
};

app.use("/sse", authenticateApiKey);
app.use("/message", authenticateApiKey);

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
    // Create and store transport for new session
    transport = new SSEServerTransport("/message", res);
    transports.set(transport.sessionId, transport);

    // Connect server to transport
    await server.connect(transport);
    console.error("Client Connected: ", transport.sessionId);

    // Handle close of connection
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
    console.error("Client Message from", sessionId);
    await transport.handlePostMessage(req, res);
  } else {
    console.error(`No transport found for sessionId ${sessionId}`);
  }
});

app.listen(PORT, () => {
  console.error(`Jedi Context Server running on port ${PORT}`);
  console.error(`SSE endpoint: http://localhost:${PORT}/sse`);
});
