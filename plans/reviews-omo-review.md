# Distil Project Review

**Date**: 2026-03-06
**Reviewer**: OmO (AI-assisted review)
**Scope**: Full project review — architecture, code quality, test coverage, CI/CD, plan accuracy

---

## Executive Summary

Distil is a well-architected token-efficient code analysis tool that delivers on its core promise: extracting structured code analysis (L1-L5) from TypeScript/JavaScript sources using tree-sitter. All five analysis layers are implemented and functional. The build is clean, all 39 tests pass, type checking is strict, and linting passes.

The project is at an **early-mature** stage — core functionality works, the MCP server is operational, and the CLI covers all documented commands. The main risks are: low test coverage relative to the complexity of the analysis engine, a monolithic parser file that will resist scaling to additional languages, and several integration points (Kindling caching) that are coded but not wired in.

### Health Dashboard

| Metric       | Status         | Details                                                        |
| ------------ | -------------- | -------------------------------------------------------------- |
| Build        | ✅ Pass        | All 3 packages build cleanly                                   |
| Tests        | ✅ 39/39       | core=23, cli=3, mcp=13 (as of dad0895)                         |
| Type Check   | ✅ Clean       | Strict mode with `noUncheckedIndexedAccess`                    |
| Lint         | ✅ Clean       | ESLint passes                                                  |
| Format       | ⚠️ 19 warnings | All in `.claude/` configs and `plans/index.aps.md`, not source |
| TODOs        | 1              | Arrow function parsing gap (typescript.ts:841) (as of dad0895) |
| Dependencies | ✅ Current     | tree-sitter 0.25, MCP SDK 1.9                                  |

---

## Architecture Assessment

### Monorepo Structure

```
packages/
  distil-core   (4,572 LOC)  — Analysis engine, tree-sitter parsers, L1-L5
  distil-cli    (1,206 LOC)  — Commander.js CLI
  distil-mcp    (473 LOC)    — MCP server for editor/agent integration
```

**Total source**: ~6,251 LOC | **Total tests**: ~701 LOC

The three-package monorepo structure is clean and the dependency graph is correct: `cli → core`, `mcp → core + @modelcontextprotocol/sdk`. No circular dependencies.

### Package Boundaries — Mostly Good, Some Leaks

**@distil/core** correctly owns:

- Parser system (tree-sitter, `LanguageParser` interface, parser registry)
- All 5 analysis layers (AST, Call Graph, CFG, DFG, PDG)
- Type definitions, ignore system, kindling caching layer
- High-level extractors (`extractCFG`, `extractDFG`, `extractPDG`)
- File collection (`collectSourceFiles`) and call graph building (`buildCallGraph`)

**Boundary issues**:

1. **`findCallers()` is duplicated** — Implemented in both `distil-cli/src/index.ts` (lines 530-590) and `distil-mcp/src/server.ts` (lines 250-310). This function performs L2 impact analysis and belongs in `@distil/core`. Both implementations have nearly identical logic for building a call graph, finding matching functions, and walking backward edges.

2. **`BUILTIN_METHODS` set lives in CLI** — The CLI's `index.ts` contains a ~160-entry hardcoded `Set` of built-in method names (e.g., `push`, `pop`, `map`, `filter`, `addEventListener`, etc.) used to filter call graph noise. This filtering logic is domain knowledge that belongs in core, not the CLI. The MCP server doesn't benefit from it at all, meaning MCP users get noisier call graphs.

3. **Display logic mixed with analysis** — CLI's `index.ts` (907 lines) mixes Commander command setup, analysis invocation, display formatting, and the BUILTIN_METHODS filter. The commands that were extracted to `src/commands/` (tree, extract, mcp) are well-structured, but `calls`, `impact`, `cfg`, `dfg`, and `slice` are all inline.

### Parser Architecture

The `LanguageParser` interface (`parsers/base.ts`) is well-designed:

```typescript
interface LanguageParser {
  language: Language;
  extensions: string[];
  extractAST(source, filePath): Promise<ModuleInfo>;
  extractCalls(source, filePath): Promise<Map<string, string[]>>;
  extractCFG(source, functionName, filePath): Promise<CFGInfo | null>;
  extractDFG(source, functionName, filePath): Promise<DFGInfo | null>;
  extractPDG(source, functionName, filePath): Promise<PDGInfo | null>;
}
```

