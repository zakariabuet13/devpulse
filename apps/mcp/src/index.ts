import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createApiClient } from "./apiClient.js";
import { createServer } from "./server.js";


serveStdio(() => createServer({ api: createApiClient() }));
// stdout is the protocol channel; log to stderr only.
console.error("devpulse MCP server running on stdio");
