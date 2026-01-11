/**
 * @edda-tldr/core
 *
 * Token-efficient code analysis for LLMs.
 *
 * Provides 5 layers of analysis:
 * - L1: AST (functions, classes, imports)
 * - L2: Call Graph (forward/backward edges)
 * - L3: CFG (control flow, complexity)
 * - L4: DFG (data flow, def-use chains)
 * - L5: PDG (program dependence, slicing)
 *
 * @example
 * ```typescript
 * import { extractFile, buildCallGraph, getSlice } from '@edda-tldr/core';
 *
 * // L1: Extract file structure
 * const moduleInfo = await extractFile('src/auth.ts');
 *
 * // L2: Build project call graph
 * const callGraph = await buildCallGraph('./src');
 *
 * // L5: Get program slice
 * const slice = await getSlice('src/auth.ts', 'login', 42);
 * ```
 */

// Type exports
export * from './types/index.js';

// Parser exports
export { getParser, type LanguageParser } from './parsers/index.js';

// Extractor exports (to be implemented)
// export { extractFile } from './extractors/ast/index.js';
// export { buildCallGraph, getImpact } from './extractors/callgraph/index.js';
// export { extractCFG } from './extractors/cfg/index.js';
// export { extractDFG } from './extractors/dfg/index.js';
// export { extractPDG, getSlice } from './extractors/pdg/index.js';

// API exports (to be implemented)
// export { getRelevantContext } from './api/context.js';

// Kindling integration (to be implemented)
// export { TLDRStore } from './kindling/store.js';

// Version
export const VERSION = '0.1.0';