The registry pattern (`registerParser`, `getParserForFile`, `getParserForLanguage`) is clean and extensible. Adding Python/Rust parsers would require implementing this interface — no framework changes needed.

**However**: The TypeScript parser implementation (`typescript.ts`, 2,074 lines) contains the parser class + CFGBuilder class + DFGBuilder class all in one file. When Python/Rust parsers are added, this file serves as the template. The builders should be extracted into separate files (`cfg-builder.ts`, `dfg-builder.ts`) before this happens.

### Type System

Types are well-organized across `types/`:

- `ast.ts` (325 lines) — L1 types with factory functions (`createFunctionInfo`, `createClassInfo`, etc.)
- `callgraph.ts` — L2 types with `ProjectCallGraph` and edge types
- `cfg.ts` — L3 types with `CFGInfo`, blocks, and edges
- `dfg.ts` — L4 types with `DFGInfo`, variable refs, def-use chains
- `pdg.ts` (384 lines) — L5 types with `PDGInfo`, slicing algorithms (`backwardSlice`, `forwardSlice`)
- `common.ts` — Shared types (`Language`, `SourceRange`, etc.)

The type system is strict. `noUncheckedIndexedAccess` is enabled, meaning every indexed access requires a null check. This is excellent for robustness, especially in tree-sitter traversal code where child nodes may not exist.

**Observation**: The factory functions in `ast.ts` (e.g., `createFunctionInfo`) add `signature()` and `toJSON()` methods. This is a practical pattern that keeps the types serializable while providing convenience methods.

---

## Code Quality Assessment

### Strengths

1. **Consistent error handling** — All CLI commands follow the same try/catch → `console.error` → `process.exit(1)` pattern. The MCP server returns structured error responses.

2. **Null safety** — Tree-sitter child nodes are always null-checked before access. The `noUncheckedIndexedAccess` setting enforces this at the type level.

3. **Clean API surface** — Core exports are well-organized via `index.ts` barrel file. Public API is coherent: `buildCallGraph`, `extractCFG`, `extractDFG`, `extractPDG`, `collectSourceFiles`, `getParser`.

4. **Lazy initialization** — The tree-sitter parser uses lazy init (`this.parser` created on first use), avoiding startup cost for unused parsers.

5. **Content hashing** — `ModuleInfo` includes a content hash, enabling cache invalidation for the Kindling integration.

### Issues

#### Critical

None. The project builds, tests pass, and the core analysis produces correct results.

#### High Priority

1. **Monolithic parser file** (typescript.ts, 2,074 lines)

   The `TypeScriptParser` class, `CFGBuilder` class (690 lines), and `DFGBuilder` class (305 lines) are all in one file. This is the single largest maintainability risk.

   **Recommendation**: Extract `CFGBuilder` and `DFGBuilder` into `cfg-builder.ts` and `dfg-builder.ts`. The parser class stays in `typescript.ts`. This is a pure structural refactor with no behavior change.

2. **DFG reaching-definitions is approximate**

   The `DFGBuilder.buildDefUseEdges()` method (lines 2015-2054) uses a line-number heuristic ("most recent definition before this use") instead of a proper reaching-definitions analysis. The code includes a candid NOTE acknowledging this:

   > "A sound reaching-definitions analysis must account for control flow... For now, we use a conservative approximation."

   This means:
   - Definitions in mutually exclusive `if/else` branches aren't distinguished
   - Loop variable re-definitions may produce incorrect chains
   - `isMayReach` is set when multiple definitions exist, but the wrong one may be selected

   **Impact**: L4 (DFG) and L5 (PDG/slicing) correctness depends on this. For the stated use case (LLM context reduction), approximate results are acceptable, but this should be documented as a known limitation and tracked as a milestone item.

