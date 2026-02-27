# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Distil is a token-efficient code analysis tool for LLMs. It extracts code _structure_ instead of dumping raw text, achieving ~95% token reduction while preserving everything needed to understand and edit code.

The tool provides 5 analysis layers:

- **L1: AST** - Functions, classes, imports, signatures
- **L2: Call Graph** - Forward/backward edges, impact analysis
- **L3: CFG** - Control flow, cyclomatic complexity
- **L4: DFG** - Data flow, def-use chains
- **L5: PDG** - Program dependence, slicing

All five layers (L1-L5) are implemented for TypeScript/JavaScript.

## Build & Test Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Type check
pnpm typecheck

# Run tests in a specific package
pnpm -F @distil/core test

# Run a single test file
pnpm -F @distil/core test src/parsers/typescript.test.ts

# Watch mode for tests
pnpm -F @distil/core test:watch
```

## Package Structure

This is a pnpm monorepo with these packages:

- **`packages/distil-core`** (`@distil/core`) - Analysis engine with tree-sitter parsers
- **`packages/distil-cli`** (`@distil/cli`) - Command-line interface using Commander
- **`packages/distil-mcp`** (`@distil/mcp`) - MCP server for editor/agent integration (in progress)

The CLI depends on core. The MCP server depends on core and `@modelcontextprotocol/sdk`.

## Architecture

### Parser System

Parsers implement the `LanguageParser` interface in `packages/distil-core/src/parsers/base.ts`. Each parser provides extraction methods for all 5 analysis layers.

The `TypeScriptParser` class (`packages/distil-core/src/parsers/typescript.ts`) handles both TypeScript and JavaScript files (.ts, .tsx, .js, .jsx, .mjs, .cjs). It uses tree-sitter for parsing with lazy initialization. The parser includes builders for all layers: AST extraction, call extraction, CFGBuilder, DFGBuilder, and PDGBuilder.

Key types are in `packages/distil-core/src/types/`:

- `ast.ts` - L1 types (ModuleInfo, FunctionInfo, ClassInfo, etc.)
- `callgraph.ts` - L2 types (ProjectCallGraph, CallEdge, FunctionLocation)
- `cfg.ts` - L3 types (CFGInfo, BasicBlock, CFGEdge)
- `dfg.ts` - L4 types (DFGInfo, VariableRef, DefUseChain)
- `pdg.ts` - L5 types (PDGInfo, PDGNode, PDGEdge, backwardSlice/forwardSlice)
- `common.ts` - Shared types (Language, SourceRange, etc.)

### High-Level Extractors

`packages/distil-core/src/extractors.ts` provides convenience functions (`extractCFG`, `extractDFG`, `extractPDG`) that handle file reading and parser selection. The `buildCallGraph` function in `index.ts` constructs the project-wide L2 call graph.

### Ignore System

`packages/distil-core/src/ignore/` implements `.distilignore` support using `.gitignore` syntax. The `createIgnoreMatcher` function builds a matcher that is used by file collection and all analysis commands. Supports `--no-ignore` override via the CLI.

### Kindling Integration

`packages/distil-core/src/kindling/` provides the caching layer using Kindling for persisting analysis results as observations.

### CLI Commands

Commands are in `packages/distil-cli/src/commands/` and registered in the main index. Implemented commands:

- `tree` - Show file tree structure
- `extract` - Extract file structure (L1 AST)
- `calls` - Build project call graph (L2)
- `impact` - Find all callers of a function (L2)
- `cfg` - Control flow graph with complexity (L3)
- `dfg` - Data flow graph with def-use chains (L4)
- `slice` - Program slice, backward/forward (L5)

## TypeScript Configuration

Strict TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled. Uses ES modules with NodeNext resolution.

## Planning

Roadmap and module specs are in `plans/` using APS format. Start at `plans/index.aps.md`.
