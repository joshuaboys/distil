# PLAN_NEXT.md

## Distil OSS v0.1 – Token-Efficient Code Analysis for LLMs

### Problem & Success Criteria

**Problem**
LLMs can't read entire codebases. A 100K-line codebase produces ~400K tokens, exceeding context windows. Even when it fits, LLMs drown in irrelevant details, wasting tokens on code that doesn't matter for the current task.

**Why this work matters**
Distil extracts _structure_ instead of dumping _text_. It provides 5 layers of code analysis (AST, Call Graph, CFG, DFG, PDG) that give LLMs exactly what they need to understand and edit code correctly—at 95% fewer tokens than raw code.

**Non-goals (explicit)**

- Distil does **not** replace language servers or IDEs
- Distil does **not** provide real-time incremental parsing (Salsa-style)
- Distil does **not** run as a daemon (uses Kindling for persistence instead) — see Q-003 for reconsideration
- Distil does **not** include local embedding models (uses external APIs)

Those concerns are either out of scope or deferred to future versions.

**Success Criteria**

- A developer can get LLM-ready context for any function with a single command
- Token usage is reduced by 80%+ compared to raw file reads
- Call graph analysis enables safe refactoring with impact visibility
- Program slicing isolates only the code affecting a specific line
- The project integrates cleanly with Kindling for caching and persistence
- The project is safe to open-source under Apache-2.0

---

## System Map (Current)

- `@distil/core` → depends on → `tree-sitter` (+ optional language parsers)
- `@distil/cli` → depends on → `@distil/core`

### Planned Integrations

- `@distil/core` → depends on → `@kindling/core` (M2)
- `@distil/core` → depends on → `@kindling/store-sqlite` (M2)
- `@distil/mcp` → depends on → `@distil/core` (M6)
- `@distil/mcp` → depends on → `@modelcontextprotocol/sdk` (M6)
- `@distil/cli` → depends on → `@distil/mcp` (M6, optional)

---

## Milestones

### M1: Project Scaffolding + L1 AST (Incomplete — critical gaps)

- [x] Public repository created
- [x] Package boundaries enforced (core / cli)
- [x] Tree-sitter TypeScript/JavaScript parser integrated
- [x] L1 AST extraction (function declarations, classes, imports, signatures)
- [x] Core types defined and validated
- [x] CLI `distil tree` and `distil extract` available
- [ ] Arrow function extraction (`const fn = () => {}` — the dominant modern TS/JS pattern)
- [ ] Destructured parameter parsing (`function f({ name, age })` → params: [])
- [ ] Interface member extraction (methods/properties return empty arrays)
- [ ] Re-export and standalone `export default` capture
- [ ] Compact output includes interfaces, types, variables, exports

**Target:** `distil extract <file>` works for TS/JS files — basic declarations only, arrow functions and destructured params missing

### M2: L2 Call Graph + Kindling Integration (In Progress)

- [x] Cross-file call graph construction
- [x] Forward edges (what does this function call?)
- [x] Backward edges (what calls this function?)
- [ ] Kindling integration for caching analysis results
- [x] Impact analysis command

**Target:** `distil impact <function>` shows all callers ✅

### M3: L3-L5 Analysis Layers (Functional — approximate)

- [x] L3: Control Flow Graph extraction with cyclomatic complexity
- [x] L4: Data Flow Graph with def-use chains
- [x] L5: Program Dependence Graph with backward/forward slicing
- [x] `distil cfg`, `distil dfg`, `distil slice` commands
- [ ] L4: DFG reaching definitions use line-number heuristic, not real dataflow analysis
- [ ] L4: `getReachingDefinitions()` and `getLiveVariables()` are stubs (return empty maps)
- [ ] L5: Control dependence only considers direct successors, not post-dominance

**Target:** `distil slice <file> <func> <line>` returns relevant lines only — works for simple functions, approximate for complex control flow

### M3.5: L1 Completeness + Test Foundation (Planned — prerequisite for usability)

This milestone addresses the critical gaps found in the usability audit that block real-world adoption. Arrow functions are the dominant pattern in modern TS/JS; without extracting them, distil misses the majority of functions in typical codebases.

- [ ] Arrow function extraction (CORE-014)
- [ ] Destructured parameter parsing (CORE-015)
- [ ] Interface member extraction (CORE-016)
- [ ] Re-export and standalone export default capture (CORE-017)
- [ ] Compact output completeness (CORE-018)
- [ ] Core test coverage expansion (CORE-019)
- [ ] CLI test coverage (CLI-013)
- [ ] Clean up misleading language extensions (CLI-014)
- [ ] Fix CLI help text referencing nonexistent commands (CLI-015)

**Target:** `distil extract` correctly handles arrow functions, destructured params, interface members, and re-exports. Test coverage is meaningful and reliable. CLI errors and help text are accurate.

### M4: Ignore Patterns + Monorepo Support (Planned)

- [ ] `.distilignore` file support (`.gitignore` syntax)
- [ ] Monorepo workspace detection (pnpm, npm, lerna)
- [ ] Cross-package call graph resolution
- [ ] `--package` scoping flag
- [ ] `--no-ignore` override flag

**Target:** Distil works correctly in monorepos and respects project ignore patterns

