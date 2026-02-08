# @distil/core

| Scope | Owner  | Priority | Status      |
| ----- | ------ | -------- | ----------- |
| CORE  | @aneki | high     | In Progress |

## Purpose

Provides the 5-layer code analysis engine (AST, Call Graph, CFG, DFG, PDG) with multi-language support via tree-sitter. Integrates with Kindling for caching and persistence of analysis results.

This is the analytical spine of Distil. It extracts structure from code and produces token-efficient representations for LLM consumption.

## In Scope

- L1: AST extraction (functions, classes, imports, signatures, docstrings)
- L2: Call graph construction (forward and backward edges, cross-file)
- L3: Control flow graph extraction (basic blocks, edges, cyclomatic complexity)
- L4: Data flow graph extraction (variable definitions, uses, def-use chains)
- L5: Program dependence graph (control + data dependencies, slicing)
- Language parser abstraction (tree-sitter based)
- Kindling integration for caching analysis results
- LLM-ready context generation

## Out of Scope

- CLI commands (distil-cli)
- Semantic search / embeddings (future milestone)
- Language-specific IDE features
- Real-time incremental parsing

## Interfaces

**Depends on:**

- @kindling/core — observation types, service orchestration
- @kindling/store-sqlite — persistence layer
- tree-sitter — parsing foundation
- tree-sitter-typescript — TS/JS grammar

**Exposes:**

- `extractFile()` — L1 AST extraction for a file
- `buildCallGraph()` — L2 cross-file call graph
- `getImpact()` — L2 reverse call graph (who calls this?)
- `extractCFG()` — L3 control flow graph for a function
- `extractDFG()` — L4 data flow graph for a function
- `extractPDG()` — L5 program dependence graph
- `getSlice()` — L5 backward/forward program slice
- `getRelevantContext()` — unified LLM-ready context

## Boundary Rules

- CORE must not depend on CLI
- CORE must use Kindling for all persistence (no custom file caching)
- Language parsers must implement a common interface for extensibility
- Analysis results must be JSON-serializable for Kindling storage

## Acceptance Criteria

- [x] L1: Extract functions, classes, imports from TS/JS files
- [x] L2: Build project-wide call graph with forward/backward edges
- [x] L3: Extract CFG with basic blocks and cyclomatic complexity
- [x] L4: Extract DFG with variable definitions and uses
- [x] L5: Compute program slices (backward and forward)
- [ ] Kindling integration caches all analysis results
- [ ] Dirty detection via content hashes avoids redundant analysis
- [ ] Context output reduces tokens by 80%+ vs raw code

## Risks & Mitigations

| Risk                                     | Mitigation                                              |
| ---------------------------------------- | ------------------------------------------------------- |
| Tree-sitter Node.js bindings instability | Pin versions; test on multiple Node versions            |
| CFG/DFG complexity for edge cases        | Start with common patterns; iterate based on real usage |
| Kindling schema changes                  | Use versioned metadata; coordinate releases             |

## Tasks

### CORE-001: Define core types and interfaces ✅

- **Status:** Complete
- **Intent:** Establish stable type definitions for all analysis layers
- **Expected Outcome:** FunctionInfo, ClassInfo, ModuleInfo, CallGraphInfo, CFGInfo, DFGInfo, PDGInfo types compile and validate
- **Scope:** `src/types/`
- **Non-scope:** Implementation logic, Kindling integration
- **Files:** `src/types/index.ts`, `src/types/ast.ts`, `src/types/callgraph.ts`, `src/types/cfg.ts`, `src/types/dfg.ts`, `src/types/pdg.ts`
- **Dependencies:** (none)
- **Validation:** `pnpm test -- types`
- **Confidence:** high
- **Risks:** Type changes after M1 require migrations
- **Completed:** All types defined and compiling

### CORE-002: Tree-sitter TypeScript parser setup ✅

