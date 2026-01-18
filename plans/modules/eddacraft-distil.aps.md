# @eddacraft/distil

| Scope | Owner | Priority | Status |
|-------|-------|----------|--------|
| CORE + CLI | @aneki | high | In Progress |

## Purpose

Provides the 5-layer code analysis engine (AST, Call Graph, CFG, DFG, PDG) with multi-language support via tree-sitter, plus a CLI for direct usage. Integrates with Kindling for caching and persistence of analysis results.

This is the analytical spine and user-facing surface of Distil. It extracts structure from code and produces representations optimized for:
- LLM context (token-efficient)
- Visualization (DOT, GraphML)
- Editor integration (LSP-compatible)
- Documentation generation (Markdown)

## In Scope

### Core Analysis

- L1: AST extraction (functions, classes, imports, signatures, docstrings)
- L2: Call graph construction (forward and backward edges, cross-file)
- L3: Control flow graph extraction (basic blocks, edges, cyclomatic complexity)
- L4: Data flow graph extraction (variable definitions, uses, def-use chains)
- L5: Program dependence graph (control + data dependencies, slicing)
- Language parser abstraction (tree-sitter based)
- Kindling integration for caching analysis results
- Pluggable output formatters (JSON, compact, DOT, GraphML, Markdown, LSP)

### CLI Interface

- CLI command structure and parsing
- Output formatting (JSON, text, LLM-ready, DOT, Markdown)
- File tree and structure commands
- Analysis commands (extract, context, impact, cfg, dfg, slice)
- Query command for filtering results
- Diff command for structural changes
- Unused command for dead code detection
- Watch mode for continuous analysis
- Semantic search command
- Index warming command
- Configuration management

## Out of Scope

- LSP server implementation (@eddacraft/distil-lsp)
- Local embedding models (uses external APIs)
- Real-time Salsa-style incremental parsing
- Full IDE feature parity

## Interfaces

**Depends on:**

- @kindling/core — observation types, service orchestration (planned)
- @kindling/store-sqlite — persistence layer (planned)
- tree-sitter — parsing foundation
- tree-sitter-typescript — TS/JS grammar
- commander — CLI framework
- chokidar — file watching (planned)

**Exposes (Programmatic API):**

- `extractFile()` — L1 AST extraction for a file
- `buildCallGraph()` — L2 cross-file call graph
- `getImpact()` — L2 reverse call graph (who calls this?)
- `extractCFG()` — L3 control flow graph for a function
- `extractDFG()` — L4 data flow graph for a function
- `extractPDG()` — L5 program dependence graph
- `getSlice()` — L5 backward/forward program slice
- `getRelevantContext()` — unified LLM-ready context
- `formatAs()` — format analysis results (json, compact, dot, graphml, markdown, lsp)

**Exposes (CLI):**

- `distil tree [path]` — file tree structure
- `distil structure [path]` — code structure overview
- `distil extract <file>` — full file analysis (L1)
- `distil context <func> --project <path>` — LLM-ready context
- `distil calls [path]` — build call graph (L2)
- `distil impact <func> [path]` — reverse call graph (L2)
- `distil cfg <file> <func>` — control flow graph (L3)
- `distil dfg <file> <func>` — data flow graph (L4)
- `distil slice <file> <func> <line>` — program slice (L5)
- `distil query <pattern> [path]` — filter analysis results
- `distil diff <ref> [path]` — structural changes since ref
- `distil unused [path]` — dead code detection
- `distil watch [path]` — continuous analysis
- `distil semantic <query> [path]` — semantic search
- `distil warm [path]` — build all indexes

## Boundary Rules

- Analysis results must be JSON-serializable for Kindling storage
- Language parsers must implement a common interface for extensibility
- Output formatters must be pluggable (core provides data, formatters serialize)
- CLI must delegate to core for all analysis logic
- CLI must support multiple output formats via `--format` flag
- CLI must provide helpful error messages with actionable guidance
- CLI must respect .distilignore patterns

## Acceptance Criteria

### Core Analysis

- [x] L1: Extract functions, classes, imports from TS/JS files
- [ ] L2: Build project-wide call graph with forward/backward edges
- [ ] L3: Extract CFG with basic blocks and cyclomatic complexity
- [ ] L4: Extract DFG with variable definitions and uses
- [ ] L5: Compute program slices (backward and forward)
- [ ] Kindling integration caches all analysis results
- [ ] Dirty detection via content hashes avoids redundant analysis
- [ ] Context output reduces tokens by 80%+ vs raw code

### Output Formats

- [ ] JSON format (full detail)
- [ ] Compact format (LLM-optimized)
- [ ] DOT format (Graphviz)
- [ ] GraphML format (yEd, Gephi)
- [ ] Markdown format (documentation)
- [ ] LSP DocumentSymbol format (editor integration)

### CLI

