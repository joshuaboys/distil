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

import { Command } from 'commander';
import { resolve } from 'path';
import { buildCallGraph, VERSION, type ProjectCallGraph } from '@edda-distil/core';

import { extractCommand } from './commands/extract.js';
import { treeCommand } from './commands/tree.js';

const callsCommand = new Command('calls')
  .description('Build project call graph (L2)')
  .argument('[path]', 'Project root', '.')
  .option('--json', 'Output as JSON')
  .option('--limit <n>', 'Limit edges in output', '20')
  .action(async (path: string, options: { json?: boolean; limit?: string }) => {
    try {
      const rootPath = resolve(path);
      const graph = await buildCallGraph(rootPath);
      const limit = parseInt(options.limit ?? '20', 10);

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

const program = new Command();

program
  .name('distil')
  .description('Token-efficient code analysis for LLMs')
  .version(VERSION);

// Register commands
program.addCommand(extractCommand);
program.addCommand(treeCommand);
program.addCommand(callsCommand);

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
      Array.from(graph.forwardIndex.entries()).map(([key, value]) => [key, value])
    ),
    backwardIndex: Object.fromEntries(
      Array.from(graph.backwardIndex.entries()).map(([key, value]) => [key, value])
    ),
  };
}

function printCallGraph(graph: ProjectCallGraph, limit: number): void {
  console.log(
    `\n📞 Call Graph (${graph.functions.size} functions, ${graph.edges.length} edges, ${graph.files.length} files)`
  );

  if (graph.edges.length === 0) {
    console.log('No call edges found.');
    return;
  }

  const edges = graph.edges.slice(0, limit);
  console.log('\nEdges:');
  for (const edge of edges) {
    const calleeName = edge.calleeLocation?.qualifiedName ?? edge.callee;
    const unresolved = edge.calleeLocation ? '' : ' (unresolved)';
    console.log(`  ${edge.caller.qualifiedName} → ${calleeName}${unresolved}`);
  }

  if (graph.edges.length > edges.length) {
    console.log(`\n... and ${graph.edges.length - edges.length} more edges`);
  }
}