- **Status:** Complete
- **Intent:** Establish parsing foundation for TypeScript/JavaScript
- **Expected Outcome:** Parser loads TS/JS grammars; can parse source to tree-sitter AST
- **Scope:** `src/parsers/`
- **Non-scope:** AST extraction logic, other languages
- **Files:** `src/parsers/base.ts`, `src/parsers/typescript.ts`, `src/parsers/index.ts`
- **Dependencies:** CORE-001
- **Validation:** `pnpm test -- parsers`
- **Confidence:** high
- **Risks:** Tree-sitter WASM vs native bindings complexity
- **Completed:** TypeScript parser working with native bindings, 9 tests passing

### CORE-003: L1 AST extractor ✅

- **Status:** Complete
- **Intent:** Extract functions, classes, imports, and signatures from source files
- **Expected Outcome:** `extractFile()` returns complete ModuleInfo with all declarations
- **Scope:** `src/parsers/typescript.ts` (integrated with parser)
- **Non-scope:** Call graph, CFG, DFG, PDG
- **Files:** `src/parsers/typescript.ts`
- **Dependencies:** CORE-001, CORE-002
- **Validation:** `pnpm test -- parsers`
- **Confidence:** high
- **Risks:** Complex TypeScript syntax edge cases
- **Completed:** Extracts functions, classes, methods, imports, exports, parameters, types

### CORE-004: L2 Call graph extractor ✅

- **Status:** Complete
- **Intent:** Build cross-file call relationships for impact analysis
- **Expected Outcome:** `buildCallGraph()` returns forward and backward edges; `getImpact()` finds all callers
- **Scope:** `src/callgraph/`
- **Non-scope:** CFG, DFG, PDG
- **Files:** `src/callgraph/index.ts`, `src/callgraph/types.ts`
- **Dependencies:** CORE-001, CORE-003
- **Validation:** `pnpm test`
- **Confidence:** high
- **Risks:** Import resolution complexity; dynamic calls
- **Completed:** Cross-file call graph with forward/backward indexes, impact analysis via CLI

### CORE-005: Kindling integration layer 🔄

- **Status:** Planned
- **Intent:** Cache analysis results in Kindling for fast retrieval
- **Expected Outcome:** Analysis results stored as Kindling observations; dirty detection via content hashes
- **Scope:** `src/kindling/`
- **Non-scope:** Kindling core implementation
- **Files:** `src/kindling/store.ts`, `src/kindling/observations.ts`, `src/kindling/config.ts`
- **Dependencies:** CORE-001, CORE-003, CORE-004
- **Validation:** `pnpm test -- kindling`
- **Confidence:** medium
- **Risks:** Kindling API stability during early development

**Implementation Details:**

1. **Observation Kinds** (to be added to @kindling/core):
   - `code.symbol` — Functions, classes, variables
   - `code.reference` — Imports, usages
   - `code.callgraph` — Call relationships
   - `code.flow.control` — CFG blocks/edges
   - `code.flow.data` — DFG defs/uses
   - `code.dependence` — PDG edges, slices
   - `analysis.metric` — Complexity, coverage

2. **Distil Metadata Schema:**

   ```typescript
   interface DistilObservationMeta {
     producer: "tldr";
     subkind: string; // e.g., 'tldr.ast.function'
     language: Language;
     schemaVersion: "1";
     payload: unknown;
   }
   ```

3. **Capsule Strategy:**
   - One capsule per project analysis session
   - Auto-close on CLI exit or explicit `tldr warm` completion

4. **Cache Invalidation:**
   - Content hash (SHA-256) stored per file
   - Re-analyze only when hash changes
   - Cascading invalidation for call graph edges

### CORE-006: L3 CFG extractor ✅

- **Status:** Complete
- **Intent:** Extract control flow graphs with complexity metrics
- **Expected Outcome:** `extractCFG()` returns basic blocks, edges, and cyclomatic complexity
- **Scope:** `src/parsers/typescript.ts` (CFGBuilder class)
- **Non-scope:** DFG, PDG
- **Files:** `src/parsers/typescript.ts`, `src/types/cfg.ts`
- **Dependencies:** CORE-001, CORE-002
- **Validation:** `pnpm test`
- **Confidence:** high
- **Completed:** CFG extraction with if/else, loops, switch, try/catch, cyclomatic complexity

