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

interface AuthenticatedRequest extends express.Request {
  walletAddress?: string;
}

class JediContextServer {
  private server: Server;
  private walletContexts: WalletContexts = {};
  private eventHandlers: Map<string, Array<(event: any) => void>>;

  constructor() {
    this.server = new Server(
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

    this.eventHandlers = new Map();
    this.setupHandlers();
  }

  private normalizeWallet(address: string): string {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error(`Invalid wallet address: ${address}`);
    }
    return address.toLowerCase();
  }

  private getWalletContext(walletAddress: string): SharedContext {
    const normalizedWallet = this.normalizeWallet(walletAddress);

    if (!this.walletContexts[normalizedWallet]) {
      this.walletContexts[normalizedWallet] =
        this.initializeContext(normalizedWallet);
    }

    // Update last active
    this.walletContexts[normalizedWallet].metadata.lastActive = new Date();

    return this.walletContexts[normalizedWallet];
  }

  private initializeContext(walletAddress: string): SharedContext {
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
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
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

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const uri = request.params.uri;
        const [, contextKey] = uri.split("://");

        // Extract wallet address from request (you might need to adjust this based on your setup)
        const walletAddress = request.params.walletAddress;
        if (!walletAddress) {
          throw new Error("Wallet address required for context access");
        }

        const context = this.getWalletContext(walletAddress as string);

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
      }
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "update_context",
          description:
            "Update shared context for a specific wallet/project area",
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
          description:
            "Query shared context across projects for specific wallet",
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

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "update_context":
          return this.updateContext(args);
        case "emit_event":
          return this.emitEvent(args);
        case "query_context":
          return this.queryContext(args);
        case "get_events":
          return this.getEvents(args);
        case "link_telegram":
          return this.linkTelegram(args);
        case "get_wallet_by_telegram":
          return this.getWalletByTelegram(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private updateContext(args: any) {
    const { walletAddress, area, operation, path, data } = args;

    const context = this.getWalletContext(walletAddress);
    const target = context[area as keyof SharedContext];

    switch (operation) {
      case "set":
        if (path) {
          this.setNestedValue(target, path, data);
        } else {
          Object.assign(target, data);
        }
        break;
      case "append":
        if (Array.isArray(target)) {
          target.push(data);
        } else if (path && Array.isArray(this.getNestedValue(target, path))) {
          this.getNestedValue(target, path).push(data);
        }
        break;
      case "update":
        const existing = path ? this.getNestedValue(target, path) : target;
        Object.assign(existing, data);
        break;
      case "remove":
        if (path) {
          this.removeNestedValue(target, path);
        }
        break;
    }

    // Emit context update event
    this.addEvent(walletAddress, {
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
  }

  private emitEvent(args: any) {
    const { walletAddress, ...eventData } = args;
    const event = {
      ...eventData,
      id: this.generateId(),
      timestamp: new Date(),
      processed: false,
    };

    this.addEvent(walletAddress, event);
    return {
      content: [
        {
          type: "text",
          text: `Event emitted for ${walletAddress}: ${event.id}`,
        },
      ],
    };
  }

  private queryContext(args: any) {
    const {
      walletAddress,
      query,
      areas = ["communications", "social", "business", "core"],
    } = args;

    const context = this.getWalletContext(walletAddress);
    const results: any[] = [];

    for (const area of areas) {
      const contextData = context[area as keyof SharedContext];
      const matches = this.searchInObject(contextData, query.toLowerCase());
      if (matches.length > 0) {
        results.push({ area, matches });
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }

  private getEvents(args: any) {
    const { walletAddress, since, limit = 50, source, type } = args;

    const context = this.getWalletContext(walletAddress);
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
  }

  private linkTelegram(args: any) {
    const { walletAddress, telegramUserId } = args;
    const context = this.getWalletContext(walletAddress);

    context.communications.telegramUserId = telegramUserId;

    this.addEvent(walletAddress, {
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
  }

  private getWalletByTelegram(args: any) {
    const { telegramUserId } = args;

    for (const [walletAddress, context] of Object.entries(
      this.walletContexts
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
  }

  private addEvent(walletAddress: string, event: any) {
    const context = this.getWalletContext(walletAddress);
    context.events.push({
      id: event.id || this.generateId(),
      ...event,
      timestamp: new Date(),
    });

    // Keep only last 1000 events per wallet
    if (context.events.length > 1000) {
      context.events = context.events.slice(-1000);
    }
  }

  private setNestedValue(obj: any, path: string, value: any) {
    const keys = path.split(".");
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }

  private getNestedValue(obj: any, path: string) {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }

  private removeNestedValue(obj: any, path: string) {
    const keys = path.split(".");
    const lastKey = keys.pop()!;
    const parent = keys.reduce((current, key) => current?.[key], obj);
    if (parent && lastKey in parent) {
      delete parent[lastKey];
    }
  }

  private searchInObject(obj: any, query: string): any[] {
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
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  async run() {
    const app = express();
    const PORT = process.env.PORT || 3001;
    const API_KEY = process.env.API_KEY || "abcd";

    app.use(cors());
    app.use(express.json());

    const authenticateApiKey = (
      req: AuthenticatedRequest,
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

    app.use("/mcp", authenticateApiKey);

    // Single MCP endpoint
    app.get("/mcp", async (req: AuthenticatedRequest, res) => {
      console.log("Received MCP request:", req);

      // Create SSE transport
      const transport = new SSEServerTransport("/mcp", res);

      // Connect server to transport
      this.server.connect(transport);

      // SSE transport will handle the JSON-RPC protocol automatically
    });

    app.listen(PORT, () => {
      console.log(`Jedi Context Server running on http://localhost:${PORT}`);
      console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    });
  }
}

// Start the server
const server = new JediContextServer();
server.run().catch(console.error);
