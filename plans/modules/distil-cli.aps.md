# @distil/cli

| Scope | Owner  | Priority | Status                                                    |
| ----- | ------ | -------- | --------------------------------------------------------- |
| CLI   | @aneki | high     | In Progress (commands work, 0 tests, misleading help/ext) |

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

- @distil/core — all analysis functions
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

| Risk                                   | Mitigation                                    |
| -------------------------------------- | --------------------------------------------- |
| API key management for semantic search | Support env vars, config file, and CLI flag   |
| Large output overwhelming terminal     | Default to compact format; --full for verbose |
| Slow commands for large projects       | Progress indicators; caching via Kindling     |

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

- **Status:** Partially complete — `distil tree` works; `distil structure` does not exist
- **Intent:** Provide project overview commands
- **Expected Outcome:** `distil tree` shows file tree; `distil structure` shows code overview
- **Scope:** `src/commands/tree.ts`, `src/commands/structure.ts`
- **Non-scope:** Analysis logic (uses CORE)
- **Files:** `src/commands/tree.ts`, `src/commands/structure.ts`
- **Dependencies:** CLI-001, CORE-003
- **Validation:** `distil tree . && distil structure .`
- **Confidence:** high
- **Risks:** Large directory handling
- **Known gaps:** `distil structure` is referenced in the source header comment and CLI plan but was never implemented

### CLI-003: Extract command

- **Status:** Functional — depends on CORE-003 fixes for correct output
- **Intent:** Expose L1 AST extraction via CLI
- **Expected Outcome:** `distil extract <file>` outputs file analysis in requested format
- **Scope:** `src/commands/extract.ts`
- **Non-scope:** AST extraction logic
- **Files:** `src/commands/extract.ts`
- **Dependencies:** CLI-001, CORE-003
- **Validation:** `distil extract src/index.ts --json`
- **Confidence:** high
- **Risks:** None significant
- **Known gaps:** `--compact` output drops interfaces, types, variables, exports (see CORE-018); raw ENOENT error on missing files instead of user-friendly message

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

### CLI-006: CFG and DFG commands ✅

- **Status:** Complete
- **Intent:** Expose L3/L4 analysis via CLI
- **Expected Outcome:** `distil cfg` shows control flow; `distil dfg` shows data flow
- **Scope:** `src/index.ts` (commands defined inline)
- **Non-scope:** CFG/DFG extraction logic
- **Files:** `src/index.ts`
- **Dependencies:** CLI-001, CORE-006, CORE-007
- **Validation:** `distil cfg src/index.ts main && distil dfg src/index.ts main`
- **Confidence:** high
- **Completed:** Both commands with human-readable and JSON output

### CLI-007: Slice command ✅

- **Status:** Complete
- **Intent:** Expose L5 program slicing via CLI
- **Expected Outcome:** `distil slice <file> <func> <line>` shows relevant lines
- **Scope:** `src/index.ts` (command defined inline)
- **Non-scope:** Slicing logic
- **Files:** `src/index.ts`
- **Dependencies:** CLI-001, CORE-008
- **Validation:** `distil slice src/index.ts main 42`
- **Confidence:** high
- **Completed:** Backward and forward slicing with source context display

### CLI-008: Semantic search command

- **Status:** Planned
- **Intent:** Enable natural language code search
- **Expected Outcome:** `distil semantic <query>` finds relevant functions by behavior
- **Scope:** `src/commands/semantic.ts`
- **Non-scope:** Embedding logic (CORE-012)
- **Files:** `src/commands/semantic.ts`
- **Dependencies:** CLI-001, CORE-012
- **Validation:** `OPENAI_API_KEY=xxx distil semantic "validate JWT"`
- **Confidence:** medium
- **Risks:** API key management; rate limiting

**Implementation Details:**

1. **API key resolution:** `--api-key` flag > `OPENAI_API_KEY` env var > `.distil/config.json`
2. **Output:** Ranked list of functions with similarity scores
3. **Options:**
   - `--limit <n>` — max results (default: 10)
   - `--threshold <n>` — minimum similarity score (default: 0.5)
   - `--provider <name>` — embedding provider (default: openai)
   - `--json` — structured output
