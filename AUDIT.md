# Distil Project Usability Audit

**Date:** 2026-02-07
**Scope:** Full codebase walk — build, tests, type safety, CLI end-to-end, parser correctness

> **Note:** This audit is a historical snapshot of the codebase as of 2026-02-07, when the repo had 19 tests. Several findings have since been addressed on `dev`; those are annotated inline with "Update (2026-10-20)". As of 2026-10-20, `pnpm test` runs 118 tests (68 core, 32 CLI, 18 MCP).

---

## Executive Summary

At the time of the audit, Distil **built, typechecked, linted, and passed all 19 tests cleanly**. The core L1 extraction and CLI commands are functional for basic TypeScript analysis. However, several gaps significantly limit real-world usability:

| Area              | Verdict                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Build & tooling   | **Works** — clean build, typecheck, lint                                                                              |
| L1 AST extraction | **Partially usable** — misses arrow functions, destructured params, re-exports                                        |
| L2 Call graph     | **Works** for simple cases                                                                                            |
| L3-L5 CFG/DFG/PDG | **Works** for simple functions; analysis is approximate                                                               |
| CLI UX            | **Functional** but has misleading help text and missing validation                                                    |
| Test coverage     | **Insufficient** — 21 tests for core, 0 for CLI at audit time (CLI now has unit and mocked command tests, but no E2E) |
| Python/Rust/C#    | **Not usable** — listed as supported but no parsers implemented                                                       |

**Bottom line:** Usable as a prototype for TypeScript/JavaScript L1 extraction. Not production-ready due to missing arrow function support (the dominant function form in modern TS/JS) and thin test coverage.

---

## 1. Build & Tooling — PASS

```
pnpm install   ✓  (13.7s, no warnings)
pnpm build     ✓  (clean, both packages)
pnpm typecheck ✓  (zero errors)
pnpm lint      ✓  (zero warnings)
pnpm test      ✓  (19/19 pass, 1.26s)
```

The monorepo setup (pnpm workspaces, TypeScript project references, composite builds) is well-configured. Strict TypeScript settings (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) are properly enforced.

---

## 2. L1 AST Extraction — PARTIALLY USABLE

### What works

- Function declarations (regular, async, generator) with signatures
- Class declarations with methods (constructor, public, async)
- Import parsing (named, namespace, type-only, dynamic)
- Export parsing (named, default)
- Interface and type alias extraction
- Variable declarations
- Docstring extraction (first comment in file)
- Three output formats: human-readable, JSON, compact

### Critical gaps

#### 2a. Arrow functions are not extracted

`tryParseArrowFunction()` at `packages/distil-core/src/parsers/typescript.ts:840` is a stub that always returns `null`. Arrow functions assigned to variables are the **dominant pattern** in modern TypeScript:

```typescript
// None of these are extracted as functions:
export const handler = async (req, res) => { ... };
const add = (a: number, b: number) => a + b;
const Component: React.FC = () => <div />;
```

They appear only as variables (no params, no return type, no body analysis). This is the single biggest usability gap — in a typical React or Express codebase, the majority of functions will be invisible to distil.

#### 2b. Destructured parameters are lost

```typescript
// Input:
export function processUser({ name, age }: { name: string; age: number }) { ... }

// Output: params: [] (empty)
// Expected: params showing name and age
```

The parser doesn't handle `object_pattern` or `array_pattern` in parameter positions.

#### 2c. Interface members are not extracted

```typescript
interface UserService {
  getUser(id: string): Promise<User>;
  createUser(data: CreateUserDto): Promise<User>;
}
// Output: methods: [], properties: []
```

Interface method signatures and property declarations are empty in the JSON output.

**Update (2026-10-20):** Interface method and property signatures are now extracted (`parseInterfaceBody()`, `parseMethodSignature()` and `parsePropertySignature()` in `packages/distil-core/src/parsers/typescript.ts`), and `typescript.test.ts` asserts extends clauses, method signatures and readonly/optional properties. Index signatures, call/construct signatures and computed member names are still skipped.

#### 2d. Re-exports and type exports at file end are not captured

```typescript
export { UserController }; // not captured
export type { UserService, Result }; // not captured
export default handler; // not captured (when separate from declaration)
```

Only inline `export` on declarations is recognized.

#### 2e. Compact output drops critical information

The `--compact` format (designed for LLM consumption) omits:

- Interfaces
- Type aliases
- Variables
- Exports
- Import details

This defeats the stated purpose of providing "everything needed to understand and edit code."

---

## 3. L2 Call Graph — WORKS (with caveats)

The `calls` command successfully builds a project-wide call graph:

```
Call Graph: 100 functions, 181 edges, 13 files
```

The `impact` command performs transitive caller analysis with fuzzy function name matching.

**Issues:**

- Dynamic/indirect calls are detected but unresolved (marked `isDynamic: true` with null callee)
- Callback detection is not implemented (call type never set to "callback")
- O(n²) resolution algorithm — may be slow on large codebases
- Same file is parsed multiple times (no AST caching across extraction layers)

---

## 4. L3-L5 CFG/DFG/PDG — WORKS (approximate)

All three analysis layers produce output for the tested functions.

**CFG (L3):** Correctly identifies basic blocks, branches, loops, back edges, and switch cases. Cyclomatic complexity is calculated. Try-catch modeling is incomplete — exception flow edges are not fully represented.

**DFG (L4):** Tracks variable definitions and uses with def-use chains. However, reaching definitions use a **line-number heuristic** rather than proper dataflow analysis — a definition at line 5 is assumed to reach any use at line > 5, ignoring control flow branches. `DFGInfo.reachingDefs` and `DFGInfo.liveVars` are always returned as empty maps by `DFGBuilder.getDFG()` (reaching-definitions and liveness analysis are not implemented).