3. **Kindling caching coded but not wired in**

   The `kindling/` directory contains a complete caching layer:
   - `store.ts` — `DistilStore` class with `setObservation`, `getObservation`, `query` methods
   - `observations.ts` — Observation serialization/deserialization
   - `types.ts` — `DistilLayer`, `DistilObservation`, `DistilQuery` types
   - `config.ts` — Store configuration

   But none of the analysis functions (`buildCallGraph`, `extractCFG`, `extractDFG`, `extractPDG`) use it. The store is exported from core's `index.ts` but never instantiated in any analysis path.

   **Recommendation**: Either wire it in (M5 scope) or clearly mark it as "scaffolding for future use" in docs/plans.

#### Medium Priority

4. **Duplicate `findCallers()` logic**

   Both CLI and MCP implement caller-finding independently. Extract to `@distil/core` as `findCallers(functionName: string, path: string): Promise<CallerResult[]>`.

5. **BUILTIN_METHODS in wrong package**

   The ~160-entry `BUILTIN_METHODS` set in CLI's `index.ts` should move to `@distil/core` so MCP can also filter built-in calls from L2 results.

6. **CLI commands partially extracted**

   Three commands are properly in `src/commands/` (tree, extract, mcp), but five commands remain inline in `index.ts` (calls, impact, cfg, dfg, slice). This makes the 907-line file harder to navigate than necessary.

   **Recommendation**: Extract each remaining command following the pattern established by `extract.ts` and `tree.ts`.

7. **Empty catch block in tree.ts**

   ```typescript
   // tree.ts line 107-109
   } catch {
     // Permission denied or other error
   }
   ```

   Silent error swallowing during directory traversal. While arguably acceptable for `readdir` permission errors, it would be better to log at debug level or count skipped entries.

8. **Interface parsing is incomplete**

   `parseInterface()` (lines 745-767) extracts only the interface name. It doesn't parse members, methods, or the `extends` clause despite having the data structures for them (`methods: FunctionInfo[]`, `properties: PropertyInfo[]`, `extends: string[]`). The arrays are always empty.

#### Low Priority

9. **`processBreakContinue` has dead code** — Line 1590: `const blockType = node.type === "break_statement" ? "body" : "body"` — both branches produce `"body"`. The ternary is meaningless.

10. **Builtins set recreated per call** — In `DFGBuilder.processIdentifier()` (line 1900), a `new Set([...])` of 18 builtins is created on every identifier node visit. Should be a module-level constant.

11. **`toJSON()`/`toCompact()` methods are defined inline** — These methods on `ModuleInfo` are defined as object literal methods inside `extractAST()` (lines 197-238). They close over the local `filePath` variable. This works but is an unusual pattern that makes the return value harder to reason about. Consider making them proper methods or standalone functions.

---

## Test Coverage Assessment

### Quantitative

| Package      | Source LOC | Test LOC | Tests  | Ratio     |
| ------------ | ---------- | -------- | ------ | --------- |
| @distil/core | 4,572      | 415      | 23     | 9.1%      |
| @distil/cli  | 1,206      | 103      | 3      | 8.5%      |
| @distil/mcp  | 473        | 183      | 13     | 38.7%     |
| **Total**    | **6,251**  | **701**  | **39** | **11.2%** |

### Qualitative

**@distil/core** (23 tests in `typescript.test.ts`):

- Tests L1 extraction (function/class/import parsing) ✅
- Tests L2 call graph construction ✅
- Tests L3 CFG building ✅
- Tests L4 DFG building ✅
- Tests L5 PDG/slicing ✅
- Tests content hashing ✅
- **Missing**: Edge cases (nested functions, complex destructuring, re-exports, generator functions), error paths, malformed input, large file handling

**@distil/cli** (3 tests in `index.test.ts`):

- All 3 tests are ignore-integration focused (testing `.distilignore` behavior)
- **Missing**: No tests for ANY CLI command output (extract, tree, calls, impact, cfg, dfg, slice). No tests for `--json` or `--compact` flags. No tests for error handling (unsupported file types, missing files).

**@distil/mcp** (13 tests in `server.test.ts`):

- Tests tool listing and schema ✅
- Tests prompt listing and content ✅
- Tests error handling for missing arguments ✅
- **Missing**: No tests for actual analysis tool execution (e.g., calling `distil_extract` with a real file). Tests only verify MCP protocol compliance, not analysis correctness.

