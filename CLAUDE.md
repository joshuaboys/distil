# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TLDR is a token-efficient code analysis tool for LLMs. It extracts code *structure* instead of dumping raw text, achieving ~95% token reduction while preserving everything needed to understand and edit code.

The tool provides 5 analysis layers:
- **L1: AST** - Functions, classes, imports, signatures
- **L2: Call Graph** - Forward/backward edges, impact analysis
- **L3: CFG** - Control flow, cyclomatic complexity
- **L4: DFG** - Data flow, def-use chains
- **L5: PDG** - Program dependence, slicing

Currently only L1 is implemented. L2-L5 are planned.

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
pnpm -F @edda-tldr/core test

# Run a single test file
pnpm -F @edda-tldr/core test src/parsers/typescript.test.ts

# Watch mode for tests
pnpm -F @edda-tldr/core test:watch
```

## Package Structure

This is a pnpm monorepo with two packages:

- **`packages/tldr-core`** (`@edda-tldr/core`) - Analysis engine with tree-sitter parsers
- **`packages/tldr-cli`** (`@edda-tldr/cli`) - Command-line interface using Commander

The CLI depends on core. Core will eventually depend on `@kindling/core` and `@kindling/store-sqlite` for caching.

## Architecture

### Parser System

Parsers implement the `LanguageParser` interface in `packages/tldr-core/src/parsers/base.ts`. Each parser provides extraction methods for all 5 analysis layers.

The `TypeScriptParser` class (`packages/tldr-core/src/parsers/typescript.ts`) handles both TypeScript and JavaScript files (.ts, .tsx, .js, .jsx, .mjs, .cjs). It uses tree-sitter for parsing with lazy initialization.

Key types are in `packages/tldr-core/src/types/`:
- `ast.ts` - L1 types (ModuleInfo, FunctionInfo, ClassInfo, etc.)
- `callgraph.ts`, `cfg.ts`, `dfg.ts`, `pdg.ts` - L2-L5 types (stubs)
- `common.ts` - Shared types (Language, SourceRange, etc.)

### CLI Commands

Commands are in `packages/tldr-cli/src/commands/`. Currently implemented:
- `extract` - Extract file structure (L1)
- `tree` - Show file tree

Each command is a Commander subcommand registered in the main index.

## TypeScript Configuration

Strict TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled. Uses ES modules with NodeNext resolution.

## Planning

Roadmap and module specs are in `plans/` using APS format. Start at `plans/index.aps.md`.
