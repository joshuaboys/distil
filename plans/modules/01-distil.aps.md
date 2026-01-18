# 01-distil

> Core analysis engine + CLI for structural code analysis.

| Scope | Owner | Status | Priority |
|-------|-------|--------|----------|
| CORE + CLI | @aneki | In Progress | high |

---

## Purpose

Provides the 5-layer code analysis engine (AST, Call Graph, CFG, DFG, PDG) with multi-language support via tree-sitter, plus a CLI for direct usage. Extracts structure from code and produces representations optimized for LLMs, visualization, editor integration, and documentation generation.

---

## In Scope

- L1-L5 analysis layers (AST, Call Graph, CFG, DFG, PDG)
- Tree-sitter based language parsing
- Pluggable output formatters (JSON, compact, DOT, GraphML, Markdown, LSP)
- CLI commands for all analysis operations
- Kindling integration for caching
- Incremental analysis with content-hash invalidation
- Query interface for filtering results
- Diff mode for structural changes
- Dead code detection
- Watch mode for continuous analysis

## Out of Scope

- LSP server (02-distil-lsp)
- Local embedding models
- Real-time Salsa-style incremental parsing

---

## Interfaces

**Depends on:**
- tree-sitter, tree-sitter-typescript
- commander
- @kindling/core, @kindling/store-sqlite (planned)
- chokidar (planned)

**Exposes:**
- Programmatic API: `extractFile()`, `buildCallGraph()`, `getImpact()`, `extractCFG()`, `extractDFG()`, `extractPDG()`, `getSlice()`, `formatAs()`
- CLI: `distil extract`, `distil tree`, `distil impact`, `distil calls`, `distil cfg`, `distil dfg`, `distil slice`, `distil query`, `distil diff`, `distil unused`, `distil watch`, `distil warm`

---

## Work Items

### DISTIL-001: L1 AST Extraction ✓

**Status:** Done

**Intent:** Extract functions, classes, imports, and signatures from TypeScript/JavaScript files.

**Expected Outcome:** `distil extract <file>` outputs complete module structure with all declarations, types, and docstrings.

**Validation:** `pnpm test && distil extract packages/tldr-core/src/index.ts --json`

---

### DISTIL-002: L2 Call Graph

**Status:** Ready

**Intent:** Build cross-file call relationships for impact analysis.

**Expected Outcome:** `buildCallGraph()` returns forward and backward edges; `distil impact <func>` shows all callers transitively.

**Validation:** `pnpm test && distil impact extractFile --project .`

**Dependencies:** DISTIL-001

---

### DISTIL-003: Kindling Integration

**Status:** Proposed

**Intent:** Cache analysis results for fast retrieval and dirty detection.

**Expected Outcome:** Analysis results persist across runs; unchanged files skip re-analysis; `distil warm` pre-builds all indexes.

**Validation:** `distil warm . && time distil extract src/index.ts` (second run should be instant)

**Dependencies:** DISTIL-002

---

### DISTIL-004: L3 Control Flow Graph

**Status:** Proposed

**Intent:** Extract control flow graphs with cyclomatic complexity metrics.

**Expected Outcome:** `distil cfg <file> <func>` outputs basic blocks, edges, and complexity score.

**Validation:** `distil cfg src/parsers/typescript.ts extractAST --format=dot | dot -Tpng > cfg.png`

**Dependencies:** DISTIL-001

---

### DISTIL-005: L4 Data Flow Graph

**Status:** Proposed

**Intent:** Track variable definitions and uses for data flow analysis.

**Expected Outcome:** `distil dfg <file> <func>` outputs variable refs and def-use chains.

**Validation:** `distil dfg src/parsers/typescript.ts extractAST --json`

**Dependencies:** DISTIL-001

---

### DISTIL-006: L5 Program Dependence Graph

**Status:** Proposed

**Intent:** Combine control and data dependencies for program slicing.

**Expected Outcome:** `distil slice <file> <func> <line>` returns only the lines affecting the target.