### Test Gaps (Priority Order)

1. **CLI command output tests** — Highest gap. Zero commands tested end-to-end.
2. **Parser edge cases** — Nested arrow functions, complex destructuring, optional chaining, nullish coalescing.
3. **MCP tool execution** — Tools should be tested with actual files, not just schema validation.
4. **Error paths** — What happens with binary files, empty files, files with syntax errors?
5. **Cross-layer consistency** — L2 call graph edges should match L1 function names. No test verifies this.

---

## Plan Accuracy (APS vs Reality)

### Milestone Status

| Milestone           | APS Status  | Actual Status                    | Accurate? |
| ------------------- | ----------- | -------------------------------- | --------- |
| M1: Core Foundation | ✅ Complete | ✅ Implemented                   | ✅        |
| M2: CLI             | ✅ Complete | ✅ Implemented                   | ✅        |
| M3: L1-L5 Analysis  | ✅ Complete | ✅ Implemented                   | ✅        |
| M4: MCP Server      | 🔄 Partial  | ✅ MCP-001 done, MCP-002 planned | ⚠️ Stale  |
| M5: Caching         | 📋 Planned  | Scaffolded, not wired            | ✅        |
| M6: Multi-language  | 📋 Planned  | Not started                      | ✅        |
| M7: Semantic Search | 📋 Planned  | Not started                      | ✅        |

### Specific Inaccuracies

1. **MCP-001 is complete but listed as "Planned"** — The MCP server is fully implemented with 6 tools, 3 prompts, and 13 tests. The APS plan doesn't reflect this. Task status should be updated to "Complete".

2. **Kindling caching scope unclear** — M5 lists caching as planned, and the scaffolding exists in `kindling/`. But the APS doesn't specify when/whether the existing scaffolding should be wired into the analysis pipeline, or if it's a fresh implementation.

3. **No mention of ignore system** — The `.distilignore` system is implemented and working but not referenced as a work item in any milestone. It was presumably added ad-hoc.

---

## CI/CD & Developer Experience

### CI Pipeline (`.github/workflows/ci.yml`)

- Triggers on push/PR to main
- Matrix: Node 20.x, 22.x
- Steps: install → build → typecheck → test
- **Good**: All quality gates are in sequence. A type error blocks test execution.
- **Missing**: No code coverage reporting. No integration/e2e tests.

### Publish Pipeline (`.github/workflows/publish.yml`)

- Manual trigger (`workflow_dispatch`)
- Steps: install → build → test → publish to npm
- Uses `NPM_TOKEN` secret
- **Good**: Manual publish is appropriate for this project stage.

### Local DX

- Pre-commit hook via Husky (`lint-staged` with prettier + eslint)
- `pnpm build`, `pnpm test`, `pnpm typecheck` all work correctly
- Vitest for testing with sensible defaults
- **Good**: Fast feedback loop locally.

### Missing DX Items

1. No `pnpm dev` or watch mode at the monorepo root
2. No `pnpm coverage` command
3. No `.nvmrc` or `.node-version` file (Node version only specified in CI)

---

## Security Considerations

- No user authentication or network exposure (CLI tool / local MCP server)
- File system access is read-only for analysis
- `.distilignore` prevents accidentally analyzing `node_modules`, `.git`, etc.
- No secrets in repository
- **No concerns** for the current scope. If the MCP server ever accepts remote connections, input validation on file paths would be needed.

---

## Recommendations (Prioritized)

### P0 — Before Next Feature Work

1. **Update APS plan** — Mark MCP-001 as complete. Clarify M5 (Kindling) scope relative to existing scaffolding.

2. **Add CLI command tests** — Even basic smoke tests (`distil extract <fixture>` produces expected output) would catch regressions. The CLI has zero command tests.

### P1 — Next Sprint

3. **Extract `findCallers()` to core** — Deduplicate CLI/MCP implementations. Single source of truth for L2 impact analysis.

4. **Move `BUILTIN_METHODS` to core** — Make call graph filtering available to all consumers (CLI + MCP).