### CORE-007: L4 DFG extractor ✅

- **Status:** Complete
- **Intent:** Track variable definitions and uses for data flow analysis
- **Expected Outcome:** `extractDFG()` returns variable refs and def-use chains
- **Scope:** `src/parsers/typescript.ts` (DFGBuilder class)
- **Non-scope:** PDG, slicing
- **Files:** `src/parsers/typescript.ts`, `src/types/dfg.ts`
- **Dependencies:** CORE-001, CORE-002
- **Validation:** `pnpm test`
- **Confidence:** high
- **Completed:** DFG extraction with parameters, definitions, uses, updates, closures

### CORE-008: L5 PDG extractor and slicing ✅

- **Status:** Complete
- **Intent:** Combine control and data dependencies for program slicing
- **Expected Outcome:** `extractPDG()` returns unified dependence graph; `backwardSlice()`/`forwardSlice()` compute slices
- **Scope:** `src/parsers/typescript.ts`, `src/types/pdg.ts`
- **Non-scope:** (none)
- **Files:** `src/parsers/typescript.ts`, `src/types/pdg.ts`, `src/extractors.ts`
- **Dependencies:** CORE-006, CORE-007
- **Validation:** `pnpm test`
- **Confidence:** high
- **Completed:** PDG combines CFG+DFG, backward/forward slicing implemented

### CORE-009: Context generation API

- **Intent:** Provide unified LLM-ready context from all analysis layers
- **Expected Outcome:** `getRelevantContext()` traverses call graph and returns token-efficient summaries
- **Scope:** `src/api/`
- **Non-scope:** CLI formatting
- **Files:** `src/api/context.ts`, `src/api/index.ts`
- **Dependencies:** CORE-003, CORE-004, CORE-006, CORE-007, CORE-008
- **Validation:** `pnpm test -- api`
- **Confidence:** high
- **Risks:** Token budget tuning

### CORE-010: .distilignore support

- **Status:** Planned
- **Intent:** Allow projects to exclude files/directories from analysis via ignore patterns
- **Expected Outcome:** `.distilignore` file in project root is respected by all analysis commands; supports glob patterns like `.gitignore`
- **Scope:** `src/ignore/`
- **Non-scope:** CLI flag parsing (handled by CLI)
- **Files:** `src/ignore/index.ts`, `src/ignore/patterns.ts`
- **Dependencies:** (none)
- **Validation:** `pnpm test -- ignore`
- **Confidence:** high
- **Risks:** None significant

**Implementation Details:**

1. **File format:** Same syntax as `.gitignore` (glob patterns, `#` comments, `!` negation)
2. **Lookup:** Walk up from analysis target to find nearest `.distilignore`
3. **Built-in ignores:** Merge with existing `IGNORE_DIRS`/`IGNORE_FILES` sets
4. **Integration points:**
   - `collectSourceFiles()` in `index.ts` — filter file collection
   - `buildCallGraph()` — respect ignores during graph construction
   - Tree command — respect ignores in directory walking

### CORE-011: Monorepo support

- **Status:** Planned
- **Intent:** Enable per-package analysis with cross-package call graph resolution
- **Expected Outcome:** Distil detects monorepo structure (pnpm-workspace.yaml, package.json workspaces) and can analyze individual packages or the full workspace
- **Scope:** `src/workspace/`
- **Non-scope:** IDE integration, package manager operations
- **Files:** `src/workspace/detect.ts`, `src/workspace/resolver.ts`, `src/workspace/index.ts`
- **Dependencies:** CORE-004
- **Validation:** `pnpm test -- workspace`
- **Confidence:** medium
- **Risks:** Cross-package import resolution complexity

**Implementation Details:**

1. **Workspace detection:**
   - Detect `pnpm-workspace.yaml`, `package.json` workspaces, `lerna.json`
   - Build package map: name -> root path
