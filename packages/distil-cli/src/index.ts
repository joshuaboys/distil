#!/usr/bin/env node
/**
 * Distil CLI
 *
 * Token-efficient code analysis for LLMs.
 *
 * Usage:
 *   distil extract <file>           - Extract file structure (L1)
 *   distil tree [path]              - Show file tree
 *   distil structure [path]         - Show code structure
 *   distil context <func> --project - Get LLM-ready context
 *   distil calls [path]             - Build call graph (L2)
 *   distil impact <func> [path]     - Find all callers
 *   distil cfg <file> <func>        - Control flow graph (L3)
 *   distil dfg <file> <func>        - Data flow graph (L4)
 *   distil slice <file> <func> <line> - Program slice (L5)
 *   distil semantic <query>         - Semantic search
 *   distil warm [path]              - Build all indexes
 */

import { Command } from "commander";
import { resolve } from "path";
import { readFile, access } from "fs/promises";
import {
  buildCallGraph,
  extractCFG,
  extractDFG,
  extractPDG,
  getComplexityRating,
  getParser,
  VERSION,
} from "@distil/core";
import type {
  ProjectCallGraph,
  FunctionLocation,
  CallEdge,
  CFGInfo,
  DFGInfo,
  PDGInfo,
} from "@distil/core";

import { extractCommand } from "./commands/extract.js";
import { treeCommand } from "./commands/tree.js";

// Built-in methods to filter from call graph output
const BUILTIN_METHODS = new Set([
  // Array methods
  "push",
  "pop",
  "shift",
  "unshift",
  "slice",
  "splice",
  "concat",
  "join",
  "map",
  "filter",
  "reduce",
  "forEach",
  "find",
  "findIndex",
  "some",
  "every",
  "includes",
  "indexOf",
  "lastIndexOf",
  "sort",
  "reverse",
  "flat",
  "flatMap",
  "fill",
  "copyWithin",
  "at",
  "from",
  "of",
  "isArray",
  // String methods
  "split",
  "trim",
  "trimStart",
  "trimEnd",
  "toLowerCase",
  "toUpperCase",
  "replace",
  "replaceAll",
  "startsWith",
  "endsWith",
  "padStart",
  "padEnd",
  "repeat",
  "charAt",
  "charCodeAt",
  "codePointAt",
  "substring",
  "substr",
  "match",
  "matchAll",
  "search",
  "localeCompare",
  "normalize",
  "anchor",
  "link",
  // Object methods
  "toString",
  "valueOf",
  "toJSON",
  "toFixed",
  "toPrecision",
  "toLocaleString",
  "keys",
  "values",
  "entries",
  "fromEntries",
  "assign",
  "freeze",
  "seal",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  // Map/Set methods
  "has",
  "get",
  "set",
  "delete",
  "clear",
  "add",
  "size",
  // Console methods
  "log",
  "warn",
  "error",
  "info",
  "debug",
  "trace",
  "dir",
  "table",
  "time",
  "timeEnd",
  // Promise methods
  "then",
  "catch",
  "finally",
  "all",
  "race",
  "allSettled",
  "any",
  // JSON methods
  "parse",
  "stringify",
  // Global functions
  "isNaN",
  "isFinite",
  "parseInt",
  "parseFloat",
  "encodeURI",
  "decodeURI",
  "encodeURIComponent",
  "decodeURIComponent",
  "String",
  "Number",
  "Boolean",
  // Node fs methods
  "readFile",
  "writeFile",
  "readdir",
  "stat",
  "mkdir",
  "rmdir",
  "unlink",
  "access",
  "chmod",
  "chown",
  "copyFile",
  "rename",
  "appendFile",
  "isDirectory",
  "isFile",
  "isSymbolicLink",
  // Node path methods
  "resolve",
  "join",
  "dirname",
  "basename",
  "extname",
  "relative",
  "normalize",
  "parse",
  // Process methods
  "exit",
  "cwd",
  "chdir",
  "env",
  "argv",
  "nextTick",
  // Other common
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "setImmediate",
  "bind",
  "call",
  "apply",
  "signature",
]);

