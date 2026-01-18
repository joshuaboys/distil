# 02-distil-lsp

> LSP server for editor integration with Distil's structural analysis.

| Scope | Owner | Status | Priority |
|-------|-------|--------|----------|
| LSP | @aneki | Planned | medium |

---

## Purpose

Provides a Language Server Protocol (LSP) implementation that exposes Distil's analysis capabilities to editors and IDEs. Enables lightweight code intelligence without requiring a full language server—powered by call graphs rather than real-time type checking.

---

## In Scope

- LSP server implementation (stdio and socket transport)
- DocumentSymbol provider (outline view)
- WorkspaceSymbol provider (project-wide go-to-symbol)
- References provider (find all references via call graph)
- CallHierarchy provider (incoming/outgoing calls)
- CodeLens for caller counts and complexity metrics
- Incremental updates via file watching
- Dead code diagnostics (optional)

## Out of Scope

- Full type checking (use TypeScript language server)
- Real-time error diagnostics
- Completions (requires real-time type info)
- Refactoring actions

---

## Interfaces

**Depends on:**
- @eddacraft/distil
- vscode-languageserver
- vscode-languageserver-textdocument
- vscode-uri

**Exposes:**
- LSP capabilities: `textDocument/documentSymbol`, `workspace/symbol`, `textDocument/references`, `callHierarchy/*`, `textDocument/codeLens`
- CLI: `distil lsp`, `distil lsp --socket=<port>`

---

## Work Items

### LSP-001: Server Scaffolding

**Status:** Proposed

**Intent:** Set up LSP server with basic lifecycle handling.

**Expected Outcome:** Server starts, handles initialize/shutdown, reports capabilities to client.

**Validation:** Connect with VS Code LSP inspector; verify capabilities response.

---

### LSP-002: DocumentSymbol Provider

**Status:** Proposed

**Intent:** Provide file outline from L1 AST.

**Expected Outcome:** Editor shows functions, classes, methods in outline/breadcrumb view.

**Validation:** Open a TS file in VS Code; verify outline panel shows all symbols.

**Dependencies:** LSP-001

---

### LSP-003: WorkspaceSymbol Provider

**Status:** Proposed

**Intent:** Enable project-wide symbol search.

**Expected Outcome:** Ctrl+T / go-to-symbol finds functions across all project files.

**Validation:** Use go-to-symbol in editor; verify cross-file results appear.

**Dependencies:** LSP-001

---

### LSP-004: References Provider

**Status:** Proposed

**Intent:** Find all references using call graph analysis.

**Expected Outcome:** "Find All References" shows callers from L2 call graph, not just text matches.

**Validation:** Right-click function → Find All References; verify callers appear.

**Dependencies:** LSP-001, DISTIL-002

---

### LSP-005: CallHierarchy Provider

**Status:** Proposed

**Intent:** Show incoming/outgoing call relationships.

**Expected Outcome:** Call hierarchy view shows callers (incoming) and callees (outgoing) for any function.

**Validation:** Use "Show Call Hierarchy" in VS Code; navigate incoming/outgoing calls.

**Dependencies:** LSP-001, DISTIL-002

---

### LSP-006: CodeLens Provider

**Status:** Proposed

**Intent:** Show inline metrics above functions.

**Expected Outcome:** "5 callers | complexity: 8" appears above function definitions.

**Validation:** Open file; verify CodeLens annotations appear above functions.

**Dependencies:** LSP-001, DISTIL-002, DISTIL-004

---

### LSP-007: Incremental Indexing

**Status:** Proposed

**Intent:** Re-analyze only changed files on save.

**Expected Outcome:** Editing a file triggers re-analysis of that file and its dependents; results update in editor.

**Validation:** Modify function signature; verify references/call hierarchy update.

**Dependencies:** LSP-001, DISTIL-003

---

### LSP-008: Dead Code Diagnostics

**Status:** Proposed

**Intent:** Warn about unreachable functions in editor.

**Expected Outcome:** Unused functions show warning squiggle and diagnostic message.

**Validation:** Create unused function; verify warning appears in Problems panel.

**Dependencies:** LSP-007, DISTIL-010

---

### LSP-009: CLI Integration

**Status:** Proposed

**Intent:** Start LSP server from distil CLI.

**Expected Outcome:** `distil lsp` starts server on stdio; `distil lsp --socket=9000` starts on TCP.

**Validation:** `distil lsp --help` shows options; server starts and accepts connections.

**Dependencies:** LSP-001

---

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-001 | vscode-languageserver for protocol | Industry standard; handles protocol complexity |
| D-002 | Support stdio and socket transports | Flexibility for different editor integrations |
| D-003 | References are call-graph based | Different from TypeScript server; our value-add |
| D-004 | CodeLens metrics are opt-in | Can be noisy; user configurable |
| D-005 | Dead code diagnostics are opt-in | Can be noisy during development |
| D-006 | Background indexing with progress | Large projects need async handling |

---

## Notes

- This is a "lightweight" LSP that complements language-specific servers
- Users should run both `distil lsp` and `typescript-language-server` for full functionality
- Main value is call graph features that TypeScript server doesn't provide well
- Consider LSIF export for static code navigation (GitHub/GitLab) in the future
