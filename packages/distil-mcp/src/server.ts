/**
 * Distil MCP Server
 *
 * Exposes code analysis tools via the Model Context Protocol.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION } from "@distil/core";

export function createServer() {
  const server = new McpServer({
    name: "distil",
    version: VERSION,
  });

  async function start(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }

  return { server, start };
}
