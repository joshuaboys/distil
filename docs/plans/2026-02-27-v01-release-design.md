# v0.1 Release — Design

## Goal

Get Distil to a clean, working v0.1 state: build passes, tests pass, docs reflect reality, MCP server implemented.

## Scope

### In scope

- Fix broken build (kindling module type errors)
- Commit uncommitted kindling integration work
- Update stale APS plans to reflect actual milestone status
- Update README and CLAUDE.md to match reality
- Implement `@distil/mcp` package (MCP server exposing all analysis layers)
- Add `distil mcp` CLI subcommand
- Ensure CI passes on main

### Out of scope (deferred)

- npm publishing / registry setup
- Semantic search (M5)
- Multi-language support (M7)
- Monorepo workspace detection

## Architecture

### MCP Server (`@distil/mcp`)

New package at `packages/distil-mcp/`. Exposes Distil analysis via Model Context Protocol using stdio transport.

**Tools:**

- `distil_tree` — File tree structure
- `distil_extract` — L1 AST extraction
- `distil_calls` — L2 call graph
- `distil_impact` — L2 impact analysis
- `distil_cfg` — L3 control flow graph
- `distil_dfg` — L4 data flow graph
- `distil_slice` — L5 program slicing

**Dependencies:** `@distil/core`, `@modelcontextprotocol/sdk`

**Transport:** stdio (started via `distil mcp` or configured in editor settings)

## Workstreams

1. **Fix build + kindling** — Fix type errors, commit kindling module, verify build + tests
2. **Project hygiene** — Update APS plans, README, CLAUDE.md
3. **MCP server** — New package implementing MCP protocol

Streams 2 and 3 can run in parallel after stream 1 completes.