5. **Split typescript.ts** — Extract `CFGBuilder` (690 lines) and `DFGBuilder` (305 lines) into separate files. The parser class stays in `typescript.ts` at ~1,079 lines.

6. **Extract remaining CLI commands** — Move `calls`, `impact`, `cfg`, `dfg`, `slice` commands to `src/commands/` following the established pattern.

### P2 — Before Multi-Language (M6)

7. **Document DFG approximation** — The reaching-definitions heuristic is a known limitation. Document it in the README or a design doc so users understand L4/L5 precision boundaries.

8. **Complete interface parsing** — `parseInterface()` currently only extracts the name. Fill in `methods`, `properties`, and `extends` parsing.

9. **Add parser edge case tests** — Nested arrow functions, destructuring assignments, optional chaining, generator functions, decorators.

10. **Wire Kindling caching or remove scaffolding** — Dead code that's never called is a maintenance burden. Either activate it (M5) or move it to a feature branch.

### P3 — Nice to Have

11. **Fix dead code**: `processBreakContinue` ternary (line 1590), move DFG builtins set to module scope.
12. **Add code coverage** to CI pipeline.
13. **Add `.node-version` file** for local environment consistency.
14. **Replace empty catch** in `tree.ts` with debug-level logging.

---

## Appendix: File Inventory

### @distil/core — Source Files

| File                           | Lines | Purpose                                            |
| ------------------------------ | ----- | -------------------------------------------------- |
| `src/parsers/typescript.ts`    | 2,074 | TypeScript parser + CFG/DFG builders               |
| `src/types/pdg.ts`             | 384   | L5 types + slicing algorithms                      |
| `src/types/ast.ts`             | 325   | L1 types + factory functions                       |
| `src/index.ts`                 | 275   | Public API, `buildCallGraph`, `collectSourceFiles` |
| `src/types/dfg.ts`             | 172   | L4 types                                           |
| `src/types/cfg.ts`             | 152   | L3 types                                           |
| `src/kindling/store.ts`        | 140   | Caching layer (unused)                             |
| `src/types/callgraph.ts`       | 108   | L2 types                                           |
| `src/ignore/index.ts`          | 94    | `.distilignore` support                            |
| `src/extractors.ts`            | 84    | High-level extractor functions                     |
| `src/kindling/observations.ts` | 83    | Observation serialization                          |
| `src/types/common.ts`          | 78    | Shared types                                       |
| `src/parsers/base.ts`          | 73    | `LanguageParser` interface, registry               |
| `src/kindling/types.ts`        | 62    | Caching types                                      |
| `src/ignore/patterns.ts`       | 42    | Built-in ignore patterns                           |
| `src/kindling/config.ts`       | 35    | Store configuration                                |
| `src/parsers/index.ts`         | 27    | Parser registry bootstrap                          |
| `src/types/index.ts`           | 20    | Type barrel file                                   |

### @distil/cli — Source Files

| File                      | Lines | Purpose                      |
| ------------------------- | ----- | ---------------------------- |
| `src/index.ts`            | 907   | Main CLI + 5 inline commands |
| `src/commands/tree.ts`    | 151   | Tree command (extracted)     |
| `src/commands/extract.ts` | 117   | Extract command (extracted)  |
| `src/ignore.ts`           | 22    | CLI ignore option resolver   |
| `src/commands/mcp.ts`     | 9     | MCP launcher command         |

### @distil/mcp — Source Files

| File            | Lines | Purpose                          |
| --------------- | ----- | -------------------------------- |
| `src/server.ts` | 468   | MCP server (6 tools + 3 prompts) |
| `src/index.ts`  | ~5    | Entry point                      |

### Test Files

| File                                  | Tests | Focus                           |
| ------------------------------------- | ----- | ------------------------------- |
| `core/src/parsers/typescript.test.ts` | 23    | L1-L5 analysis, content hashing |
| `mcp/src/server.test.ts`              | 13    | MCP protocol compliance         |
| `cli/src/index.test.ts`               | 3     | `.distilignore` integration     |

### Contributors

| Author         | Commits |
| -------------- | ------- |
| aneki (Joshua) | 25      |
| Josh Boys      | 15      |
| Claude         | 5       |
