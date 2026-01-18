# PLAN_NEXT.md

## Distil v0.1 – Structural Code Analysis

### Problem & Success Criteria

**Problem**
Code analysis tools fall into two extremes: heavyweight language servers designed for real-time IDE use, or simplistic text-based tools that miss semantic structure. Neither is optimized for batch analysis, tooling integration, or feeding structured context to LLMs.

**Why this work matters**
Distil extracts *structure* instead of dumping *text*. It provides 5 layers of code analysis (AST, Call Graph, CFG, DFG, PDG) that enable:
- **LLM context optimization** – 95% token reduction while preserving semantic understanding
- **Code intelligence** – Call graphs, impact analysis, dead code detection
- **Documentation generation** – Extract API surfaces and signatures automatically
- **Refactoring safety** – Understand what changes affect before making them
- **Visualization** – Generate architecture diagrams from actual code structure
- **Editor integration** – LSP-compatible output for lightweight code intelligence

**Non-goals (explicit)**

* Distil does **not** replace full language servers for real-time editing features
* Distil does **not** provide Salsa-style fine-grained incremental recomputation
* Distil does **not** run as a long-lived daemon (uses file-based caching instead)
* Distil does **not** include local embedding models (uses external APIs)

Those concerns are either out of scope or deferred to future versions.

**Success Criteria**

* A developer can get LLM-ready context for any function with a single command
* Token usage is reduced by 80%+ compared to raw file reads
* Call graph analysis enables safe refactoring with impact visibility
* Program slicing isolates only the code affecting a specific line
* Multiple output formats support different consumers (LLM, visualization, LSP, docs)
* Incremental analysis makes repeated runs fast (diff-aware caching)
* The project integrates cleanly with Kindling for caching and persistence
* The project is safe to open-source under Apache-2.0

---

## System Map (Current)

* `@eddacraft/distil` → depends on → `tree-sitter` (+ optional language parsers)
* `@eddacraft/distil` → depends on → `commander` (CLI)

### Planned Integrations

* `@eddacraft/distil` → depends on → `@kindling/core` (M2)
* `@eddacraft/distil` → depends on → `@kindling/store-sqlite` (M2)
* `@eddacraft/distil-lsp` → depends on → `@eddacraft/distil` (M10)
* `@eddacraft/distil-lsp` → depends on → `vscode-languageserver` (M10)

---

## Milestones

### M1: Project Scaffolding + L1 AST (Complete)

* [x] Public repository created
* [x] Package boundaries enforced (core / cli)
* [x] Tree-sitter TypeScript/JavaScript parser integrated
* [x] L1 AST extraction (functions, classes, imports, signatures)
* [x] Core types defined and validated
* [x] CLI `distil tree` and `distil extract` available

**Target:** `distil extract <file>` works for TS/JS files ✅

### M2: L2 Call Graph + Kindling Integration (Planned)

* [ ] Cross-file call graph construction
* [ ] Forward edges (what does this function call?)
* [ ] Backward edges (what calls this function?)
* [ ] Kindling integration for caching analysis results
* [ ] Impact analysis command

**Target:** `distil impact <function>` shows all callers

### M3: L3-L5 Analysis Layers (Planned)

* [ ] L3: Control Flow Graph extraction with cyclomatic complexity
* [ ] L4: Data Flow Graph with def-use chains
* [ ] L5: Program Dependence Graph with backward/forward slicing
* [ ] `distil context` command for LLM-ready output

**Target:** `distil slice <file> <func> <line>` returns relevant lines only

### M4: Semantic Search + CLI Polish (Planned)

* [ ] External embeddings API integration (OpenAI/Anthropic)
* [ ] Semantic search over function behaviors
* [ ] Full CLI command set
* [ ] Documentation polish (README, examples)

**Target:** `distil semantic "validate JWT tokens"` finds relevant functions

### M5: Multi-Language Support (Planned)

* [ ] Python language support (all layers)
* [ ] Rust language support (all layers)
* [ ] Go language support (all layers)

**Target:** Full parity for Python, Rust, Go alongside TypeScript/JavaScript

### M6: Output Format Adapters (Planned)

* [ ] Pluggable formatter architecture in core
* [ ] GraphML output for graph visualization tools (yEd, Gephi)
* [ ] DOT output for Graphviz diagrams
* [ ] Markdown output for documentation generation
* [ ] LSP DocumentSymbol format for editor integration
* [ ] `--format` flag on all CLI commands

**Target:** `distil extract <file> --format=dot | dot -Tpng > graph.png`

### M7: Query Interface (Planned)

* [ ] Query DSL for filtering analysis results
* [ ] `distil query` command with pattern matching
* [ ] Symbol lookup by name, type, or attributes
* [ ] Path queries in call graph (A → B reachability)
* [ ] Filtering by export status, visibility, complexity

**Target:** `distil query "exported functions with complexity > 10"`

### M8: Incremental Analysis & Diff Mode (Planned)

* [ ] Content-hash based cache invalidation (using existing `contentHash` field)
* [ ] Git-aware diff detection (changed files since ref)
* [ ] Incremental call graph updates (re-analyze only changed files + dependents)
* [ ] `distil diff` command showing structural changes
* [ ] Cache storage using Kindling store
* [ ] Watch mode for continuous analysis (`distil watch`)

**Target:** `distil diff HEAD~1` shows structural changes; repeated `distil extract` is instant for unchanged files

### M9: Dead Code & Entry Point Detection (Planned)

* [ ] Entry point auto-detection (package.json main/exports, test files, CLI entry)
* [ ] Configurable entry points via `.distil/config.json`
* [ ] Reachability analysis from entry points
* [ ] `distil unused` command for dead code detection
* [ ] Export-only mode (find unexported but unused code)
* [ ] Integration with CI (exit code for dead code threshold)

