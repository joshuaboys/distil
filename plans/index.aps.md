# PLAN_NEXT.md

## Distil OSS v0.1 – Token-Efficient Code Analysis for LLMs

### Problem & Success Criteria

**Problem**
LLMs can't read entire codebases. A 100K-line codebase produces ~400K tokens, exceeding context windows. Even when it fits, LLMs drown in irrelevant details, wasting tokens on code that doesn't matter for the current task.

**Why this work matters**
Distil extracts *structure* instead of dumping *text*. It provides 5 layers of code analysis (AST, Call Graph, CFG, DFG, PDG) that give LLMs exactly what they need to understand and edit code correctly—at 95% fewer tokens than raw code.

**Non-goals (explicit)**

* Distil does **not** replace language servers or IDEs
* Distil does **not** provide real-time incremental parsing (Salsa-style)
* Distil does **not** run as a daemon (uses Kindling for persistence instead)
* Distil does **not** include local embedding models (uses external APIs)

Those concerns are either out of scope or deferred to future versions.

**Success Criteria**

* A developer can get LLM-ready context for any function with a single command
* Token usage is reduced by 80%+ compared to raw file reads
* Call graph analysis enables safe refactoring with impact visibility
* Program slicing isolates only the code affecting a specific line
* The project integrates cleanly with Kindling for caching and persistence
* The project is safe to open-source under Apache-2.0

---

## System Map (Current)

* `@distil/core` → depends on → `tree-sitter` (+ optional language parsers)
* `@distil/cli` → depends on → `@distil/core`

### Planned Integrations

* `@distil/core` → depends on → `@kindling/core` (M2)
* `@distil/core` → depends on → `@kindling/store-sqlite` (M2)

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

### M2: L2 Call Graph + Kindling Integration (In Progress)

* [x] Cross-file call graph construction
* [x] Forward edges (what does this function call?)
* [x] Backward edges (what calls this function?)
* [ ] Kindling integration for caching analysis results
* [x] Impact analysis command

**Target:** `distil impact <function>` shows all callers ✅

### M3: L3-L5 Analysis Layers (In Review - PR #1)

* [ ] L3: Control Flow Graph extraction with cyclomatic complexity
* [ ] L4: Data Flow Graph with def-use chains
* [ ] L5: Program Dependence Graph with backward/forward slicing
* [ ] `distil cfg`, `distil dfg`, `distil slice` commands

**Target:** `distil slice <file> <func> <line>` returns relevant lines only

**Note:** Implementation complete in PR #1, pending merge.

### M4: Semantic Search + CLI Polish (Planned)

* [ ] External embeddings API integration (OpenAI/Anthropic)
* [ ] Semantic search over function behaviors
* [ ] Full CLI command set
* [ ] Documentation polish (README, examples)

**Target:** `distil semantic "validate JWT tokens"` finds relevant functions

### M5: Multi-Language Support (Planned)

* [ ] Python language support (all layers)
* [ ] Rust language support (all layers)
* [ ] C# language support (all layers)

**Target:** Full parity for Python, Rust, C# alongside TypeScript/JavaScript

---

## Modules

### @distil/core

* **Path:** ./modules/distil-core.aps.md
* **Scope:** CORE
* **Owner:** @aneki
* **Status:** In Progress (L1-L2 complete)
* **Priority:** high
* **Tags:** analysis, ast, callgraph, cfg, dfg, pdg
* **Dependencies:** tree-sitter (current), @kindling/core/@kindling/store-sqlite (planned)

### @distil/cli

* **Path:** ./modules/distil-cli.aps.md
* **Scope:** CLI
* **Owner:** @aneki
* **Status:** In Progress (tree/extract/calls/impact commands)
* **Priority:** high
* **Tags:** cli, tooling
* **Dependencies:** @distil/core

---

## Decisions

* **D-001:** Distil uses Kindling for caching, not a custom daemon or file-based cache
* **D-002:** Tree-sitter is the parsing foundation for all language support
* **D-003:** Analysis layers are composable; higher layers build on lower ones
* **D-004:** Observation kinds in Kindling are generic (`code.symbol`, `code.callgraph`, etc.); Distil-specific detail lives in metadata
* **D-005:** Database location defaults to `.kindling/distil.db`, configurable via CLI/env/config
* **D-006:** Future language parsers (Python, Rust, C#) are optional peer dependencies
* **D-007:** Semantic search uses external embedding APIs (OpenAI/Anthropic), not local models
* **D-008:** TypeScript/JavaScript are the initial supported languages; others are future milestones

---

## Open Questions

*No open questions at this time.*

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