- [x] Extract command works with --json and --compact
- [ ] All commands parse arguments correctly
- [ ] Output formats work via --format flag
- [ ] Error messages are clear and actionable
- [ ] Help text is comprehensive for each command
- [ ] Query command filters by pattern
- [ ] Diff command shows structural changes
- [ ] Unused command detects dead code
- [ ] Watch mode re-analyzes on file changes

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Tree-sitter Node.js bindings instability | Pin versions; test on multiple Node versions |
| CFG/DFG complexity for edge cases | Start with common patterns; iterate based on real usage |
| Kindling schema changes | Use versioned metadata; coordinate releases |
| API key management for semantic search | Support env vars, config file, and CLI flag |
| Large output overwhelming terminal | Default to compact format; --full for verbose |
| Slow commands for large projects | Progress indicators; caching via Kindling |

## Tasks

### Analysis Tasks

#### CORE-001: Define core types and interfaces ✅

- **Status:** Complete
- **Intent:** Establish stable type definitions for all analysis layers
- **Expected Outcome:** FunctionInfo, ClassInfo, ModuleInfo, CallGraphInfo, CFGInfo, DFGInfo, PDGInfo types compile and validate
- **Scope:** `src/types/`
- **Files:** `src/types/index.ts`, `src/types/ast.ts`, `src/types/callgraph.ts`, `src/types/cfg.ts`, `src/types/dfg.ts`, `src/types/pdg.ts`
- **Completed:** All types defined and compiling

#### CORE-002: Tree-sitter TypeScript parser setup ✅

- **Status:** Complete
- **Intent:** Establish parsing foundation for TypeScript/JavaScript
- **Expected Outcome:** Parser loads TS/JS grammars; can parse source to tree-sitter AST
- **Scope:** `src/parsers/`
- **Files:** `src/parsers/base.ts`, `src/parsers/typescript.ts`, `src/parsers/index.ts`
- **Completed:** TypeScript parser working with native bindings

#### CORE-003: L1 AST extractor ✅

- **Status:** Complete
- **Intent:** Extract functions, classes, imports, and signatures from source files
- **Expected Outcome:** `extractFile()` returns complete ModuleInfo with all declarations
- **Scope:** `src/parsers/typescript.ts`
- **Files:** `src/parsers/typescript.ts`
- **Completed:** Extracts functions, classes, methods, imports, exports, parameters, types

#### CORE-004: L2 Call graph extractor

- **Status:** Planned
- **Intent:** Build cross-file call relationships for impact analysis
- **Expected Outcome:** `buildCallGraph()` returns forward and backward edges; `getImpact()` finds all callers
- **Scope:** `src/extractors/callgraph/`
- **Files:** `src/extractors/callgraph/index.ts`, `src/extractors/callgraph/typescript.ts`
- **Risks:** Import resolution complexity; dynamic calls

#### CORE-005: Kindling integration layer

- **Status:** Planned
- **Intent:** Cache analysis results in Kindling for fast retrieval
- **Expected Outcome:** Analysis results stored as Kindling observations; dirty detection via content hashes
- **Scope:** `src/kindling/`
- **Files:** `src/kindling/store.ts`, `src/kindling/observations.ts`, `src/kindling/config.ts`
- **Risks:** Kindling API stability during early development

#### CORE-006: L3 CFG extractor

- **Status:** Planned
- **Intent:** Extract control flow graphs with complexity metrics
- **Expected Outcome:** `extractCFG()` returns basic blocks, edges, and cyclomatic complexity
- **Scope:** `src/extractors/cfg/`
- **Files:** `src/extractors/cfg/index.ts`, `src/extractors/cfg/typescript.ts`

#### CORE-007: L4 DFG extractor

- **Status:** Planned
- **Intent:** Track variable definitions and uses for data flow analysis
- **Expected Outcome:** `extractDFG()` returns variable refs and def-use chains
- **Scope:** `src/extractors/dfg/`
- **Files:** `src/extractors/dfg/index.ts`, `src/extractors/dfg/typescript.ts`

#### CORE-008: L5 PDG extractor and slicing

- **Status:** Planned
- **Intent:** Combine control and data dependencies for program slicing
- **Expected Outcome:** `extractPDG()` returns unified dependence graph; `getSlice()` computes backward/forward slices
- **Scope:** `src/extractors/pdg/`
- **Files:** `src/extractors/pdg/index.ts`, `src/extractors/pdg/typescript.ts`

#### CORE-009: Context generation API

- **Status:** Planned
- **Intent:** Provide unified LLM-ready context from all analysis layers
- **Expected Outcome:** `getRelevantContext()` traverses call graph and returns token-efficient summaries
- **Scope:** `src/api/`
- **Files:** `src/api/context.ts`, `src/api/index.ts`

#### CORE-010: Output formatters

- **Status:** Planned
- **Intent:** Pluggable formatters for different output targets
- **Expected Outcome:** `formatAs(result, 'dot')` produces Graphviz output; similar for GraphML, Markdown, LSP
- **Scope:** `src/formatters/`
- **Files:** `src/formatters/index.ts`, `src/formatters/dot.ts`, `src/formatters/graphml.ts`, `src/formatters/markdown.ts`, `src/formatters/lsp.ts`

### CLI Tasks

#### CLI-001: Project setup and command structure ✅

