# Distil

> Structural code analysis for LLMs, tooling, and editor integration.

**Status:** In Progress
**Owner:** @aneki

---

## Problem & Success Criteria

### Problem

Code analysis tools fall into two extremes: heavyweight language servers designed for real-time IDE use, or simplistic text-based tools that miss semantic structure. Neither is optimized for batch analysis, tooling integration, or feeding structured context to LLMs.

### Why This Matters

Distil extracts *structure* instead of dumping *text*. It provides 5 layers of code analysis (AST, Call Graph, CFG, DFG, PDG) that enable:

- **LLM context optimization** — 95% token reduction while preserving semantic understanding
- **Code intelligence** — Call graphs, impact analysis, dead code detection
- **Documentation generation** — Extract API surfaces and signatures automatically
- **Refactoring safety** — Understand what changes affect before making them
- **Visualization** — Generate architecture diagrams from actual code structure
- **Editor integration** — LSP-compatible output for lightweight code intelligence

### Success Criteria

- A developer can get LLM-ready context for any function with a single command
- Token usage is reduced by 80%+ compared to raw file reads
- Call graph analysis enables safe refactoring with impact visibility
- Program slicing isolates only the code affecting a specific line
- Multiple output formats support different consumers (LLM, visualization, LSP, docs)
- Incremental analysis makes repeated runs fast (diff-aware caching)

---

## Constraints

- **No daemon mode** — Uses file-based caching via Kindling, not a long-running process
- **No Salsa-style incremental** — File-level granularity for cache invalidation, not fine-grained
- **No local embedding models** — Semantic search uses external APIs (OpenAI/Anthropic)
- **Not a full language server** — Complements rather than replaces TypeScript/ESLint servers

---

## Modules

| Module | Purpose | Status | Dependencies |
|--------|---------|--------|--------------|
| [01-distil](./modules/01-distil.aps.md) | Core analysis engine + CLI | In Progress | tree-sitter, commander |
| [02-distil-lsp](./modules/02-distil-lsp.aps.md) | LSP server for editor integration | Planned | 01-distil, vscode-languageserver |

### Package Structure

```
@eddacraft/distil      — Core + CLI (single package)
@eddacraft/distil-lsp  — LSP server (separate, heavier deps)
```

### System Dependencies

```
@eddacraft/distil → tree-sitter, commander
@eddacraft/distil → @kindling/core, @kindling/store-sqlite (planned)
@eddacraft/distil-lsp → @eddacraft/distil, vscode-languageserver
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tree-sitter Node.js bindings instability | Build failures on Node upgrades | Pin versions; test on multiple Node versions |
| CFG/DFG complexity for edge cases | Incorrect analysis for unusual patterns | Start with common patterns; iterate based on real usage |
| Kindling API changes during early development | Integration rework | Use versioned metadata; coordinate releases |
| LSP protocol complexity | Slow development, editor-specific bugs | Use vscode-languageserver; test with multiple editors |
| Large project performance | Slow analysis, poor UX | Background indexing; progress reporting; caching |

---

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-001 | Kindling for caching, not custom daemon | Leverage existing infrastructure; avoid daemon complexity |
| D-002 | Tree-sitter as parsing foundation | Multi-language support; proven reliability; good perf |
| D-003 | Analysis layers are composable | Higher layers build on lower; enables incremental development |
| D-004 | Two-package structure (distil + distil-lsp) | CLI deps trivial; LSP deps heavier; clean separation |
| D-005 | Output formatters are pluggable | Core provides data; formatters handle serialization |
| D-006 | Content-hash based incremental analysis | Simple; git integration is optional overlay |
| D-007 | Query DSL is simple string-based initially | May evolve to structured queries later |
| D-008 | Dead code detection requires explicit entry points | Auto-detection is best-effort heuristic |
| D-009 | Watch mode uses filesystem events (chokidar) | Not polling; responsive to changes |
| D-010 | Future languages (Python, Rust, Go) as optional peer deps | Keep core install small |

---

## Open Questions

### Q-001: LSP vs LSIF

Should Distil support LSIF dump generation for static indexing (GitHub code navigation style) in addition to or instead of live LSP?

**Options:**
- LSP only (live server, per-editor process)
- LSIF only (static dump, CI-generated)
- Both (LSP for local dev, LSIF for hosted code browsing)

### Q-002: Query DSL Syntax

What syntax should the query interface use?

**Options:**
- Natural-ish language: `"exported functions with complexity > 10"`
- SQL-like: `SELECT * FROM functions WHERE exported = true AND complexity > 10`
- Custom DSL with operators: `functions:exported complexity:>10`

### Q-003: Incremental Granularity

How fine-grained should incremental updates be?

**Options:**
- File-level (re-analyze entire file if any change) — simplest
- Function-level (re-analyze only changed functions) — more complex, better for large files

---

## Resolved Questions

### Q-R001: JSX/TSX Support

**Decision:** Treat JSX/TSX as variants of JS/TS, not distinct languages.

**Rationale:** Tree-sitter handles this via grammar switching. Simpler API with unified language identifiers. JSX-specific analysis can be added as optional metadata later.

### Q-R002: Monorepo tsconfig.json Handling

**Decision:** Use nearest tsconfig.json heuristic with explicit `--project` override.

**Rationale:** Works naturally for most structures. Explicit flag covers edge cases. Workspace detection added in later milestones.

### Q-R003: Package Structure

**Decision:** Two packages — `@eddacraft/distil` (core + CLI) and `@eddacraft/distil-lsp`.

**Rationale:** CLI deps (commander) are trivial. LSP deps (vscode-languageserver ~500KB+) warrant separation. Most users want CLI anyway.
