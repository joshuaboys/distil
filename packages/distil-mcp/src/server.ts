/**
 * Distil MCP Server
 *
 * Exposes L1-L5 code analysis tools via the Model Context Protocol,
 * enabling LLMs to query code structure, call graphs, control flow,
 * data flow, and program slices.
 */

import { readFile } from "fs/promises";
import { resolve } from "path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  buildCallGraph,
  extractCFG,
  extractDFG,
  extractPDG,
  getComplexityRating,
  getParser,
  VERSION,
} from "@distil/core";
import type { ProjectCallGraph, FunctionLocation, CallEdge } from "@distil/core";

/**
 * Serialize a ProjectCallGraph to a JSON-safe object.
 * Maps are converted to plain objects/arrays since JSON.stringify
 * cannot handle Map instances.
 */
function serializeCallGraph(graph: ProjectCallGraph) {
  return {
    projectRoot: graph.projectRoot,
    files: graph.files,
    fileCount: graph.files.length,
    builtAt: graph.builtAt,
    functions: Array.from(graph.functions.values()).map((fn) => ({
      name: fn.name,
      qualifiedName: fn.qualifiedName,
      file: fn.file,
      line: fn.line,
      isExported: fn.isExported,
    })),
    functionCount: graph.functions.size,
    edges: graph.edges.map((edge) => ({
      caller: edge.caller.qualifiedName,
      callee: edge.calleeLocation?.qualifiedName ?? edge.callee,
      callType: edge.callType,
      isDynamic: edge.isDynamic,
      resolved: edge.calleeLocation !== null,
    })),
    edgeCount: graph.edges.length,
  };
}

/**
 * Find callers of a function in the call graph with depth tracking.
 */
function findCallers(
  graph: ProjectCallGraph,
  qualifiedName: string,
  maxDepth: number,
): Array<{ caller: FunctionLocation; edge: CallEdge; depth: number }> {
  const visited = new Set<string>();
  const result: Array<{
    caller: FunctionLocation;
    edge: CallEdge;
    depth: number;
  }> = [];

  function traverse(name: string, depth: number): void {
    if (depth > maxDepth || visited.has(name)) return;
    visited.add(name);

    const edges = graph.backwardIndex.get(name) ?? [];
    for (const edge of edges) {
      result.push({ caller: edge.caller, edge, depth });
      traverse(edge.caller.qualifiedName, depth + 1);
    }
  }

  traverse(qualifiedName, 1);
  return result;
}

/**
 * Create a text content response for MCP tool results.
 */
function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/**
 * Create an error content response for MCP tool results.
 */
function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true as const,
  };
}

/**
 * Create and configure the Distil MCP server with all analysis tools
 * and prompt templates.
 */
