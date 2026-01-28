# @distil/cli

| Scope | Owner | Priority | Status |
|-------|-------|----------|--------|
| CLI | @aneki | high | In Progress (L1-L2 commands complete) |

## Purpose

Provides the command-line interface for Distil. Exposes all analysis capabilities through intuitive commands for developers and LLM agents.

This is the user-facing surface of Distil. It formats analysis results for human consumption and LLM context injection.

## In Scope

- CLI command structure and parsing
- Output formatting (JSON, text, LLM-ready)
- File tree and structure commands
- Analysis commands (extract, context, impact, cfg, dfg, slice)
- Semantic search command
- Index warming command
- Configuration management

## Out of Scope

- Analysis implementation (distil-core)
- Kindling persistence (distil-core handles this)
- MCP server (future consideration)
- Editor integrations

## Interfaces

**Depends on:**

- @edda-distil/core — all analysis functions
- commander — CLI framework
- openai — embeddings API (for semantic search)

**Exposes:**

- `distil tree [path]` — file tree structure
- `distil structure [path]` — code structure overview
- `distil extract <file>` — full file analysis (L1)
- `distil context <func> --project <path>` — LLM-ready context
- `distil calls [path]` — build call graph (L2)
- `distil impact <func> [path]` — reverse call graph (L2)
- `distil cfg <file> <func>` — control flow graph (L3)
- `distil dfg <file> <func>` — data flow graph (L4)
- `distil slice <file> <func> <line>` — program slice (L5)
- `distil semantic <query> [path]` — semantic search
- `distil warm [path]` — build all indexes

## Boundary Rules

- CLI must not implement analysis logic; delegate to CORE
- CLI must support multiple output formats (JSON, text, compact)
- CLI must provide helpful error messages with actionable guidance
- CLI must respect .distilignore patterns

## Acceptance Criteria

- [ ] All commands parse arguments correctly
- [ ] Output formats work (--json, --compact, default)
- [ ] Error messages are clear and actionable
- [ ] Help text is comprehensive for each command
- [ ] Commands respect --project flag for monorepo support
- [ ] Semantic search integrates with OpenAI/Anthropic APIs

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| API key management for semantic search | Support env vars, config file, and CLI flag |
| Large output overwhelming terminal | Default to compact format; --full for verbose |
| Slow commands for large projects | Progress indicators; caching via Kindling |

## Tasks

### CLI-001: Project setup and command structure

- **Status:** In Progress (extract/tree registered)
- **Intent:** Establish CLI framework and command hierarchy
- **Expected Outcome:** `tldr --help` shows all commands; subcommands parse correctly
- **Scope:** `src/index.ts`, `src/commands/`
- **Non-scope:** Command implementations
- **Files:** `src/index.ts`, `src/commands/index.ts`
- **Dependencies:** (none)
- **Validation:** `pnpm build && tldr --help`
- **Confidence:** high
- **Risks:** None significant

### CLI-002: Tree and structure commands

- **Status:** In Progress (tree complete)
- **Intent:** Provide project overview commands
- **Expected Outcome:** `distil tree` shows file tree; `distil structure` shows code overview
- **Scope:** `src/commands/tree.ts`, `src/commands/structure.ts`
- **Non-scope:** Analysis logic (uses CORE)
- **Files:** `src/commands/tree.ts`, `src/commands/structure.ts`
- **Dependencies:** CLI-001, CORE-003
- **Validation:** `distil tree . && distil structure .`
- **Confidence:** high
- **Risks:** Large directory handling

### CLI-003: Extract command

- **Status:** Complete
- **Intent:** Expose L1 AST extraction via CLI
- **Expected Outcome:** `distil extract <file>` outputs file analysis in requested format
- **Scope:** `src/commands/extract.ts`
- **Non-scope:** AST extraction logic
- **Files:** `src/commands/extract.ts`
- **Dependencies:** CLI-001, CORE-003
- **Validation:** `distil extract src/index.ts --json`
- **Confidence:** high
- **Risks:** None significant

### CLI-004: Call graph commands (calls, impact) ✅

