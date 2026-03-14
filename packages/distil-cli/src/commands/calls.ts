/**
 * Calls command
 *
 * Builds project call graph (L2).
 */

import { Command } from "commander";
import { resolve } from "path";
import { buildCallGraph, isBuiltinMethod } from "@distil/core";
import type { ProjectCallGraph } from "@distil/core";
import { resolveCliIgnoreOptions } from "../ignore.js";

export const callsCommand = new Command("calls")
  .description("Build project call graph (L2)")
  .argument("[path]", "Project root", ".")
  .option("--json", "Output as JSON")
  .option("--limit <n>", "Limit edges in output", "20")
  .action(async (path: string, options: { json?: boolean; limit?: string }, cmd: Command) => {
    try {
      const rootPath = resolve(path);
      const ignoreOptions = resolveCliIgnoreOptions(cmd);
      const graph = await buildCallGraph(rootPath, ignoreOptions);
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
    return !isBuiltinMethod(edge.callee);
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