**Validation:** `distil slice src/parsers/typescript.ts extractAST 150`

**Dependencies:** DISTIL-004, DISTIL-005

---

### DISTIL-007: Output Format Adapters

**Status:** Proposed

**Intent:** Support multiple output formats for different consumers.

**Expected Outcome:** `--format` flag works on all commands with options: json, compact, dot, graphml, markdown, lsp.

**Validation:** `distil extract src/index.ts --format=dot && distil extract src/index.ts --format=markdown`

**Dependencies:** DISTIL-001

---

### DISTIL-008: Query Interface

**Status:** Proposed

**Intent:** Filter analysis results by pattern matching.

**Expected Outcome:** `distil query <pattern>` filters results by name, type, attributes, or relationships.

**Validation:** `distil query "exported functions" && distil query "callers of extractAST"`

**Dependencies:** DISTIL-002

---

### DISTIL-009: Incremental Analysis & Diff Mode

**Status:** Proposed

**Intent:** Make repeated analysis fast and show structural changes over time.

**Expected Outcome:** Content-hash caching skips unchanged files; `distil diff <ref>` shows what changed structurally since a git ref.

**Validation:** `distil diff HEAD~1 && time distil extract src/index.ts` (cached)

**Dependencies:** DISTIL-003

---

### DISTIL-010: Dead Code Detection

**Status:** Proposed

**Intent:** Find unreachable functions via call graph analysis.

**Expected Outcome:** `distil unused --entry=src/index.ts` lists functions with no incoming edges from entry points.

**Validation:** `distil unused --entry=src/index.ts --json`

**Dependencies:** DISTIL-002

---

### DISTIL-011: Watch Mode

**Status:** Proposed

**Intent:** Continuously re-analyze on file changes.

**Expected Outcome:** `distil watch` monitors filesystem and updates analysis incrementally.

**Validation:** `distil watch &` then modify a file and verify re-analysis in output.

**Dependencies:** DISTIL-003

---

### DISTIL-012: Multi-Language Support

**Status:** Proposed

**Intent:** Extend analysis to Python, Rust, and Go.

**Expected Outcome:** `distil extract` works on .py, .rs, .go files with full L1-L5 support.

**Validation:** `distil extract example.py --json && distil extract example.rs --json`

**Dependencies:** DISTIL-006

---

### DISTIL-013: Semantic Search

**Status:** Proposed

**Intent:** Enable natural language code search via external embeddings.

**Expected Outcome:** `distil semantic <query>` finds functions by behavior description.

**Validation:** `OPENAI_API_KEY=xxx distil semantic "validate JWT tokens"`

**Dependencies:** DISTIL-003

---

### DISTIL-014: Context Generation

**Status:** Proposed

**Intent:** Provide unified LLM-ready context from all analysis layers.

**Expected Outcome:** `distil context <func>` traverses call graph and returns token-efficient summary with configurable depth.

**Validation:** `distil context extractAST --depth=2 --project .`

**Dependencies:** DISTIL-002, DISTIL-006

---

### DISTIL-015: Monorepo Support

**Status:** Proposed

**Intent:** Analyze cross-package dependencies in monorepos.

**Expected Outcome:** `distil workspace` detects workspace config and shows cross-package call patterns.

**Validation:** `distil workspace` in a pnpm/npm/yarn workspace

**Dependencies:** DISTIL-002

---

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-001 | Tree-sitter for parsing | Multi-language; no fallback to regex |
| D-002 | JSON-serializable results | Required for Kindling storage |
| D-003 | SHA-256 content hashes | Simple dirty detection |
| D-004 | On-demand higher layers | CFG/DFG/PDG computed when needed, not eagerly |
| D-005 | Commander.js for CLI | Mature, widely used |
| D-006 | stderr for progress, stdout for output | Enables piping |

---

## Notes

- Start with TypeScript/JavaScript; other languages follow same parser interface
- Keep extractors modular for independent testing
- Kindling integration is critical for performance
- CLI commands should be thin wrappers around core API