export function createServer() {
  const server = new McpServer({
    name: "distil",
    version: VERSION,
  });

  // ---------------------------------------------------------------------------
  // Tool: distil_extract -- L1 AST extraction
  // ---------------------------------------------------------------------------
  server.tool(
    "distil_extract",
    "Extract code structure (functions, classes, imports) from a source file (L1 AST)",
    { file: z.string().describe("Path to source file") },
    async ({ file }) => {
      try {
        const filePath = resolve(file);
        const parser = getParser(filePath);
        if (!parser) {
          return errorResult(
            `No parser available for file: ${file}. Supported extensions: .ts, .tsx, .js, .jsx, .mjs, .cjs`,
          );
        }

        const source = await readFile(filePath, "utf-8");
        const moduleInfo = await parser.extractAST(source, filePath);
        return textResult(JSON.stringify(moduleInfo.toJSON(), null, 2));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Tool: distil_calls -- L2 call graph
  // ---------------------------------------------------------------------------
  server.tool(
    "distil_calls",
    "Build project-wide call graph showing function call relationships (L2)",
    { path: z.string().describe("Project root directory").default(".") },
    async ({ path }) => {
      try {
        const rootPath = resolve(path);
        const graph = await buildCallGraph(rootPath);
        return textResult(JSON.stringify(serializeCallGraph(graph), null, 2));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Tool: distil_impact -- L2 impact analysis
  // ---------------------------------------------------------------------------
  server.tool(
    "distil_impact",
    "Find all callers of a function for impact analysis (L2)",
    {
      function: z.string().describe("Function name to find callers of"),
      path: z.string().describe("Project root directory").default("."),
      depth: z.number().describe("Depth of transitive callers (1 = direct only)").default(1),
    },
    async (args) => {
      try {
        const rootPath = resolve(args.path);
        const graph = await buildCallGraph(rootPath);
        const functionName = args.function;

        // Fuzzy match: find all functions containing the search term
        const matches: FunctionLocation[] = [];
        for (const fn of graph.functions.values()) {
          if (
            fn.name.toLowerCase().includes(functionName.toLowerCase()) ||
            fn.qualifiedName.toLowerCase().includes(functionName.toLowerCase())
          ) {
            matches.push(fn);
          }
        }

        if (matches.length === 0) {
          const sample = Array.from(graph.functions.values())
            .slice(0, 10)
            .map((fn) => fn.qualifiedName);
          return errorResult(
            `No functions found matching "${functionName}". Available (first 10): ${sample.join(", ")}`,
          );
        }

        if (matches.length > 1) {
          const names = matches
            .slice(0, 20)
            .map((fn) => `${fn.qualifiedName} (${fn.file}:${fn.line})`);
          return errorResult(
            `Multiple functions match "${functionName}". Please be more specific:\n${names.join("\n")}`,
          );
        }

        const target = matches[0]!;
        const callers = findCallers(graph, target.qualifiedName, args.depth);

        return textResult(
          JSON.stringify(
            {
              target: {
                name: target.name,
                qualifiedName: target.qualifiedName,
                file: target.file,
                line: target.line,
              },
              depth: args.depth,
              callers: callers.map((c) => ({
                name: c.caller.name,
                qualifiedName: c.caller.qualifiedName,
                file: c.caller.file,
                line: c.caller.line,
                depth: c.depth,
              })),
              callerCount: callers.length,
            },
            null,
            2,
          ),
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Tool: distil_cfg -- L3 control flow graph
  // ---------------------------------------------------------------------------
  server.tool(
    "distil_cfg",
    "Extract control flow graph with complexity metrics for a function (L3)",
    {
      file: z.string().describe("Path to source file"),
      function: z.string().describe("Function name (or Class.method)"),
    },
    async (args) => {
      try {
        const filePath = resolve(args.file);
        const cfg = await extractCFG(filePath, args.function);

        if (!cfg) {
          return errorResult(`Function "${args.function}" not found in ${args.file}`);
        }

        const result = {
          ...cfg.toJSON(),
          complexityRating: getComplexityRating(cfg.cyclomaticComplexity),
        };
        return textResult(JSON.stringify(result, null, 2));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Tool: distil_dfg -- L4 data flow graph
  // ---------------------------------------------------------------------------
  server.tool(
    "distil_dfg",
    "Extract data flow graph with def-use chains for a function (L4)",
    {
      file: z.string().describe("Path to source file"),
      function: z.string().describe("Function name (or Class.method)"),
    },
    async (args) => {
      try {
        const filePath = resolve(args.file);
        const dfg = await extractDFG(filePath, args.function);

        if (!dfg) {
          return errorResult(`Function "${args.function}" not found in ${args.file}`);
        }

        return textResult(JSON.stringify(dfg.toJSON(), null, 2));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Tool: distil_slice -- L5 program slice
  // ---------------------------------------------------------------------------
  server.tool(
    "distil_slice",
    "Compute a program slice showing code that affects or is affected by a line (L5)",
    {
      file: z.string().describe("Path to source file"),
      function: z.string().describe("Function name (or Class.method)"),
      line: z.number().describe("Line number for slice criterion"),
      variable: z.string().describe("Variable name to focus the slice on").optional(),
      forward: z.boolean().describe("Compute forward slice (default: backward)").default(false),
    },
    async (args) => {
      try {
        const filePath = resolve(args.file);
        const pdg = await extractPDG(filePath, args.function);

        if (!pdg) {
          return errorResult(`Function "${args.function}" not found in ${args.file}`);
        }

        const sliceLines = args.forward
          ? pdg.forwardSlice(args.line, args.variable)
          : pdg.backwardSlice(args.line, args.variable);

        // Read source file for context
        const source = await readFile(filePath, "utf-8");
        const sourceLines = source.split("\n");
        const sortedLines = Array.from(sliceLines).sort((a, b) => a - b);

        const sliceSource: Array<{ line: number; text: string }> = [];
        for (const lineNum of sortedLines) {
          const lineIdx = lineNum - 1;
          sliceSource.push({
            line: lineNum,
            text: sourceLines[lineIdx] ?? "",
          });
        }

        return textResult(
          JSON.stringify(
            {
              function: args.function,
              file: args.file,
              criterion: {
                line: args.line,
                variable: args.variable ?? null,
              },
              direction: args.forward ? "forward" : "backward",
              lines: sortedLines,
              lineCount: sliceLines.size,
              source: sliceSource,
              pdgSummary: {
                nodes: pdg.nodes.length,
                controlDependencies: pdg.controlEdgeCount,
                dataDependencies: pdg.dataEdgeCount,
              },
            },
            null,
            2,
          ),
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Prompt: distil_before_editing
  // ---------------------------------------------------------------------------
  server.prompt(
    "distil_before_editing",
    "Gather context before editing a function: extract AST, check complexity, and run impact analysis",
    {
      file: z.string().describe("Path to source file"),
      function: z.string().describe("Function name to analyze before editing"),
    },
    ({ file, function: fn }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Before editing the function "${fn}" in ${file}, please gather context:`,
              "",
              `1. Use distil_extract on "${file}" to understand the file structure.`,
              `2. Use distil_cfg on "${file}" for function "${fn}" to check its cyclomatic complexity.`,
              `3. Use distil_impact for function "${fn}" to see what other code depends on it.`,
              "",
              "Then summarize:",
              "- The function's signature and parameters",
              "- Its complexity rating and control flow",
              "- Which other functions call it (impact radius)",
              "- Any risks or considerations for the planned change",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  // ---------------------------------------------------------------------------
  // Prompt: distil_debug_line
  // ---------------------------------------------------------------------------
  server.prompt(
    "distil_debug_line",
    "Debug a specific line by analyzing backward slice and data flow",
    {
      file: z.string().describe("Path to source file"),
      function: z.string().describe("Function name containing the line"),
      line: z.string().describe("Line number to debug"),
    },
    ({ file, function: fn, line }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Debug line ${line} in function "${fn}" in ${file}:`,
              "",
              `1. Use distil_slice on "${file}", function "${fn}", line ${line} (backward) to find all code that affects this line.`,
              `2. Use distil_dfg on "${file}", function "${fn}" to trace data flow and variable definitions reaching this line.`,
              "",
              "Then explain:",
              `- What variables are used at line ${line} and where they were defined`,
              "- What control flow paths lead to this line",
              "- Potential sources of bugs (uninitialized variables, unexpected values, etc.)",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  // ---------------------------------------------------------------------------
  // Prompt: distil_refactor_impact
  // ---------------------------------------------------------------------------
  server.prompt(
    "distil_refactor_impact",
    "Assess the impact of refactoring a function across the project",
    {
      function: z.string().describe("Function name to refactor"),
      path: z.string().describe("Project root directory").default("."),
    },
    ({ function: fn, path }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Assess the impact of refactoring "${fn}" in project at "${path}":`,
              "",
              `1. Use distil_calls on "${path}" to build the project call graph.`,
              `2. Use distil_impact for function "${fn}" with depth 3 to find all transitive callers.`,
              "",
              "Then provide:",
              `- List of all functions that directly call "${fn}"`,
              "- Transitive callers (indirect impact)",
              "- Files that would need to be updated",
              "- A risk assessment for the refactoring",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  async function start(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }

  return { server, start };
}