- **Status:** Complete
- **Intent:** Expose L2 call graph via CLI
- **Expected Outcome:** `distil calls` builds call graph; `distil impact <func>` shows callers
- **Scope:** `src/index.ts` (commands defined inline)
- **Non-scope:** Call graph construction logic
- **Files:** `src/index.ts`
- **Dependencies:** CLI-001, CORE-004
- **Validation:** `distil calls . && distil impact main .`
- **Confidence:** high
- **Risks:** None significant
- **Completed:** Both commands working with JSON output, fuzzy matching, and transitive caller support

### CLI-005: Context command

- **Intent:** Provide LLM-ready context with configurable depth
- **Expected Outcome:** `distil context <func>` outputs token-efficient summary
- **Scope:** `src/commands/context.ts`
- **Non-scope:** Context generation logic
- **Files:** `src/commands/context.ts`
- **Dependencies:** CLI-001, CORE-009
- **Validation:** `distil context main --project . --depth 2`
- **Confidence:** high
- **Risks:** Token budget display accuracy

### CLI-006: CFG and DFG commands 🔄

- **Status:** In Review (PR #1)
- **Intent:** Expose L3/L4 analysis via CLI
- **Expected Outcome:** `distil cfg` shows control flow; `distil dfg` shows data flow
- **Scope:** `src/index.ts` (commands defined inline)
- **Non-scope:** CFG/DFG extraction logic
- **Files:** `src/index.ts`
- **Dependencies:** CLI-001, CORE-006, CORE-007
- **Validation:** `distil cfg src/index.ts main && distil dfg src/index.ts main`
- **Confidence:** high
- **Risks:** None significant

### CLI-007: Slice command 🔄

- **Status:** In Review (PR #1)
- **Intent:** Expose L5 program slicing via CLI
- **Expected Outcome:** `distil slice <file> <func> <line>` shows relevant lines
- **Scope:** `src/index.ts` (command defined inline)
- **Non-scope:** Slicing logic
- **Files:** `src/index.ts`
- **Dependencies:** CLI-001, CORE-008
- **Validation:** `distil slice src/index.ts main 42`
- **Confidence:** high
- **Risks:** None significant

### CLI-008: Semantic search command

- **Intent:** Enable natural language code search
- **Expected Outcome:** `distil semantic <query>` finds relevant functions by behavior
- **Scope:** `src/commands/semantic.ts`, `src/semantic/`
- **Non-scope:** Embedding model implementation
- **Files:** `src/commands/semantic.ts`, `src/semantic/embeddings.ts`, `src/semantic/index.ts`
- **Dependencies:** CLI-001, CORE-003, CORE-004
- **Validation:** `OPENAI_API_KEY=xxx distil semantic "validate JWT"`
- **Confidence:** medium
- **Risks:** API key management; rate limiting

### CLI-009: Warm command

- **Intent:** Pre-build all indexes for fast queries
- **Expected Outcome:** `distil warm` analyzes project and caches results in Kindling
- **Scope:** `src/commands/warm.ts`
- **Non-scope:** Caching implementation
- **Files:** `src/commands/warm.ts`
- **Dependencies:** CLI-001, CORE-005
- **Validation:** `distil warm . && distil context main --project .`
- **Confidence:** high
- **Risks:** Progress display for large projects

### CLI-010: Output formatting and configuration

- **Intent:** Support multiple output formats and configuration
- **Expected Outcome:** --json, --compact flags work; config file respected
- **Scope:** `src/format/`, `src/config/`
- **Non-scope:** Analysis logic
- **Files:** `src/format/index.ts`, `src/format/json.ts`, `src/format/text.ts`, `src/config/index.ts`
- **Dependencies:** CLI-001
- **Validation:** `distil extract src/index.ts --json && distil extract src/index.ts --compact`
- **Confidence:** high
- **Risks:** None significant

## Decisions

- **D-001:** Commander.js is the CLI framework (mature, widely used)
- **D-002:** Default output is human-readable; --json for programmatic use
- **D-003:** API keys for semantic search read from env vars first, then config
- **D-004:** Progress indicators use stderr; output uses stdout (for piping)

## Future Enhancements

- **Interactive function selection:** When `distil impact` matches multiple functions, offer a numbered list for interactive selection instead of requiring the user to re-run with a more specific name.
- **Global --quiet and --verbose flags:** Add consistent verbosity controls across all commands.

## Notes

- Keep command implementations thin; delegate to CORE.
- Test commands with various project sizes to ensure performance.
