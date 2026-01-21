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
import { buildCallGraph, VERSION, type ProjectCallGraph, type FunctionLocation, type CallEdge } from '@edda-distil/core';

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

const impactCommand = new Command('impact')
  .description('Find all callers of a function (L2 impact analysis)')
  .argument('<function>', 'Function name to analyze (fuzzy match)')
  .argument('[path]', 'Project root', '.')
  .option('--depth <n>', 'Depth of transitive callers (default: 1 = direct only)', '1')
  .option('--json', 'Output as JSON')
  .action(async (functionName: string, path: string, options: { depth?: string; json?: boolean }) => {
    try {
      const rootPath = resolve(path);
      const depthRaw = parseInt(options.depth ?? '1', 10);
      if (Number.isNaN(depthRaw) || depthRaw < 1) {
        console.error(`Error: --depth must be a positive integer (got "${options.depth}")`);
        process.exit(1);
      }
      const depth = depthRaw;
      const graph = await buildCallGraph(rootPath);

      // Fuzzy match: find all functions containing the search term
      const matches: FunctionLocation[] = [];
      for (const fn of graph.functions.values()) {
        if (fn.name.toLowerCase().includes(functionName.toLowerCase()) ||
            fn.qualifiedName.toLowerCase().includes(functionName.toLowerCase())) {
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
        console.log(JSON.stringify({
          target: target,
          depth,
          callers: callers.map(c => ({
            caller: c.caller,
            file: c.callSite.file,
            line: c.callSite.line,
            depth: c.depth,
          })),
          callerCount: callers.length,
        }, null, 2));
        return;
      }

      printImpactResult(target, callers, depth, rootPath);
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
program.addCommand(impactCommand);

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

interface CallerWithDepth {
  caller: FunctionLocation;
  callSite: CallEdge['callSite'];
  depth: number;
}

function getCallersWithDepth(
  graph: ProjectCallGraph,
  qualifiedName: string,
  maxDepth: number
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
  rootPath: string
): void {
  const relativePath = target.file.replace(rootPath + '/', '');
  console.log(`\n🎯 Impact Analysis: ${target.name}`);
  console.log(`   ${relativePath}:${target.line}`);
  console.log(`   Qualified: ${target.qualifiedName}`);
  console.log('─'.repeat(50));

  if (callers.length === 0) {
    console.log('\n✅ No callers found - this function appears to be unused or is an entry point.');
    return;
  }

  const directCallers = callers.filter(c => c.depth === 1);
  const transitiveCallers = callers.filter(c => c.depth > 1);

  console.log(`\n📞 Direct callers (${directCallers.length}):`);
  for (const caller of directCallers) {
    const callerRelPath = caller.callSite.file.replace(rootPath + '/', '');
    console.log(`   ${caller.caller.qualifiedName}`);
    console.log(`      └─ ${callerRelPath}:${caller.callSite.line}`);
  }

  if (depth > 1 && transitiveCallers.length > 0) {
    console.log(`\n🔗 Transitive callers (${transitiveCallers.length}):`);
    for (const caller of transitiveCallers) {
      const callerRelPath = caller.callSite.file.replace(rootPath + '/', '');
      const indent = '   ' + '  '.repeat(caller.depth - 1);
      console.log(`${indent}↖ ${caller.caller.qualifiedName} (depth ${caller.depth})`);
      console.log(`${indent}  └─ ${callerRelPath}:${caller.callSite.line}`);
    }
  }

  // Summary
  const affectedFiles = new Set(callers.map(c => c.callSite.file));
  console.log(`\n📊 Summary:`);
  console.log(`   ${callers.length} total callers across ${affectedFiles.size} files`);
  if (depth === 1 && callers.length > 0) {
    console.log(`   Use --depth <n> to see transitive callers`);
  }
  console.log('');
}