- **Status:** Complete
- **Intent:** Establish CLI framework and command hierarchy
- **Expected Outcome:** `distil --help` shows all commands; subcommands parse correctly
- **Scope:** `src/cli/`
- **Files:** `src/cli/index.ts`, `src/cli/commands/`
- **Completed:** extract/tree commands registered

#### CLI-002: Tree and structure commands ✅

- **Status:** Complete (tree)
- **Intent:** Provide project overview commands
- **Expected Outcome:** `distil tree` shows file tree; `distil structure` shows code overview
- **Files:** `src/cli/commands/tree.ts`, `src/cli/commands/structure.ts`

#### CLI-003: Extract command ✅

- **Status:** Complete
- **Intent:** Expose L1 AST extraction via CLI
- **Expected Outcome:** `distil extract <file>` outputs file analysis in requested format
- **Files:** `src/cli/commands/extract.ts`

#### CLI-004: Call graph commands (calls, impact)

- **Status:** Planned
- **Intent:** Expose L2 call graph via CLI
- **Expected Outcome:** `distil calls` builds call graph; `distil impact <func>` shows callers
- **Files:** `src/cli/commands/calls.ts`, `src/cli/commands/impact.ts`
- **Dependencies:** CORE-004

#### CLI-005: Context command

- **Status:** Planned
- **Intent:** Provide LLM-ready context with configurable depth
- **Expected Outcome:** `distil context <func>` outputs token-efficient summary
- **Files:** `src/cli/commands/context.ts`
- **Dependencies:** CORE-009

#### CLI-006: CFG and DFG commands

- **Status:** Planned
- **Intent:** Expose L3/L4 analysis via CLI
- **Expected Outcome:** `distil cfg` shows control flow; `distil dfg` shows data flow
- **Files:** `src/cli/commands/cfg.ts`, `src/cli/commands/dfg.ts`
- **Dependencies:** CORE-006, CORE-007

#### CLI-007: Slice command

- **Status:** Planned
- **Intent:** Expose L5 program slicing via CLI
- **Expected Outcome:** `distil slice <file> <func> <line>` shows relevant lines
- **Files:** `src/cli/commands/slice.ts`
- **Dependencies:** CORE-008

#### CLI-008: Query command

- **Status:** Planned
- **Intent:** Filter analysis results by pattern
- **Expected Outcome:** `distil query "exported functions"` filters results
- **Files:** `src/cli/commands/query.ts`

#### CLI-009: Diff command

- **Status:** Planned
- **Intent:** Show structural changes since a git ref
- **Expected Outcome:** `distil diff HEAD~1` shows what changed structurally
- **Files:** `src/cli/commands/diff.ts`
- **Dependencies:** CORE-005 (for caching baseline)

#### CLI-010: Unused command

- **Status:** Planned
- **Intent:** Detect dead code via reachability analysis
- **Expected Outcome:** `distil unused --entry=src/index.ts` lists unreachable functions
- **Files:** `src/cli/commands/unused.ts`
- **Dependencies:** CORE-004

#### CLI-011: Watch command

- **Status:** Planned
- **Intent:** Continuous analysis on file changes
- **Expected Outcome:** `distil watch` re-analyzes changed files automatically
- **Files:** `src/cli/commands/watch.ts`
- **Dependencies:** CORE-005, chokidar

#### CLI-012: Semantic search command

- **Status:** Planned
- **Intent:** Enable natural language code search
- **Expected Outcome:** `distil semantic <query>` finds relevant functions by behavior
- **Files:** `src/cli/commands/semantic.ts`

#### CLI-013: Warm command

- **Status:** Planned
- **Intent:** Pre-build all indexes for fast queries
- **Expected Outcome:** `distil warm` analyzes project and caches results
- **Files:** `src/cli/commands/warm.ts`
- **Dependencies:** CORE-005

#### CLI-014: Format flag support

- **Status:** Planned
- **Intent:** Support --format flag on all commands
- **Expected Outcome:** `--format=json|compact|dot|graphml|markdown` works consistently
- **Files:** `src/cli/format.ts`
- **Dependencies:** CORE-010

## Decisions

- **D-001:** Tree-sitter is the parsing foundation; no fallback to regex or other parsers
- **D-002:** All analysis results are JSON-serializable for Kindling storage
- **D-003:** Content hashes (SHA-256) are used for dirty detection
- **D-004:** Higher layers (CFG, DFG, PDG) are computed on-demand, not eagerly
- **D-005:** Commander.js is the CLI framework (mature, widely used)
- **D-006:** Default output is human-readable; --json for programmatic use
- **D-007:** API keys for semantic search read from env vars first, then config
- **D-008:** Progress indicators use stderr; output uses stdout (for piping)
- **D-009:** Output formatters are pluggable; new formats can be added without core changes

## Notes

- Start with TypeScript/JavaScript. Other languages follow the same parser interface.
- Keep extractors modular—each layer should be independently testable.
- Kindling integration is critical for performance; avoid redundant parsing.
- Keep CLI command implementations thin; delegate to core.
- Test commands with various project sizes to ensure performance.
