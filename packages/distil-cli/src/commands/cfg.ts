/**
 * CFG command
 *
 * Extracts control flow graph for a function (L3).
 */

import { Command } from "commander";
import { resolve } from "path";
import { extractCFG, getComplexityRating, isIgnoredPath } from "@distil/core";
import type { CFGInfo } from "@distil/core";
import { resolveCliIgnoreOptions } from "../ignore.js";
import { checkFileExists, listAvailableFunctions, fuzzyMatchFunction } from "./helpers.js";

export const cfgCommand = new Command("cfg")
  .description("Extract control flow graph for a function (L3)")
  .argument("<file>", "Source file path")
  .argument("<function>", "Function name (or Class.method)")
  .option("--json", "Output as JSON")
  .action(async (file: string, functionName: string, options: { json?: boolean }, cmd: Command) => {
    try {
      const filePath = resolve(file);
      await checkFileExists(filePath, file);
      const ignoreOptions = resolveCliIgnoreOptions(cmd);
      const ignored = await isIgnoredPath(filePath, ignoreOptions);
      if (ignored) {
        console.error(`File is ignored: ${file}. Use --no-ignore to analyze ignored files.`);
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