**Target:** `distil unused --entry=src/index.ts` lists unreachable functions

### M10: LSP Server Mode (Planned)

* [ ] Standalone LSP server implementation
* [ ] DocumentSymbol provider (outline view)
* [ ] WorkspaceSymbol provider (go-to-symbol)
* [ ] References provider (find all references via call graph)
* [ ] CallHierarchy provider (incoming/outgoing calls)
* [ ] CodeLens for caller counts and complexity metrics
* [ ] Incremental updates via `workspace/didChangeWatchedFiles`

**Target:** `distil lsp` provides lightweight code intelligence for any editor

### M11: Monorepo & Multi-Project Support (Planned)

* [ ] Workspace detection (pnpm-workspace.yaml, lerna.json, nx.json)
* [ ] Cross-package call graph construction
* [ ] Package boundary visualization
* [ ] Dependency graph between packages
* [ ] `distil workspace` command for monorepo analysis
* [ ] Per-package and aggregate statistics

**Target:** `distil workspace` shows cross-package dependencies and call patterns

---

## Modules

### @eddacraft/distil

* **Path:** ./modules/eddacraft-distil.aps.md
* **Scope:** CORE + CLI
* **Owner:** @aneki
* **Status:** In Progress (L1 complete, tree/extract commands)
* **Priority:** high
* **Tags:** analysis, ast, callgraph, cfg, dfg, pdg, cli
* **Dependencies:** tree-sitter, commander (current), @kindling/core/@kindling/store-sqlite (planned)
* **Exports:** Both programmatic API and CLI binary

### @eddacraft/distil-lsp (Planned)

* **Path:** ./modules/eddacraft-distil-lsp.aps.md
* **Scope:** LSP
* **Owner:** @aneki
* **Status:** Planned (M10)
* **Priority:** medium
* **Tags:** lsp, editor, integration
* **Dependencies:** @eddacraft/distil, vscode-languageserver

---

## Decisions

* **D-001:** Distil uses Kindling for caching, not a custom daemon or file-based cache
* **D-002:** Tree-sitter is the parsing foundation for all language support
* **D-003:** Analysis layers are composable; higher layers build on lower ones
* **D-004:** Observation kinds in Kindling are generic (`code.symbol`, `code.callgraph`, etc.); Distil-specific detail lives in metadata
* **D-005:** Cache location defaults to `.kindling/distil.db`, configurable via CLI/env/config
* **D-006:** Future language parsers (Python, Rust, Go) are optional peer dependencies
* **D-007:** Semantic search uses external embedding APIs (OpenAI/Anthropic), not local models
* **D-008:** TypeScript/JavaScript are the initial supported languages; others are future milestones
* **D-009:** Output formatters are pluggable; core provides data, formatters handle serialization
* **D-010:** Incremental analysis uses content hashes stored in cache; git integration is optional overlay
* **D-011:** Two-package structure: `@eddacraft/distil` (core + cli) and `@eddacraft/distil-lsp`. CLI deps (commander) are trivial; LSP deps (vscode-languageserver) are heavier and warrant separation
* **D-012:** Query DSL is simple string-based initially; may evolve to structured queries later
* **D-013:** Dead code detection requires explicit entry points; auto-detection is best-effort heuristic
* **D-014:** Watch mode uses filesystem events (chokidar), not polling
* **D-015:** Monorepo support detects workspace config files but doesn't parse them deeply (uses glob patterns)

---

## Open Questions

### Q-003: LSP vs Language Server Index Format (LSIF)

Should Distil support LSIF dump generation for static indexing (GitHub code navigation style) in addition to or instead of live LSP?

**Options:**
- LSP only (live server, per-editor process)
- LSIF only (static dump, CI-generated)
- Both (LSP for local dev, LSIF for hosted code browsing)

### Q-004: Query DSL Syntax

What syntax should the query interface use?

**Options:**
- Natural-ish language: `"exported functions with complexity > 10"`
- SQL-like: `SELECT * FROM functions WHERE exported = true AND complexity > 10`
- JSONPath/jq-like: `.functions | select(.exported and .complexity > 10)`
- Custom DSL with operators: `functions:exported complexity:>10`

### Q-005: Incremental Granularity

How fine-grained should incremental updates be?

**Options:**
- File-level (re-analyze entire file if any change) – simplest
- Function-level (re-analyze only changed functions) – more complex, better for large files
- Hybrid (file-level for L1, function-level for L2+)

---

## Resolved Questions

### Q-001: JSX/TSX Support (Resolved)

**Decision:** Treat JSX/TSX as variants of JS/TS, not distinct languages.

**Rationale:**
- Tree-sitter already handles this via grammar switching (TSX grammar for .tsx/.jsx)
- Simpler API with unified `typescript`/`javascript` language identifiers
- Matches industry standard tooling behavior
- JSX-specific analysis (components, hooks) can be added as optional metadata later

**Implementation:** Current approach is correct. Optionally add `hasJSX: boolean` to `ModuleInfo` if JSX-specific analysis becomes valuable.

### Q-002: Monorepo tsconfig.json Handling (Resolved)

**Decision:** Use nearest tsconfig.json heuristic with explicit override support.

**Rationale:**
- Works naturally for most monorepo structures
- Explicit `--project` flag covers edge cases
- Avoids over-engineering for M1-M2

**Implementation (M1-M2):**
- Find nearest `tsconfig.json` walking up from file
- Add `--project <path>` CLI flag for explicit override

**Implementation (M3+):**
- Add workspace detection (pnpm-workspace.yaml, package.json workspaces)
- Add `.distil/config.json` for complex configurations
- Cache tsconfig parsing per-project