4. **First-run experience:** If no API key found, show clear setup instructions

### CLI-009: Warm command

- **Status:** Planned
- **Intent:** Pre-build all indexes for fast queries
- **Expected Outcome:** `distil warm` analyzes project and caches results in Kindling
- **Scope:** `src/commands/warm.ts`
- **Non-scope:** Caching implementation (CORE-005), warming logic (CORE-013)
- **Files:** `src/commands/warm.ts`
- **Dependencies:** CLI-001, CORE-005, CORE-013
- **Validation:** `distil warm . && distil context main --project .`
- **Confidence:** high
- **Risks:** Progress display for large projects

**Implementation Details:**

1. **Progress display:** Spinner with stage name, file count, current file
2. **Output to stderr:** Progress on stderr, summary on stdout (for piping)
3. **Options:**
   - `--layers <list>` — comma-separated layers to warm (default: all)
   - `--no-semantic` — skip semantic indexing even if API key available
   - `--json` — output summary as JSON
4. **Summary:** Total files, functions, edges, time elapsed, cache hits/misses

### CLI-010: Output formatting and configuration

- **Status:** Planned
- **Intent:** Support multiple output formats and configuration
- **Expected Outcome:** --json, --compact flags work; config file respected
- **Scope:** `src/format/`, `src/config/`
- **Non-scope:** Analysis logic
- **Files:** `src/format/index.ts`, `src/format/json.ts`, `src/format/text.ts`, `src/config/index.ts`
- **Dependencies:** CLI-001
- **Validation:** `distil extract src/index.ts --json && distil extract src/index.ts --compact`
- **Confidence:** high
- **Risks:** None significant

### CLI-011: .distilignore CLI integration

- **Status:** Planned
- **Intent:** Ensure all CLI commands respect .distilignore patterns
- **Expected Outcome:** Files matching .distilignore patterns are excluded from all output
- **Scope:** Integration between CLI commands and CORE-010 ignore logic
- **Non-scope:** Ignore pattern implementation (CORE-010)
- **Files:** `src/index.ts` (update all commands to pass ignore context)
- **Dependencies:** CLI-001, CORE-010
- **Validation:** Create `.distilignore` with a pattern; verify `distil tree`, `distil calls`, `distil extract` respect it
- **Confidence:** high
- **Risks:** None significant

**Implementation Details:**

1. **Global option:** `--no-ignore` flag to disable .distilignore
2. **Feedback:** `distil tree` marks ignored directories distinctly (or omits them)
3. **Init command:** Consider `distil init` that creates a starter `.distilignore`

### CLI-012: MCP server subcommand

- **Status:** Planned
- **Intent:** Start MCP server from CLI for editor integration
- **Expected Outcome:** `distil mcp` starts stdio MCP server
- **Scope:** `src/commands/mcp.ts`
- **Non-scope:** MCP server implementation (@distil/mcp)
- **Files:** `src/commands/mcp.ts`
- **Dependencies:** CLI-001, MCP-001
- **Validation:** `distil mcp` starts server; editor connects
- **Confidence:** high
- **Risks:** None significant

### CLI-013: CLI test coverage

- **Status:** Ready
- **Intent:** Add test coverage for all CLI commands — currently 0 tests
- **Expected Outcome:** Tests verify command parsing, output formats (--json, --compact, default), error handling, and fuzzy matching for all 7 commands
- **Scope:** `src/` — new test files
- **Non-scope:** Core analysis logic (tested in CORE)
- **Files:** `src/commands/extract.test.ts`, `src/commands/tree.test.ts`, `src/index.test.ts`
- **Dependencies:** CLI-001
- **Validation:** `pnpm -F @distil/cli test` — all tests pass, `passWithNoTests` removed from vitest config
- **Confidence:** high
- **Risks:** None significant

### CLI-014: Remove misleading language extensions