// Helper to check if file exists
async function checkFileExists(filePath: string, displayPath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    console.error(`File not found: ${displayPath}`);
    process.exit(1);
  }
}

// Helper to list available functions in a file
async function listAvailableFunctions(filePath: string): Promise<string[]> {
  const parser = getParser(filePath);
  if (!parser) return [];

  try {
    const source = await readFile(filePath, "utf-8");
    const moduleInfo = await parser.extractAST(source, filePath);
    const functions: string[] = [];

    for (const fn of moduleInfo.functions) {
      functions.push(fn.name);
    }
    for (const cls of moduleInfo.classes) {
      for (const method of cls.methods) {
        functions.push(`${cls.name}.${method.name}`);
      }
    }
    return functions;
  } catch {
    return [];
  }
}

// Fuzzy match function name
function fuzzyMatchFunction(searchTerm: string, available: string[]): string[] {
  const term = searchTerm.toLowerCase();
  return available.filter((fn) => fn.toLowerCase().includes(term) || fn.toLowerCase() === term);
}

const callsCommand = new Command("calls")
  .description("Build project call graph (L2)")
  .argument("[path]", "Project root", ".")
  .option("--json", "Output as JSON")
  .option("--limit <n>", "Limit edges in output", "20")
  .action(async (path: string, options: { json?: boolean; limit?: string }) => {
    try {
      const rootPath = resolve(path);
      const graph = await buildCallGraph(rootPath);
      const limit = parseInt(options.limit ?? "20", 10);

      if (options.json) {
        console.log(JSON.stringify(formatCallGraph(graph), null, 2));
        return;
      }

      printCallGraph(graph, limit);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

const impactCommand = new Command("impact")
  .description("Find all callers of a function (L2 impact analysis)")
  .argument("<function>", "Function name to analyze (fuzzy match)")
  .argument("[path]", "Project root", ".")
  .option("--depth <n>", "Depth of transitive callers (default: 1 = direct only)", "1")
  .option("--json", "Output as JSON")
  .action(
    async (functionName: string, path: string, options: { depth?: string; json?: boolean }) => {
      try {
        const rootPath = resolve(path);
        const depthRaw = parseInt(options.depth ?? "1", 10);
        if (Number.isNaN(depthRaw) || depthRaw < 1) {
          console.error(`Error: --depth must be a positive integer (got "${options.depth}")`);
          process.exit(1);
        }
        const depth = depthRaw;
        const graph = await buildCallGraph(rootPath);

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
          console.error(`No functions found matching "${functionName}"`);
          console.error(`\nAvailable functions (first 10):`);
          const allFunctions = Array.from(graph.functions.values()).slice(0, 10);
          for (const fn of allFunctions) {
            console.error(`  ${fn.qualifiedName}`);
          }
          process.exit(1);
        }

        if (matches.length > 1) {
          console.error(`Multiple functions match "${functionName}". Please be more specific:\n`);
          for (const fn of matches.slice(0, 20)) {
            console.error(`  ${fn.qualifiedName} (${fn.file}:${fn.line})`);
          }
          if (matches.length > 20) {
            console.error(`  ... and ${matches.length - 20} more`);
          }
          process.exit(1);
        }

        const target = matches[0]!;
        const callers = getCallersWithDepth(graph, target.qualifiedName, depth);

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                target: target,
                depth,
                callers: callers.map((c) => ({
                  caller: c.caller,
                  file: c.callSite.file,
                  line: c.callSite.line,
                  depth: c.depth,
                })),
                callerCount: callers.length,
              },
              null,
              2,
            ),
          );
          return;
        }

        printImpactResult(target, callers, depth, rootPath);
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    },
  );

