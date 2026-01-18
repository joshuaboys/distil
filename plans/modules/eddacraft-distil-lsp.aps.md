# @eddacraft/distil-lsp

| Scope | Owner | Priority | Status |
|-------|-------|----------|--------|
| LSP | @aneki | medium | Planned (M10) |

## Purpose

Provides a Language Server Protocol (LSP) implementation that exposes Distil's analysis capabilities to editors and IDEs. Enables lightweight code intelligence without requiring a full language server.

This package bridges Distil's structural analysis with editor features like go-to-definition, find references, and call hierarchy—powered by call graphs rather than real-time type checking.

## In Scope

- LSP server implementation (stdio and socket transport)
- DocumentSymbol provider (outline view)
- WorkspaceSymbol provider (go-to-symbol across project)
- References provider (find all references via call graph)
- CallHierarchy provider (incoming/outgoing calls)
- CodeLens for caller counts and complexity metrics
- Incremental updates via `workspace/didChangeWatchedFiles`
- Diagnostics for dead code (optional)
- Configuration via LSP `workspace/configuration`

## Out of Scope

- Full type checking (use TypeScript language server for that)
- Real-time error diagnostics (syntax errors, type errors)
- Completions (too dependent on real-time type info)
- Hover documentation (defer to language-specific servers)
- Refactoring actions (rename, extract function)

## Interfaces

**Depends on:**

- @eddacraft/distil — all analysis functions
- vscode-languageserver — LSP protocol implementation
- vscode-languageserver-textdocument — document management
- vscode-uri — URI handling

**Exposes (LSP Capabilities):**

- `textDocument/documentSymbol` — file outline
- `workspace/symbol` — project-wide symbol search
- `textDocument/references` — find all references (via call graph)
- `callHierarchy/incomingCalls` — who calls this function
- `callHierarchy/outgoingCalls` — what does this function call
- `textDocument/codeLens` — inline metrics (caller count, complexity)
- `textDocument/publishDiagnostics` — dead code warnings (optional)

**CLI Entry:**

- `distil lsp` — start LSP server (stdio mode)
- `distil lsp --socket=<port>` — start LSP server (socket mode)

## Boundary Rules

- LSP must not implement analysis logic; delegate to @eddacraft/distil
- LSP must use Distil's LSP output formatter for DocumentSymbol conversion
- LSP must support incremental updates (don't re-analyze entire project on every keystroke)
- LSP must handle large projects gracefully (background indexing, progress reporting)
- LSP must be editor-agnostic (no VS Code-specific APIs)

## Acceptance Criteria

- [ ] Server starts and responds to `initialize` request
- [ ] DocumentSymbol returns file outline matching Distil's L1 extraction
- [ ] WorkspaceSymbol searches across all project files
- [ ] References finds callers via L2 call graph
- [ ] CallHierarchy shows incoming/outgoing calls
- [ ] CodeLens displays caller counts inline
- [ ] File changes trigger incremental re-analysis
- [ ] Large projects index in background with progress reporting
- [ ] Server works with VS Code, Neovim, Emacs, and other LSP clients

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| LSP protocol complexity | Use vscode-languageserver which handles protocol details |
| Performance with large projects | Background indexing; debounce file change events |
| Stale results during editing | Show "indexing..." status; allow forcing refresh |
| Editor-specific quirks | Test with multiple editors; follow LSP spec strictly |

## Tasks

### LSP-001: Server scaffolding

- **Status:** Planned
- **Intent:** Set up LSP server with basic lifecycle handling
- **Expected Outcome:** Server starts, handles initialize/shutdown, reports capabilities
- **Scope:** `src/server.ts`
- **Files:** `src/server.ts`, `src/capabilities.ts`
- **Validation:** Connect with VS Code LSP inspector

### LSP-002: DocumentSymbol provider

- **Status:** Planned
- **Intent:** Provide file outline from L1 AST
- **Expected Outcome:** Editor shows functions, classes, methods in outline view
- **Scope:** `src/providers/documentSymbol.ts`
- **Files:** `src/providers/documentSymbol.ts`
- **Dependencies:** LSP-001

### LSP-003: WorkspaceSymbol provider

- **Status:** Planned
- **Intent:** Enable project-wide symbol search
- **Expected Outcome:** Ctrl+T / go-to-symbol finds functions across project
- **Scope:** `src/providers/workspaceSymbol.ts`
- **Files:** `src/providers/workspaceSymbol.ts`
- **Dependencies:** LSP-001

### LSP-004: References provider

- **Status:** Planned
- **Intent:** Find all references using call graph
- **Expected Outcome:** "Find All References" shows callers from L2 analysis
- **Scope:** `src/providers/references.ts`
- **Files:** `src/providers/references.ts`
- **Dependencies:** LSP-001, requires L2 call graph in distil

### LSP-005: CallHierarchy provider

- **Status:** Planned
- **Intent:** Show incoming/outgoing call relationships
- **Expected Outcome:** Call hierarchy view shows callers and callees
- **Scope:** `src/providers/callHierarchy.ts`
- **Files:** `src/providers/callHierarchy.ts`
- **Dependencies:** LSP-001, requires L2 call graph in distil

### LSP-006: CodeLens provider

- **Status:** Planned
- **Intent:** Show inline metrics above functions
- **Expected Outcome:** "5 callers | complexity: 8" appears above functions
- **Scope:** `src/providers/codeLens.ts`
- **Files:** `src/providers/codeLens.ts`
- **Dependencies:** LSP-001, requires L2 call graph and L3 CFG in distil

### LSP-007: Incremental indexing

- **Status:** Planned
- **Intent:** Re-analyze only changed files
- **Expected Outcome:** Editing a file triggers re-analysis of that file and dependents
- **Scope:** `src/indexer.ts`
- **Files:** `src/indexer.ts`, `src/watcher.ts`
- **Dependencies:** LSP-001, requires incremental support in distil

### LSP-008: Dead code diagnostics

- **Status:** Planned
- **Intent:** Warn about unreachable functions
- **Expected Outcome:** Unused functions show diagnostic warning
- **Scope:** `src/providers/diagnostics.ts`
- **Files:** `src/providers/diagnostics.ts`
- **Dependencies:** LSP-007, requires unused detection in distil

### LSP-009: CLI integration

- **Status:** Planned
- **Intent:** Start LSP server from distil CLI
- **Expected Outcome:** `distil lsp` starts server; editors can connect
- **Scope:** CLI command in @eddacraft/distil
- **Files:** (in distil package) `src/cli/commands/lsp.ts`
- **Dependencies:** LSP-001

## Decisions

- **D-001:** Use vscode-languageserver for protocol handling (industry standard)
- **D-002:** Support both stdio and socket transports
- **D-003:** References are call-graph based, not type-based (different from TypeScript server)
- **D-004:** CodeLens metrics are opt-in via configuration
- **D-005:** Dead code diagnostics are opt-in (can be noisy)
- **D-006:** Background indexing with progress reporting for large projects

## Notes

- This is a "lightweight" LSP—it complements rather than replaces language-specific servers.
- Users should run both `distil lsp` and `typescript-language-server` for full functionality.
- The main value is call graph features that TypeScript server doesn't provide well.
- Consider LSIF export for static code navigation (GitHub, GitLab) in the future.