### M5: Semantic Search + CLI Polish (Planned)

- [ ] External embeddings API integration (OpenAI/Anthropic)
- [ ] Semantic search over function behaviors
- [ ] Index warming command with progress display
- [ ] `distil context` LLM-ready output command
- [ ] Output formatting system (--json, --compact)
- [ ] Configuration file support (`.distil/config.json`)
- [ ] Stdin/pipe support (`cat file | distil extract -`)
- [ ] Batch/directory extract mode (`distil extract src/`)
- [ ] npm publish workflow for `@distil/cli` and `@distil/core`

**Target:** `distil semantic "validate JWT tokens"` finds relevant functions; CLI is pipeline-friendly and installable via npm

### M6: MCP Server (Planned)

- [ ] MCP server package (`@distil/mcp`)
- [ ] Tool definitions for all analysis layers
- [ ] Resource and prompt definitions
- [ ] `distil mcp` CLI subcommand
- [ ] Editor integration testing (Claude Code, Cursor)

**Target:** Editors and agents query Distil analysis via MCP protocol

### M7: Multi-Language Support (Planned)

- [ ] Python language support (all layers)
- [ ] Rust language support (all layers)
- [ ] C# language support (all layers)

**Target:** Full parity for Python, Rust, C# alongside TypeScript/JavaScript

---

## Modules

### @distil/core

- **Path:** ./modules/distil-core.aps.md
- **Scope:** CORE
- **Owner:** @aneki
- **Status:** In Progress (L1 incomplete — arrow fns missing; L3-L5 approximate; Kindling pending)
- **Priority:** high
- **Tags:** analysis, ast, callgraph, cfg, dfg, pdg
- **Dependencies:** tree-sitter (current), @kindling/core/@kindling/store-sqlite (planned)

### @distil/cli

- **Path:** ./modules/distil-cli.aps.md
- **Scope:** CLI
- **Owner:** @aneki
- **Status:** In Progress (commands work, 0 tests, misleading help/extensions)
- **Priority:** high
- **Tags:** cli, tooling
- **Dependencies:** @distil/core

### @distil/mcp

- **Path:** ./modules/distil-mcp.aps.md
- **Scope:** MCP
- **Owner:** @aneki
- **Status:** Planned
- **Priority:** medium
- **Tags:** mcp, integration, editor
- **Dependencies:** @distil/core, @modelcontextprotocol/sdk

---

## Decisions

- **D-001:** Distil uses Kindling for caching, not a custom daemon or file-based cache
- **D-002:** Tree-sitter is the parsing foundation for all language support
- **D-003:** Analysis layers are composable; higher layers build on lower ones
- **D-004:** Observation kinds in Kindling are generic (`code.symbol`, `code.callgraph`, etc.); Distil-specific detail lives in metadata
- **D-005:** Database location defaults to `.kindling/distil.db`, configurable via CLI/env/config
- **D-006:** Future language parsers (Python, Rust, C#) are optional peer dependencies
- **D-007:** Semantic search uses external embedding APIs (OpenAI/Anthropic), not local models
- **D-008:** TypeScript/JavaScript are the initial supported languages; others are future milestones
- **D-009:** MCP server uses stdio transport; started via `distil mcp` or configured in editor settings
- **D-010:** `.distilignore` uses `.gitignore` syntax and is checked into version control
- **D-011:** Monorepo detection is automatic; `--package` flag for explicit scoping
- **D-012:** M1 (L1 AST) is not complete until arrow functions, destructured params, interface members, and re-exports are handled — these are not edge cases but dominant patterns in modern TS/JS
- **D-013:** Test coverage must be meaningful before claiming a milestone is complete — `.toBeGreaterThan(0)` assertions do not constitute verification
- **D-014:** Python/Rust/C# file extensions must not be listed as supported until parser implementations exist

---

## Open Questions

### Q-003: Should we reconsider daemon mode?

llm-tldr demonstrates 155x faster queries with a daemon that keeps indexes in memory. Our current plan relies on Kindling/SQLite for caching, which still requires cold-start parsing and DB reads. For the primary use case (LLM agents making rapid sequential queries), a long-running process with in-memory indexes may be significantly better. Options:

- A: Keep current plan — Kindling caching is sufficient, daemon adds operational complexity
- B: Add optional daemon mode alongside Kindling — `distil serve` keeps indexes hot, falls back to Kindling on cold start
- C: Replace Kindling dependency with a built-in daemon — simpler architecture, fewer external dependencies

### Q-004: Should we prioritize npm publish for easier adoption?

Currently install requires `git clone` + `pnpm install` + `pnpm build` + `pnpm link`. llm-tldr is `pip install llm-tldr`. A single `npx @distil/cli extract file.ts` would dramatically lower the barrier to trying distil. This could be done before M5 with minimal effort.

### Q-005: How should we handle the tree-sitter native dependency for distribution?

tree-sitter requires a C/C++ toolchain at install time (node-gyp-build). This will cause install failures on systems without build tools (minimal Docker images, CI runners, some Mac setups). Options:

- A: Document the requirement and accept the friction
- B: Provide pre-built binaries via optionalDependencies
- C: Switch to tree-sitter WASM bindings (web-tree-sitter) — no native compilation needed, but may have performance implications

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
