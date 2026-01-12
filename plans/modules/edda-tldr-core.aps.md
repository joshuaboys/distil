# @edda-tldr/core

| Scope | Owner | Priority | Status |
|-------|-------|----------|--------|
| CORE | @aneki | high | In Progress |

## Purpose

Provides the 5-layer code analysis engine (AST, Call Graph, CFG, DFG, PDG) with multi-language support via tree-sitter. Integrates with Kindling for caching and persistence of analysis results.

This is the analytical spine of TLDR. It extracts structure from code and produces token-efficient representations for LLM consumption.

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

- CLI commands (edda-tldr-cli)
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
- [ ] L2: Build project-wide call graph with forward/backward edges
- [ ] L3: Extract CFG with basic blocks and cyclomatic complexity
- [ ] L4: Extract DFG with variable definitions and uses
- [ ] L5: Compute program slices (backward and forward)
- [ ] Kindling integration caches all analysis results
- [ ] Dirty detection via content hashes avoids redundant analysis
- [ ] Context output reduces tokens by 80%+ vs raw code

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Tree-sitter Node.js bindings instability | Pin versions; test on multiple Node versions |
| CFG/DFG complexity for edge cases | Start with common patterns; iterate based on real usage |
| Kindling schema changes | Use versioned metadata; coordinate releases |

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

### CORE-004: L2 Call graph extractor

- **Intent:** Build cross-file call relationships for impact analysis
- **Expected Outcome:** `buildCallGraph()` returns forward and backward edges; `getImpact()` finds all callers
- **Scope:** `src/extractors/callgraph/`
- **Non-scope:** CFG, DFG, PDG
- **Files:** `src/extractors/callgraph/index.ts`, `src/extractors/callgraph/typescript.ts`
- **Dependencies:** CORE-001, CORE-003
- **Validation:** `pnpm test -- callgraph`
- **Confidence:** medium
- **Risks:** Import resolution complexity; dynamic calls

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

2. **TLDR Metadata Schema:**
   ```typescript
   interface TLDRObservationMeta {
     producer: 'tldr';
     subkind: string;  // e.g., 'tldr.ast.function'
     language: Language;
     schemaVersion: '1';
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

### CORE-006: L3 CFG extractor

- **Intent:** Extract control flow graphs with complexity metrics
- **Expected Outcome:** `extractCFG()` returns basic blocks, edges, and cyclomatic complexity
- **Scope:** `src/extractors/cfg/`
- **Non-scope:** DFG, PDG
- **Files:** `src/extractors/cfg/index.ts`, `src/extractors/cfg/typescript.ts`
- **Dependencies:** CORE-001, CORE-002
- **Validation:** `pnpm test -- cfg`
- **Confidence:** medium
- **Risks:** Complex control flow patterns (try/catch, async/await)

### CORE-007: L4 DFG extractor

- **Intent:** Track variable definitions and uses for data flow analysis
- **Expected Outcome:** `extractDFG()` returns variable refs and def-use chains
- **Scope:** `src/extractors/dfg/`
- **Non-scope:** PDG, slicing
- **Files:** `src/extractors/dfg/index.ts`, `src/extractors/dfg/typescript.ts`
- **Dependencies:** CORE-001, CORE-002
- **Validation:** `pnpm test -- dfg`
- **Confidence:** medium
- **Risks:** Scope analysis complexity; destructuring patterns

### CORE-008: L5 PDG extractor and slicing

- **Intent:** Combine control and data dependencies for program slicing
- **Expected Outcome:** `extractPDG()` returns unified dependence graph; `getSlice()` computes backward/forward slices
- **Scope:** `src/extractors/pdg/`
- **Non-scope:** (none)
- **Files:** `src/extractors/pdg/index.ts`, `src/extractors/pdg/typescript.ts`
- **Dependencies:** CORE-006, CORE-007
- **Validation:** `pnpm test -- pdg`
- **Confidence:** medium
- **Risks:** Slicing precision for complex functions

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

## Decisions

- **D-001:** Tree-sitter is the parsing foundation; no fallback to regex or other parsers
- **D-002:** All analysis results are JSON-serializable for Kindling storage
- **D-003:** Content hashes (SHA-256) are used for dirty detection
- **D-004:** Higher layers (CFG, DFG, PDG) are computed on-demand, not eagerly

## Notes

- Start with TypeScript/JavaScript. Other languages follow the same parser interface.
- Keep extractors modular—each layer should be independently testable.
- Kindling integration is critical for performance; avoid redundant parsing.
