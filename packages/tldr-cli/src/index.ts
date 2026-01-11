#!/usr/bin/env node
/**
 * TLDR CLI
 *
 * Token-efficient code analysis for LLMs.
 *
 * Usage:
 *   tldr extract <file>           - Extract file structure (L1)
 *   tldr tree [path]              - Show file tree
 *   tldr structure [path]         - Show code structure
 *   tldr context <func> --project - Get LLM-ready context
 *   tldr calls [path]             - Build call graph (L2)
 *   tldr impact <func> [path]     - Find all callers
 *   tldr cfg <file> <func>        - Control flow graph (L3)
 *   tldr dfg <file> <func>        - Data flow graph (L4)
 *   tldr slice <file> <func> <line> - Program slice (L5)
 *   tldr semantic <query>         - Semantic search
 *   tldr warm [path]              - Build all indexes
 */

import { Command } from 'commander';
import { VERSION } from '@edda-tldr/core';

import { extractCommand } from './commands/extract.js';
import { treeCommand } from './commands/tree.js';

const program = new Command();

program
  .name('tldr')
  .description('Token-efficient code analysis for LLMs')
  .version(VERSION);

// Register commands
program.addCommand(extractCommand);
program.addCommand(treeCommand);

// Parse arguments
program.parse();