2. **Cross-package resolution:**
   - Resolve `import { foo } from '@myorg/utils'` to actual file paths
   - Use package.json `exports`/`main` fields for entry point resolution
3. **Scoped analysis:**
   - `--package <name>` flag to scope analysis to a single package
   - Default: analyze from current working directory's nearest package root
4. **Call graph:**
   - Cross-package edges marked with `crossPackage: true`
   - Package boundary shown in impact analysis output

### CORE-012: Semantic search backend

- **Status:** Planned
- **Intent:** Provide embedding-based search over function behaviors and documentation
- **Expected Outcome:** Functions can be indexed by their behavior (signatures, docstrings, body summaries) and queried with natural language
- **Scope:** `src/semantic/`
- **Non-scope:** CLI command (handled by CLI), embedding model implementation
- **Files:** `src/semantic/index.ts`, `src/semantic/embeddings.ts`, `src/semantic/store.ts`
- **Dependencies:** CORE-003, CORE-005
- **Validation:** `pnpm test -- semantic`
- **Confidence:** medium
- **Risks:** API key management; embedding quality; cost

**Implementation Details:**

1. **Embedding provider abstraction:**
   ```typescript
   interface EmbeddingProvider {
     embed(texts: string[]): Promise<number[][]>;
     model: string;
     dimensions: number;
   }
   ```
2. **Providers:** OpenAI (text-embedding-3-small), Anthropic (when available)
3. **Indexing strategy:**
   - Per-function: concatenate signature + docstring + body summary
   - Store embeddings in Kindling alongside analysis observations
   - Re-embed only when function content hash changes
4. **Search:**
   - Embed query text
   - Cosine similarity against stored embeddings
   - Return ranked list of functions with scores
5. **Storage:**
   - Embeddings stored in Kindling SQLite (BLOB column)
   - FTS5 index for keyword fallback when no API key configured

### CORE-013: Index warming

- **Status:** Planned
- **Intent:** Pre-build all analysis layers for a project so queries are fast
- **Expected Outcome:** `warm()` function analyzes entire project, stores results in Kindling, reports progress
- **Scope:** `src/warm/`
- **Non-scope:** CLI progress display
- **Files:** `src/warm/index.ts`
- **Dependencies:** CORE-003, CORE-004, CORE-005, CORE-006, CORE-007, CORE-008
- **Validation:** `pnpm test -- warm`
- **Confidence:** high
- **Risks:** Memory usage for large projects

**Implementation Details:**

1. **Warming stages:**
   - Stage 1: Collect files, compute content hashes
   - Stage 2: L1 AST extraction for all files
   - Stage 3: L2 call graph construction
   - Stage 4: L3-L5 extraction for all functions
   - Stage 5: Semantic embeddings (if API key configured)
2. **Progress callback:**
   ```typescript
   interface WarmProgress {
     stage: string;
     current: number;
     total: number;
     file?: string;
   }
   type ProgressCallback = (progress: WarmProgress) => void;
   ```
3. **Incremental warming:** Skip files whose content hash hasn't changed
4. **Concurrency:** Process files in parallel (bounded by available memory)

## Decisions

- **CORE-D-001:** Tree-sitter is the parsing foundation; no fallback to regex or other parsers
- **CORE-D-002:** All analysis results are JSON-serializable for Kindling storage
- **CORE-D-003:** Content hashes (SHA-256) are used for dirty detection
- **CORE-D-004:** Higher layers (CFG, DFG, PDG) are computed on-demand, not eagerly
- **CORE-D-005:** `.distilignore` uses `.gitignore` syntax for familiarity
- **CORE-D-006:** Semantic search uses external embedding APIs; no local models
- **CORE-D-007:** Monorepo detection is automatic; explicit `--package` flag for scoping

## Notes

- Start with TypeScript/JavaScript. Other languages follow the same parser interface.
- Keep extractors modular—each layer should be independently testable.
- Kindling integration is critical for performance; avoid redundant parsing.
- `.distilignore` should be checked in to version control (like `.gitignore`).
