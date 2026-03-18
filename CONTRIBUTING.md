# Contributing to Distil

## Prerequisites

- [pnpm](https://pnpm.io)
- Node 18+
- Git

## Setup

```sh
git clone https://github.com/joshuaboys/distil.git
cd distil
pnpm install
```

## Development

Build all packages:

```sh
pnpm build
```

Run tests:

```sh
pnpm test
```

Type check:

```sh
pnpm typecheck
```

Lint and format:

```sh
pnpm lint
pnpm format
```

## Project structure

```
packages/
  distil-core   # Analysis engine (tree-sitter parsers, L1-L5 extractors)
  distil-cli    # Command-line interface (Commander.js)
  distil-mcp    # MCP server for editor/agent integration
```

## Conventions

- TypeScript monorepo, built with pnpm workspaces
- Tree-sitter for all language parsing
- Conventional commits (`feat:`, `fix:`, `docs:`, etc.)
- ESLint + Prettier enforced via pre-commit hooks
