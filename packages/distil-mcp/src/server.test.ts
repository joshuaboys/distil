import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server.js";

describe("createServer", () => {
  it("returns an object with server and start properties", () => {
    const result = createServer();
    expect(result).toHaveProperty("server");
    expect(result).toHaveProperty("start");
    expect(typeof result.start).toBe("function");
  });

  it("server has an McpServer instance", () => {
    const { server } = createServer();
    // McpServer wraps a lower-level Server accessible via .server
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
  });
});

describe("MCP server tools and prompts", () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const { server } = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "0.1.0" }, { capabilities: {} });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    cleanup = async () => {
      await client.close();
      await server.close();
    };
  });

  afterAll(async () => {
    await cleanup();
  });

  it("lists all expected tools", async () => {
    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name);

    expect(toolNames).toContain("distil_extract");
    expect(toolNames).toContain("distil_calls");
    expect(toolNames).toContain("distil_impact");
    expect(toolNames).toContain("distil_cfg");
    expect(toolNames).toContain("distil_dfg");
    expect(toolNames).toContain("distil_slice");
    expect(toolNames).toHaveLength(6);
  });

  it("tools have descriptions", async () => {
    const result = await client.listTools();

    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
      expect(typeof tool.description).toBe("string");
    }
  });

  it("tools have input schemas", async () => {
    const result = await client.listTools();

    for (const tool of result.tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("lists all expected prompts", async () => {
    const result = await client.listPrompts();
    const promptNames = result.prompts.map((p) => p.name);

    expect(promptNames).toContain("distil_before_editing");
    expect(promptNames).toContain("distil_debug_line");
    expect(promptNames).toContain("distil_refactor_impact");
    expect(promptNames).toHaveLength(3);
  });

  it("prompts have descriptions", async () => {
    const result = await client.listPrompts();

    for (const prompt of result.prompts) {
      expect(prompt.description).toBeTruthy();
      expect(typeof prompt.description).toBe("string");
    }
  });

  it("distil_extract returns error for unsupported file", async () => {
    const result = await client.callTool({
      name: "distil_extract",
      arguments: { file: "nonexistent.xyz" },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
    expect(text).toContain("Error");
  });

  it("distil_extract returns error for missing file", async () => {
    const result = await client.callTool({
      name: "distil_extract",
      arguments: { file: "/tmp/definitely-does-not-exist.ts" },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
    expect(text).toContain("Error");
  });

  it("distil_cfg returns error for missing function", async () => {
    const result = await client.callTool({
      name: "distil_cfg",
      arguments: {
        file: "/tmp/definitely-does-not-exist.ts",
        function: "noSuchFn",
      },
    });

    expect(result.isError).toBe(true);
  });

  it("distil_before_editing prompt returns messages", async () => {
    const result = await client.getPrompt({
      name: "distil_before_editing",
      arguments: { file: "src/index.ts", function: "myFunction" },
    });

    expect(result.messages).toBeDefined();
    expect(result.messages.length).toBeGreaterThan(0);
    const firstMessage = result.messages[0]!;
    expect(firstMessage.role).toBe("user");
    const content = firstMessage.content as { type: string; text: string };
    expect(content.text).toContain("myFunction");
    expect(content.text).toContain("distil_extract");
    expect(content.text).toContain("distil_cfg");
    expect(content.text).toContain("distil_impact");
  });

  it("distil_debug_line prompt returns messages", async () => {
    const result = await client.getPrompt({
      name: "distil_debug_line",
      arguments: {
        file: "src/index.ts",
        function: "myFunction",
        line: "42",
      },
    });

    expect(result.messages).toBeDefined();
    expect(result.messages.length).toBeGreaterThan(0);
    const content = result.messages[0]!.content as {
      type: string;
      text: string;
    };
    expect(content.text).toContain("42");
    expect(content.text).toContain("distil_slice");
    expect(content.text).toContain("distil_dfg");
  });

  it("distil_refactor_impact prompt returns messages", async () => {
    const result = await client.getPrompt({
      name: "distil_refactor_impact",
      arguments: { function: "myFunction", path: "." },
    });

    expect(result.messages).toBeDefined();
    expect(result.messages.length).toBeGreaterThan(0);
    const content = result.messages[0]!.content as {
      type: string;
      text: string;
    };
    expect(content.text).toContain("myFunction");
    expect(content.text).toContain("distil_calls");
    expect(content.text).toContain("distil_impact");
  });
});