- **Status:** Ready
- **Intent:** Stop listing Python/Rust/C# as supported extensions when no parsers exist
- **Expected Outcome:** `LANGUAGE_EXTENSIONS` only includes TS/JS extensions. Error message for unsupported files no longer lists `.py`, `.rs`, `.cs` as supported. Python/Rust/C# grammars remain as optional dependencies for future use.
- **Scope:** `@distil/core` — `LANGUAGE_EXTENSIONS` constant; `@distil/cli` — extract command error message
- **Non-scope:** Implementing Python/Rust/C# parsers (M7)
- **Files:** Core types/common.ts or wherever `LANGUAGE_EXTENSIONS` is defined
- **Dependencies:** (none)
- **Validation:** `distil extract test.py` error message does not list `.py` as supported
- **Confidence:** high
- **Risks:** None significant

### CLI-015: Fix help text referencing nonexistent commands

- **Status:** Ready
- **Intent:** Remove references to `structure`, `context`, `semantic`, `warm` from the source header comment in index.ts
- **Expected Outcome:** Source file header only lists commands that actually exist. Quick-start help text is accurate.
- **Scope:** `src/index.ts` — header comment block (lines 2-19)
- **Non-scope:** Implementing the missing commands (separate tasks)
- **Files:** `src/index.ts`
- **Dependencies:** (none)
- **Validation:** Comment block matches registered commands
- **Confidence:** high
- **Risks:** None significant

### CLI-016: Stdin/pipe support for extract

- **Status:** Planned
- **Intent:** Allow piping source code into distil via stdin
- **Expected Outcome:** `cat file.ts | distil extract - --lang typescript` reads from stdin and produces the same output as file-based extract
- **Scope:** `src/commands/extract.ts`
- **Non-scope:** Stdin for other commands
- **Files:** `src/commands/extract.ts`
- **Dependencies:** CLI-003
- **Validation:** `echo "function foo() {}" | distil extract - --lang typescript` outputs function info
- **Confidence:** high
- **Risks:** Language detection requires explicit `--lang` flag when reading stdin

### CLI-017: Batch/directory extract mode

- **Status:** Planned
- **Intent:** Allow extracting structure from all files in a directory
- **Expected Outcome:** `distil extract src/` produces aggregated L1 output for all supported files in the directory
- **Scope:** `src/commands/extract.ts`
- **Non-scope:** Recursive call graph (use `distil calls` for that)
- **Files:** `src/commands/extract.ts`
- **Dependencies:** CLI-003
- **Validation:** `distil extract src/ --json` outputs array of ModuleInfo objects
- **Confidence:** high
- **Risks:** Output size for large directories; need sensible defaults (respect .distilignore, skip node_modules)

### CLI-018: Modularize inline commands

- **Status:** Planned
- **Intent:** Extract calls, impact, cfg, dfg, slice commands from index.ts into separate command files
- **Expected Outcome:** Each command is in its own file under `src/commands/`. Fuzzy matching logic is extracted into a shared utility. index.ts is under 100 lines.
- **Scope:** `src/commands/`, `src/index.ts`
- **Non-scope:** Changing command behavior
- **Files:** `src/commands/calls.ts`, `src/commands/impact.ts`, `src/commands/cfg.ts`, `src/commands/dfg.ts`, `src/commands/slice.ts`, `src/utils/fuzzy.ts`
- **Dependencies:** (none)
- **Validation:** `pnpm build && distil --help` — all commands still work
- **Confidence:** high
- **Risks:** None significant

## Decisions

- **D-001:** Commander.js is the CLI framework (mature, widely used)
- **D-002:** Default output is human-readable; --json for programmatic use
- **D-003:** API keys for semantic search read from env vars first, then config
- **D-004:** Progress indicators use stderr; output uses stdout (for piping)
- **D-005:** `.distilignore` is respected by default; `--no-ignore` to override

## Future Enhancements

- **Interactive function selection:** When `distil impact` matches multiple functions, offer a numbered list for interactive selection instead of requiring the user to re-run with a more specific name.
- **Global --quiet and --verbose flags:** Add consistent verbosity controls across all commands.
- **`distil init` command:** Generate starter `.distilignore` and `.distil/config.json`.
- **`distil watch` command:** Watch for file changes and re-analyze incrementally.

## Notes

- Keep command implementations thin; delegate to CORE.
- Test commands with various project sizes to ensure performance.
- MCP subcommand should be lightweight; import @distil/mcp lazily to avoid startup cost when not used.
