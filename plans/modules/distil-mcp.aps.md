# @distil/mcp

| Scope | Owner  | Priority | Status  |
| ----- | ------ | -------- | ------- |
| MCP   | @aneki | medium   | Planned |

## Purpose

Exposes Distil's analysis capabilities via the Model Context Protocol (MCP). Enables editors, agents, and other MCP clients to query code structure, call graphs, control flow, data flow, and program slices without shelling out to the CLI.

This is the integration surface for editor plugins and AI coding agents that support MCP.

## In Scope

- MCP server implementation (stdio transport)
- Tool definitions for all analysis layers (L1-L5)
- Resource definitions for project structure
- Prompt templates for common analysis workflows
- Configuration via environment variables and MCP config

## Out of Scope

- Analysis implementation (distil-core)
- CLI commands (distil-cli)
- Editor-specific plugins (VS Code extension, etc.)
- Custom transport protocols (HTTP, WebSocket)

## Interfaces

**Depends on:**

- @distil/core -- all analysis functions
- @modelcontextprotocol/sdk -- MCP server framework

**Exposes (MCP Tools):**

- `distil_tree` -- file tree structure
- `distil_extract` -- L1 AST extraction
- `distil_calls` -- L2 call graph
- `distil_impact` -- L2 reverse call graph
- `distil_cfg` -- L3 control flow graph
- `distil_dfg` -- L4 data flow graph
- `distil_slice` -- L5 program slice
- `distil_search` -- semantic search (when available)

**Exposes (MCP Resources):**

- `distil://project/structure` -- project overview
- `distil://project/callgraph` -- cached call graph

**Exposes (MCP Prompts):**

- `distil_before_editing` -- context needed before editing a function
- `distil_debug_line` -- context needed to debug a specific line
- `distil_refactor_impact` -- what would break if we change this

## Boundary Rules

- MCP server must not implement analysis logic; delegate to CORE
- MCP server must return structured JSON for tool results
- MCP server must handle errors gracefully and return helpful messages
- MCP server must support stdio transport for editor integration
- MCP server must be runnable standalone or via `distil mcp` CLI subcommand

## Acceptance Criteria

- [ ] MCP server starts and responds to `initialize` handshake
- [ ] All analysis tools callable via MCP and return correct results
- [ ] Error handling returns actionable messages to MCP clients
- [ ] Server works with Claude Code and Cursor as MCP clients
- [ ] Configuration via env vars and MCP settings

## Risks & Mitigations

| Risk                                             | Mitigation                                     |
| ------------------------------------------------ | ---------------------------------------------- |
| MCP SDK API instability                          | Pin SDK version; wrap in thin adapter layer    |
| Large analysis results exceed MCP message limits | Paginate results; offer summary vs. full modes |
| Cold start latency for analysis                  | Cache via Kindling; lazy initialization        |

## Tasks

### MCP-001: Project setup and server scaffold

- **Status:** Planned
- **Intent:** Create @distil/mcp package with MCP server boilerplate
- **Expected Outcome:** MCP server starts, responds to initialize, lists tools
- **Scope:** `packages/distil-mcp/`
- **Non-scope:** Tool implementations
- **Files:** `packages/distil-mcp/package.json`, `packages/distil-mcp/src/index.ts`, `packages/distil-mcp/src/server.ts`
- **Dependencies:** (none)
- **Validation:** `pnpm build && node packages/distil-mcp/dist/index.js` responds to MCP handshake
- **Confidence:** high
- **Risks:** None significant

### MCP-002: Analysis tool definitions

- **Status:** Planned
- **Intent:** Register all analysis tools with the MCP server
- **Expected Outcome:** MCP clients can call distil_extract, distil_calls, distil_cfg, etc.
- **Scope:** `packages/distil-mcp/src/tools/`
- **Non-scope:** Analysis logic (delegates to core)
- **Files:** `packages/distil-mcp/src/tools/extract.ts`, `packages/distil-mcp/src/tools/calls.ts`, `packages/distil-mcp/src/tools/cfg.ts`, `packages/distil-mcp/src/tools/dfg.ts`, `packages/distil-mcp/src/tools/slice.ts`
- **Dependencies:** MCP-001
- **Validation:** MCP client can call each tool and receive correct JSON results
- **Confidence:** high
- **Risks:** Input validation and error formatting for MCP protocol

### MCP-003: Resource and prompt definitions

- **Status:** Planned
- **Intent:** Provide project-level resources and workflow prompts via MCP
- **Expected Outcome:** MCP clients can access project structure as a resource and use workflow prompts
- **Scope:** `packages/distil-mcp/src/resources/`, `packages/distil-mcp/src/prompts/`
- **Non-scope:** Complex prompt engineering
- **Files:** `packages/distil-mcp/src/resources/project.ts`, `packages/distil-mcp/src/prompts/workflows.ts`
- **Dependencies:** MCP-001, MCP-002
- **Validation:** Resources and prompts accessible from MCP client
- **Confidence:** medium
- **Risks:** Prompt template design requires iteration

### MCP-004: CLI integration subcommand

- **Status:** Planned
- **Intent:** Add `distil mcp` subcommand to start MCP server from CLI
- **Expected Outcome:** `distil mcp` starts the server on stdio; configurable via CLI flags
- **Scope:** `packages/distil-cli/src/commands/mcp.ts`
- **Non-scope:** MCP server implementation
- **Files:** `packages/distil-cli/src/commands/mcp.ts`
- **Dependencies:** MCP-001, CLI-001
- **Validation:** `distil mcp` starts server; editor connects successfully
- **Confidence:** high
- **Risks:** None significant

## Decisions

- **MCP-D-001:** Use stdio transport (standard for editor MCP integrations)
- **MCP-D-002:** One tool per analysis layer (not one monolithic tool)
- **MCP-D-003:** Tool results are JSON objects matching core type schemas
- **MCP-D-004:** Server is a separate package to keep CLI lightweight

## Notes

- Reference llm-tldr's MCP approach for configuration patterns.
- Test with both Claude Code and Cursor MCP client implementations.
- Consider adding a `--watch` mode for the MCP server that re-analyzes on file changes.