**PDG (L5):** Combines CFG and DFG into program dependence graph. Backward and forward slicing works for simple cases. Control dependence only considers direct successors of predicates, not proper post-dominance.

---

## 5. CLI Usability

### What works well

- Help text with quick-start examples
- Clear error messages for unsupported file types (lists all supported extensions)
- JSON output for all commands
- Fuzzy function name matching in `impact`, `cfg`, `dfg`, `slice` commands
- Tree command with smart filtering (ignores node_modules, dist, etc.)

### Issues

#### 5a. Misleading help text

The comment block at the top of `packages/distil-cli/src/index.ts:2-19` references commands that don't exist: `structure`, `context`, `warm`, `semantic`. The quick-start section references `distil structure` which is not a real command.

#### 5b. Code organization

At the time of the audit, `index.ts` was 858 lines. Only `extract` and `tree` were in separate command files; `calls`, `impact`, `cfg`, `dfg`, and `slice` were defined inline, and the fuzzy function matching logic was copy-pasted across 4 commands.

**Update (2026-10-20):** Resolved. Each command now lives in its own module under `packages/distil-cli/src/commands/`, fuzzy matching is shared via `fuzzyMatchFunction` in `src/commands/helpers.ts`, and `src/index.ts` is ~90 lines.

#### 5c. Python/Rust/C# are misleadingly listed

When a user runs `distil extract foo.py`, the error says "Unsupported file type" but then lists `.py` as a supported extension. The grammar packages are optional dependencies but no parser classes exist for these languages.

#### 5d. No input validation

- No file-existence check before `readFile` — raw ENOENT errors bubble up
- No bounds checking on `--limit` and `--depth` options
- No validation that `--var` option for slice command is a real variable

#### 5e. Zero CLI tests

At the time of the audit, the CLI package had `passWithNoTests: true` in its vitest config and contained no test files.

**Update (2026-10-20):** The CLI now has four Vitest files (`src/commands/commands.test.ts`, `src/config/config.test.ts`, `src/format/format.test.ts`, `src/index.test.ts`; 32 tests) covering mocked command parsing for `extract`, `tree`, `calls`, `impact`, `cfg`, `dfg` and `slice`, config loading, output formatting and `.distilignore` wiring. Remaining gaps: no end-to-end runs of the built binary, limited error-path and edge-case coverage, no coverage thresholds, and `passWithNoTests: true` is still set.

---

## 6. Test Coverage — INSUFFICIENT

### Core package: 1 test file, 21 tests

| Feature          | Tests | Assessment                                              |
| ---------------- | ----- | ------------------------------------------------------- |
| `canHandle()`    | 3     | Adequate                                                |
| `extractAST()`   | 5     | Misses arrow fns, destructuring, interfaces, re-exports |
| `extractCalls()` | 1     | Single basic test                                       |
| `extractCFG()`   | 4     | Covers if/loop/class; misses try-catch, switch, async   |
| `extractDFG()`   | 3     | Basic coverage                                          |
| `extractPDG()`   | 5     | Slicing tested                                          |

**Not tested at all:**

- Error cases (malformed code, missing functions, parser init failure)
- Arrow functions, destructuring, generators
- Nested functions, closures
- Complex control flow (try-catch-finally, do-while, break/continue)
- Variable shadowing, closure captures
- Empty files, comments-only files

**Weak assertions:** Many tests use `.toBeGreaterThan(0)` instead of checking specific values — tests pass even if output is wrong as long as _something_ is returned.

### CLI package: 0 tests

No test coverage at all at the time of the audit. See the update under 5e for the current state.

---

## 7. Architecture & Code Quality

### Strengths

- Clean monorepo structure with proper TypeScript project references
- Strict TypeScript config catches real issues at compile time
- Parser interface (`LanguageParser`) is well-designed for multi-language support
- Type system for all 5 analysis layers is thoughtfully defined
- Pre-commit hooks enforce formatting and linting

### Concerns

- **No parser caching:** Each `extract*` method re-parses the source from scratch. Running `cfg` on a function parses the entire file again even if `extractAST` just parsed it.
- **Tree-sitter string matching:** Node type detection uses string literals (`"function_declaration"`, `"property_identifier"`) throughout — fragile across grammar versions.
- **Lazy init race condition:** `initTreeSitter()` has no mutex; concurrent calls could double-initialize.
- **`BUILTIN_METHODS` hardcoded in CLI:** 200+ lines of built-in method names were embedded in `index.ts` instead of a data file. **Update (2026-10-20):** Resolved — built-in method detection is centralised in core; the CLI imports `isBuiltinMethod` from `@distil/core` (see `src/commands/calls.ts`).

---

## 8. Recommendations (prioritized)

### Must-fix for basic usability

1. **Implement arrow function extraction** — Without this, the tool misses the majority of functions in modern TS/JS codebases
2. **Fix destructured parameter parsing** — Common pattern, currently produces empty param lists
3. ~~**Extract interface members** — Interfaces show as empty shells~~ (done since the audit)
4. **Fix compact output** — Include interfaces, types, exports, and variables
5. **Remove or disable Python/Rust/C# from supported extensions list** — Currently misleading

### Should-fix for reliability

6. Expand CLI tests (initial tests now exist; add E2E and error cases)
7. Strengthen core tests with specific assertions and edge cases
8. Add file-existence validation before read operations
9. ~~Extract duplicated fuzzy-matching into shared utility~~ (done since the audit)
10. Cache parsed ASTs across extraction layers

### Nice-to-have for polish

11. ~~Modularise remaining inline CLI commands~~ (done since the audit)
12. Remove references to nonexistent commands from help text
13. Add `--verbose` flag for debugging
14. Add coverage reporting with thresholds
