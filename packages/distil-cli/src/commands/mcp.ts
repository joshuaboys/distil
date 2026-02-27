import { Command } from "commander";

export const mcpCommand = new Command("mcp")
  .description("Start MCP server for editor integration")
  .action(async () => {
    const { createServer } = await import("@distil/mcp");
    const { start } = createServer();
    await start();
  });
