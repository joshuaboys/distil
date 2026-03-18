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
import { pathToFileURL } from "url";
import { VERSION } from "@distil/core";

import { callsCommand } from "./commands/calls.js";
import { cfgCommand } from "./commands/cfg.js";
import { dfgCommand } from "./commands/dfg.js";
import { extractCommand } from "./commands/extract.js";
import { impactCommand } from "./commands/impact.js";
import { mcpCommand } from "./commands/mcp.js";
import { sliceCommand } from "./commands/slice.js";
import { treeCommand } from "./commands/tree.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("distil")
    .description("Token-efficient code analysis for LLMs")
    .version(VERSION)
    .option("--no-ignore", "Disable ignore rules (.distilignore and built-in ignores)")
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
  program.addCommand(mcpCommand);

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();

  // Show help (exit 0) when no args provided
  if (argv.length <= 2) {
    program.outputHelp();
    return;
  }

  await program.parseAsync(argv);
}

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  run().catch((error: unknown) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
