/**
 * Impact command
 *
 * Find all callers of a function (L2 impact analysis).
 */

import { Command } from "commander";
import { resolve } from "path";
import { buildCallGraph, findCallers } from "@distil/core";
import type { FunctionLocation, CallerWithDepth } from "@distil/core";
import { resolveCliIgnoreOptions } from "../ignore.js";

export const impactCommand = new Command("impact")
  .description("Find all callers of a function (L2 impact analysis)")
  .argument("<function>", "Function name to analyze (fuzzy match)")
  .argument("[path]", "Project root", ".")
  .option("--depth <n>", "Depth of transitive callers (default: 1 = direct only)", "1")
  .option("--json", "Output as JSON")
  .action(
    async (
      functionName: string,
      path: string,
      options: { depth?: string; json?: boolean },
      cmd: Command,
    ) => {
      try {
        const rootPath = resolve(path);
        const ignoreOptions = resolveCliIgnoreOptions(cmd);
        const depthRaw = parseInt(options.depth ?? "1", 10);
        if (Number.isNaN(depthRaw) || depthRaw < 1) {
          console.error(`Error: --depth must be a positive integer (got "${options.depth}")`);
          process.exit(1);
        }
        const depth = depthRaw;
        const graph = await buildCallGraph(rootPath, ignoreOptions);

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
        const callers = findCallers(graph, target.qualifiedName, depth);

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                target: target,
                depth,
                callers: callers.map((c) => ({
                  caller: c.caller,
                  file: c.edge.callSite.file,
                  line: c.edge.callSite.line,
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
    const callerRelPath = caller.edge.callSite.file.replace(rootPath + "/", "");
    console.log(`   ${caller.caller.qualifiedName}`);
    console.log(`      at ${callerRelPath}:${caller.edge.callSite.line}`);
  }

  if (depth > 1 && transitiveCallers.length > 0) {
    console.log(`\nTransitive callers (${transitiveCallers.length}):`);
    for (const caller of transitiveCallers) {
      const callerRelPath = caller.edge.callSite.file.replace(rootPath + "/", "");
      const indent = "   " + "  ".repeat(caller.depth - 1);
      console.log(`${indent}<- ${caller.caller.qualifiedName} (depth ${caller.depth})`);
      console.log(`${indent}   at ${callerRelPath}:${caller.edge.callSite.line}`);
    }
  }

  // Summary
  const affectedFiles = new Set(callers.map((c) => c.edge.callSite.file));
  console.log(`\nSummary:`);
  console.log(`   ${callers.length} total callers across ${affectedFiles.size} files`);
  if (depth === 1 && callers.length > 0) {
    console.log(`   Use --depth <n> to see transitive callers`);
  }
  console.log("");
}