// CFG command - Control Flow Graph (L3)
const cfgCommand = new Command("cfg")
  .description("Extract control flow graph for a function (L3)")
  .argument("<file>", "Source file path")
  .argument("<function>", "Function name (or Class.method)")
  .option("--json", "Output as JSON")
  .action(async (file: string, functionName: string, options: { json?: boolean }) => {
    try {
      const filePath = resolve(file);
      await checkFileExists(filePath, file);

      // Get available functions for fuzzy matching
      const available = await listAvailableFunctions(filePath);
      const matches = fuzzyMatchFunction(functionName, available);

      let targetFunction = functionName;
      if (matches.length === 0) {
        console.error(`Function "${functionName}" not found in ${file}`);
        if (available.length > 0) {
          console.error(`\nAvailable functions:`);
          for (const fn of available.slice(0, 15)) {
            console.error(`  ${fn}`);
          }
          if (available.length > 15) {
            console.error(`  ... and ${available.length - 15} more`);
          }
        }
        process.exit(1);
      } else if (matches.length > 1 && !matches.includes(functionName)) {
        console.error(`Multiple functions match "${functionName}":`);
        for (const fn of matches.slice(0, 10)) {
          console.error(`  ${fn}`);
        }
        process.exit(1);
      } else if (matches.length === 1) {
        targetFunction = matches[0]!;
      }

      const cfg = await extractCFG(filePath, targetFunction);

      if (!cfg) {
        console.error(`Function "${targetFunction}" not found in ${file}`);
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(cfg.toJSON(), null, 2));
        return;
      }

      printCFG(cfg, file);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// DFG command - Data Flow Graph (L4)
const dfgCommand = new Command("dfg")
  .description("Extract data flow graph for a function (L4)")
  .argument("<file>", "Source file path")
  .argument("<function>", "Function name (or Class.method)")
  .option("--json", "Output as JSON")
  .action(async (file: string, functionName: string, options: { json?: boolean }) => {
    try {
      const filePath = resolve(file);
      await checkFileExists(filePath, file);

      // Get available functions for fuzzy matching
      const available = await listAvailableFunctions(filePath);
      const matches = fuzzyMatchFunction(functionName, available);

      let targetFunction = functionName;
      if (matches.length === 0) {
        console.error(`Function "${functionName}" not found in ${file}`);
        if (available.length > 0) {
          console.error(`\nAvailable functions:`);
          for (const fn of available.slice(0, 15)) {
            console.error(`  ${fn}`);
          }
          if (available.length > 15) {
            console.error(`  ... and ${available.length - 15} more`);
          }
        }
        process.exit(1);
      } else if (matches.length > 1 && !matches.includes(functionName)) {
        console.error(`Multiple functions match "${functionName}":`);
        for (const fn of matches.slice(0, 10)) {
          console.error(`  ${fn}`);
        }
        process.exit(1);
      } else if (matches.length === 1) {
        targetFunction = matches[0]!;
      }

      const dfg = await extractDFG(filePath, targetFunction);

      if (!dfg) {
        console.error(`Function "${targetFunction}" not found in ${file}`);
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(dfg.toJSON(), null, 2));
        return;
      }

      printDFG(dfg, file);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// Slice command - Program Slicing (L5)
const sliceCommand = new Command("slice")
  .description("Compute program slice from a line (L5)")
  .argument("<file>", "Source file path")
  .argument("<function>", "Function name (or Class.method)")
  .argument("<line>", "Line number for slice criterion")
  .option("--var <variable>", "Variable name for slice criterion")
  .option("--forward", "Compute forward slice (default: backward)")
  .option("--json", "Output as JSON")
  .action(
    async (
      file: string,
      functionName: string,
      lineStr: string,
      options: { var?: string; forward?: boolean; json?: boolean },
    ) => {
      try {
        const filePath = resolve(file);
        await checkFileExists(filePath, file);

        const line = parseInt(lineStr, 10);
        if (Number.isNaN(line) || line < 1) {
          console.error("Line number must be a positive integer");
          process.exit(1);
        }

        // Get available functions for fuzzy matching
        const available = await listAvailableFunctions(filePath);
        const matches = fuzzyMatchFunction(functionName, available);

        let targetFunction = functionName;
        if (matches.length === 0) {
          console.error(`Function "${functionName}" not found in ${file}`);
          if (available.length > 0) {
            console.error(`\nAvailable functions:`);
            for (const fn of available.slice(0, 15)) {
              console.error(`  ${fn}`);
            }
            if (available.length > 15) {
              console.error(`  ... and ${available.length - 15} more`);
            }
          }
          process.exit(1);
        } else if (matches.length > 1 && !matches.includes(functionName)) {
          console.error(`Multiple functions match "${functionName}":`);
          for (const fn of matches.slice(0, 10)) {
            console.error(`  ${fn}`);
          }
          process.exit(1);
        } else if (matches.length === 1) {
          targetFunction = matches[0]!;
        }

        const pdg = await extractPDG(filePath, targetFunction);

        if (!pdg) {
          console.error(`Function "${targetFunction}" not found in ${file}`);
          process.exit(1);
        }

        // Check if line is within function range (compute from CFG blocks)
        const blocks = pdg.cfg.blocks;
        if (blocks.length > 0) {
          const minLine = Math.min(...blocks.map((b) => b.lines[0]));
          const maxLine = Math.max(...blocks.map((b) => b.lines[1]));
          if (line < minLine || line > maxLine) {
            console.error(
              `Warning: Line ${line} is outside function range (${minLine}-${maxLine})`,
            );
          }
        }

        const sliceLines = options.forward
          ? pdg.forwardSlice(line, options.var)
          : pdg.backwardSlice(line, options.var);

        // Read source file for context
        const source = await readFile(filePath, "utf-8");
        const sourceLines = source.split("\n");

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                function: targetFunction,
                file,
                criterion: { line, variable: options.var ?? null },
                direction: options.forward ? "forward" : "backward",
                lines: Array.from(sliceLines).sort((a, b) => a - b),
                lineCount: sliceLines.size,
              },
              null,
              2,
            ),
          );
          return;
        }

        printSlice(
          pdg,
          sliceLines,
          sourceLines,
          line,
          options.var ?? null,
          options.forward ?? false,
          file,
        );
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    },
  );

const program = new Command();

program
  .name("distil")
  .description("Token-efficient code analysis for LLMs")
  .version(VERSION)
  .addHelpText(
    "after",
    `
Quick start:
  $ distil tree .                              # See project structure
  $ distil extract src/index.ts                # Extract file analysis
  $ distil calls .                             # Build call graph
  $ distil impact myFunction .                 # Find all callers
  $ distil cfg src/index.ts myFunction         # Control flow graph
  $ distil slice src/index.ts myFunction 42    # What affects line 42?

Supported languages: TypeScript, JavaScript`,
  );

// Register commands
program.addCommand(extractCommand);
program.addCommand(treeCommand);
program.addCommand(callsCommand);
program.addCommand(impactCommand);
program.addCommand(cfgCommand);
program.addCommand(dfgCommand);
program.addCommand(sliceCommand);

// Show help (exit 0) when no args provided
if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

// Parse arguments
program.parse();

function formatCallGraph(graph: ProjectCallGraph) {
  return {
    projectRoot: graph.projectRoot,
    files: graph.files,
    builtAt: graph.builtAt,
    functions: Array.from(graph.functions.values()),
    edges: graph.edges,
    forwardIndex: Object.fromEntries(
      Array.from(graph.forwardIndex.entries()).map(([key, value]) => [key, value]),
    ),
    backwardIndex: Object.fromEntries(
      Array.from(graph.backwardIndex.entries()).map(([key, value]) => [key, value]),
    ),
  };
}

function printCallGraph(graph: ProjectCallGraph, limit: number): void {
  // Filter out edges to builtin methods
  const filteredEdges = graph.edges.filter((edge) => {
    if (edge.calleeLocation) return true; // Resolved calls are always shown
    return !BUILTIN_METHODS.has(edge.callee);
  });

  console.log(
    `\nCall Graph: ${graph.functions.size} functions, ${filteredEdges.length} edges, ${graph.files.length} files`,
  );

  if (filteredEdges.length === 0) {
    console.log("No call edges found.");
    return;
  }

  const edges = filteredEdges.slice(0, limit);
  console.log("\nEdges:");
  for (const edge of edges) {
    const calleeName = edge.calleeLocation?.qualifiedName ?? edge.callee;
    const unresolved = edge.calleeLocation ? "" : " (unresolved)";
    console.log(`  ${edge.caller.qualifiedName} -> ${calleeName}${unresolved}`);
  }

  if (filteredEdges.length > edges.length) {
    console.log(`\n... and ${filteredEdges.length - edges.length} more edges`);
  }
}

interface CallerWithDepth {
  caller: FunctionLocation;
  callSite: CallEdge["callSite"];
  depth: number;
}

function getCallersWithDepth(
  graph: ProjectCallGraph,
  qualifiedName: string,
  maxDepth: number,
): CallerWithDepth[] {
  const visited = new Set<string>();
  const result: CallerWithDepth[] = [];

  function traverse(name: string, depth: number): void {
    if (depth > maxDepth || visited.has(name)) return;
    visited.add(name);

    const edges = graph.backwardIndex.get(name) ?? [];
    for (const edge of edges) {
      result.push({
        caller: edge.caller,
        callSite: edge.callSite,
        depth,
      });
      traverse(edge.caller.qualifiedName, depth + 1);
    }
  }

  traverse(qualifiedName, 1);
  return result;
}

function printImpactResult(
  target: FunctionLocation,
  callers: CallerWithDepth[],
  depth: number,
  rootPath: string,
): void {
  const relativePath = target.file.replace(rootPath + "/", "");
  console.log(`\nImpact Analysis: ${target.name}`);
  console.log(`   ${relativePath}:${target.line}`);
  console.log(`   Qualified: ${target.qualifiedName}`);
  console.log("-".repeat(50));

  if (callers.length === 0) {
    console.log("\nNo callers found - this function appears to be unused or is an entry point.");
    return;
  }

  const directCallers = callers.filter((c) => c.depth === 1);
  const transitiveCallers = callers.filter((c) => c.depth > 1);

  console.log(`\nDirect callers (${directCallers.length}):`);
  for (const caller of directCallers) {
    const callerRelPath = caller.callSite.file.replace(rootPath + "/", "");
    console.log(`   ${caller.caller.qualifiedName}`);
    console.log(`      at ${callerRelPath}:${caller.callSite.line}`);
  }

  if (depth > 1 && transitiveCallers.length > 0) {
    console.log(`\nTransitive callers (${transitiveCallers.length}):`);
    for (const caller of transitiveCallers) {
      const callerRelPath = caller.callSite.file.replace(rootPath + "/", "");
      const indent = "   " + "  ".repeat(caller.depth - 1);
      console.log(`${indent}<- ${caller.caller.qualifiedName} (depth ${caller.depth})`);
      console.log(`${indent}   at ${callerRelPath}:${caller.callSite.line}`);
    }
  }

  // Summary
  const affectedFiles = new Set(callers.map((c) => c.callSite.file));
  console.log(`\nSummary:`);
  console.log(`   ${callers.length} total callers across ${affectedFiles.size} files`);
  if (depth === 1 && callers.length > 0) {
    console.log(`   Use --depth <n> to see transitive callers`);
  }
  console.log("");
}

function printCFG(cfg: CFGInfo, file: string): void {
  const rating = getComplexityRating(cfg.cyclomaticComplexity);

  console.log(`\nControl Flow Graph: ${cfg.functionName}`);
  console.log(`   File: ${file}`);
  console.log("-".repeat(50));

  console.log(`\nMetrics:`);
  console.log(`   Cyclomatic Complexity: ${cfg.cyclomaticComplexity} (${rating})`);
  console.log(`   Max Nesting Depth: ${cfg.maxNestingDepth}`);
  console.log(`   Decision Points: ${cfg.decisionPoints}`);
  console.log(`   Basic Blocks: ${cfg.blocks.length}`);
  console.log(`   Edges: ${cfg.edges.length}`);

  console.log(`\nBlocks:`);
  for (const block of cfg.blocks) {
    const lines =
      block.lines[0] === block.lines[1]
        ? `L${block.lines[0]}`
        : `L${block.lines[0]}-${block.lines[1]}`;
    console.log(`   [${block.id}] ${block.type} (${lines})`);
    if (block.statements.length > 0) {
      const stmt = block.statements[0] ?? "";
      const truncated = stmt.length > 50 ? stmt.slice(0, 47) + "..." : stmt;
      console.log(`       ${truncated}`);
    }
  }

  console.log(`\nEdges:`);
  for (const edge of cfg.edges) {
    const condition = edge.condition ? ` [${edge.condition}]` : "";
    const backEdge = edge.isBackEdge ? " (back)" : "";
    console.log(`   ${edge.from} -> ${edge.to} (${edge.type})${condition}${backEdge}`);
  }

  console.log("");
}

function printDFG(dfg: DFGInfo, file: string): void {
  console.log(`\nData Flow Graph: ${dfg.functionName}`);
  console.log(`   File: ${file}`);
  console.log("-".repeat(50));

  console.log(`\nVariables (${dfg.variables.length}):`);
  console.log(`   ${dfg.variables.join(", ")}`);

  console.log(`\nParameters (${dfg.parameters.length}):`);
  for (const param of dfg.parameters) {
    console.log(`   ${param.name} (L${param.line})`);
  }

  console.log(`\nReturns (${dfg.returns.length}):`);
  for (const ret of dfg.returns) {
    console.log(`   ${ret.name} (L${ret.line})`);
  }

  const defs = dfg.refs.filter((r) => r.type === "def" || r.type === "param");
  const uses = dfg.refs.filter((r) => r.type === "use");
  const updates = dfg.refs.filter((r) => r.type === "update");

  console.log(`\nReferences:`);
  console.log(`   Definitions: ${defs.length}`);
  console.log(`   Uses: ${uses.length}`);
  console.log(`   Updates: ${updates.length}`);

  console.log(`\nDef-Use Edges (${dfg.edges.length}):`);
  const edgesToShow = dfg.edges.slice(0, 15);
  for (const edge of edgesToShow) {
    const mayReach = edge.isMayReach ? " (may)" : "";
    console.log(`   ${edge.variable}: L${edge.def.line} -> L${edge.use.line}${mayReach}`);
  }
  if (dfg.edges.length > 15) {
    console.log(`   ... and ${dfg.edges.length - 15} more edges`);
  }

  console.log("");
}

function printSlice(
  pdg: PDGInfo,
  sliceLines: Set<number>,
  sourceLines: string[],
  criterionLine: number,
  variable: string | null,
  isForward: boolean,
  file: string,
): void {
  const direction = isForward ? "Forward" : "Backward";
  const varStr = variable ? ` on '${variable}'` : "";

  console.log(`\n${direction} Slice${varStr}`);
  console.log(`   File: ${file}`);
  console.log(`   Function: ${pdg.functionName}`);
  console.log(`   Criterion: Line ${criterionLine}`);
  console.log("-".repeat(50));

  const sortedLines = Array.from(sliceLines).sort((a, b) => a - b);

  console.log(`\nSlice (${sortedLines.length} lines):\n`);

  for (const lineNum of sortedLines) {
    const lineIdx = lineNum - 1;
    const sourceLine = sourceLines[lineIdx] ?? "";
    const marker = lineNum === criterionLine ? ">>>" : "   ";
    const lineStr = String(lineNum).padStart(4, " ");
    console.log(`${marker} ${lineStr} | ${sourceLine}`);
  }

  console.log(`\nSummary:`);
  console.log(`   Total lines in slice: ${sortedLines.length}`);
  console.log(`   PDG nodes: ${pdg.nodes.length}`);
  console.log(`   Control dependencies: ${pdg.controlEdgeCount}`);
  console.log(`   Data dependencies: ${pdg.dataEdgeCount}`);
  console.log("");
}
