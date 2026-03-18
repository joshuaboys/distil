/**
 * Context generation API (CORE-009)
 *
 * Provides `getRelevantContext()` — a unified API that traverses
 * the call graph and returns an LLM-ready summary combining
 * analysis layers L1-L4.
 */

import { readFile } from "fs/promises";
import { resolve } from "path";
import { buildCallGraph } from "../index.js";
import { extractCFG, extractDFG } from "../extractors.js";
import { getParser } from "../parsers/index.js";
import { getComplexityRating } from "../types/cfg.js";
import type { ProjectCallGraph, FunctionLocation, CallEdge } from "../types/callgraph.js";
import type { FunctionInfo } from "../types/ast.js";

export interface ContextOptions {
  /** Max call graph traversal depth (default: 2) */
  depth?: number;
  /** Include CFG complexity info (default: true) */
  includeCFG?: boolean;
  /** Include DFG data flow info (default: true) */
  includeDFG?: boolean;
  /** Include PDG slice info (default: false, expensive) */
  includePDG?: boolean;
  /** Max functions to include (default: 20) */
  maxFunctions?: number;
}

export interface FunctionContext {
  name: string;
  qualifiedName: string;
  file: string;
  line: number;
  signature: string;
  params: Array<{ name: string; type?: string | undefined }>;
  returnType?: string | undefined;
  isExported: boolean;
  /** Cyclomatic complexity (if includeCFG) */
  complexity?: number | undefined;
  complexityRating?: string | undefined;
  /** Variables and data flow (if includeDFG) */
  variables?: string[] | undefined;
  /** Direct callers */
  callers: string[];
  /** Direct callees */
  callees: string[];
}

export interface RelevantContext {
  target: FunctionContext;
  related: FunctionContext[];
  summary: {
    totalFunctions: number;
    totalFiles: number;
    maxComplexity: number;
  };
}

/**
 * Get relevant context for a function by traversing the call graph
 * and enriching with analysis from multiple layers.
 */
export async function getRelevantContext(
  projectRoot: string,
  functionName: string,
  options: ContextOptions = {},
): Promise<RelevantContext> {
  const {
    depth = 2,
    includeCFG = true,
    includeDFG = true,
    maxFunctions = 20,
  } = options;

  const rootPath = resolve(projectRoot);
  const graph = await buildCallGraph(rootPath);

  const targetLocation = findFunction(graph, functionName);
  if (!targetLocation) {
    throw new Error(`Function not found: ${functionName}`);
  }

  // Collect related functions via BFS traversal
  const relatedLocations = traverseGraph(graph, targetLocation.qualifiedName, depth, maxFunctions);

  // Build context for target
  const targetContext = await buildFunctionContext(
    graph,
    targetLocation,
    includeCFG,
    includeDFG,
  );

  // Build context for related functions
  const related: FunctionContext[] = [];
  for (const loc of relatedLocations) {
    if (related.length >= maxFunctions - 1) break;
    const ctx = await buildFunctionContext(graph, loc, includeCFG, includeDFG);
    related.push(ctx);
  }

  // Compute summary
  const allContexts = [targetContext, ...related];
  const files = new Set(allContexts.map((c) => c.file));
  const maxComplexity = Math.max(
    ...allContexts.map((c) => c.complexity ?? 1),
  );

  return {
    target: targetContext,
    related,
    summary: {
      totalFunctions: allContexts.length,
      totalFiles: files.size,
      maxComplexity,
    },
  };
}

/**
 * Find a function in the call graph by name (fuzzy match).
 * Tries exact qualified name first, then simple name match,
 * then suffix match.
 */
function findFunction(
  graph: ProjectCallGraph,
  name: string,
): FunctionLocation | null {
  // Exact qualified name match
  const exact = graph.functions.get(name);
  if (exact) return exact;

  // Simple name match (last segment)
  const candidates: FunctionLocation[] = [];
  for (const [qualifiedName, loc] of graph.functions) {
    if (loc.name === name) {
      candidates.push(loc);
    } else if (qualifiedName.endsWith(`.${name}`)) {
      candidates.push(loc);
    }
  }

  if (candidates.length === 1) return candidates[0] ?? null;

  // If multiple matches, prefer exported functions
  if (candidates.length > 1) {
    const exported = candidates.filter((c) => c.isExported);
    if (exported.length === 1) return exported[0] ?? null;
    // Return first match if no unique resolution
    return candidates[0] ?? null;
  }

  return null;
}

/**
 * BFS traversal of call graph in both directions.
 */
function traverseGraph(
  graph: ProjectCallGraph,
  startQualifiedName: string,
  maxDepth: number,
  maxFunctions: number,
): FunctionLocation[] {
  const visited = new Set<string>([startQualifiedName]);
  const result: FunctionLocation[] = [];
  let frontier = [startQualifiedName];

  for (let d = 0; d < maxDepth && frontier.length > 0; d++) {
    const nextFrontier: string[] = [];

    for (const qn of frontier) {
      // Forward edges (callees)
      const forwardEdges = graph.forwardIndex.get(qn) ?? [];
      for (const edge of forwardEdges) {
        if (edge.calleeLocation && !visited.has(edge.calleeLocation.qualifiedName)) {
          visited.add(edge.calleeLocation.qualifiedName);
          result.push(edge.calleeLocation);
          nextFrontier.push(edge.calleeLocation.qualifiedName);
          if (result.length >= maxFunctions) return result;
        }
      }

      // Backward edges (callers)
      const backwardEdges = graph.backwardIndex.get(qn) ?? [];
      for (const edge of backwardEdges) {
        if (!visited.has(edge.caller.qualifiedName)) {
          visited.add(edge.caller.qualifiedName);
          result.push(edge.caller);
          nextFrontier.push(edge.caller.qualifiedName);
          if (result.length >= maxFunctions) return result;
        }
      }
    }

    frontier = nextFrontier;
  }

  return result;
}

/**
 * Build a FunctionContext for a single function location.
 */
async function buildFunctionContext(
  graph: ProjectCallGraph,
  location: FunctionLocation,
  includeCFG: boolean,
  includeDFG: boolean,
): Promise<FunctionContext> {
  // qualifiedName is "module.func" or "module.Class.method"
  // Extract the parser-facing name by dropping the module prefix
  const parts = location.qualifiedName.split(".");
  const lookupName = parts.length > 2 ? parts.slice(1).join(".") : location.name;

  // Get L1 info from AST
  const astInfo = await getASTInfo(location.file, lookupName);

  // Get direct callers/callees from graph
  const forwardEdges = graph.forwardIndex.get(location.qualifiedName) ?? [];
  const backwardEdges = graph.backwardIndex.get(location.qualifiedName) ?? [];

  const callees = getUniqueCalleeNames(forwardEdges);
  const callers = getUniqueCallerNames(backwardEdges);

  const ctx: FunctionContext = {
    name: location.name,
    qualifiedName: location.qualifiedName,
    file: location.file,
    line: location.line,
    signature: astInfo?.signature() ?? location.name,
    params: astInfo?.params.map((p) => {
      const param: { name: string; type?: string | undefined } = { name: p.name };
      if (p.type) param.type = p.type;
      return param;
    }) ?? [],
    ...(astInfo?.returnType ? { returnType: astInfo.returnType } : {}),
    isExported: location.isExported,
    callers,
    callees,
  };

  // L3: Complexity
  if (includeCFG) {
    try {
      const cfg = await extractCFG(location.file, lookupName);
      if (cfg) {
        ctx.complexity = cfg.cyclomaticComplexity;
        ctx.complexityRating = getComplexityRating(cfg.cyclomaticComplexity);
      }
    } catch {
      // Skip if CFG extraction fails
    }
  }

  // L4: Data flow variables
  if (includeDFG) {
    try {
      const dfg = await extractDFG(location.file, lookupName);
      if (dfg) {
        ctx.variables = dfg.variables;
      }
    } catch {
      // Skip if DFG extraction fails
    }
  }

  return ctx;
}

/**
 * Extract AST info for a function from its file.
 */
async function getASTInfo(
  filePath: string,
  functionName: string,
): Promise<FunctionInfo | null> {
  const parser = getParser(filePath);
  if (!parser) return null;

  try {
    const source = await readFile(filePath, "utf-8");
    const moduleInfo = await parser.extractAST(source, filePath);

    // Check top-level functions
    const fn = moduleInfo.functions.find((f) => f.name === functionName);
    if (fn) return fn;

    // Check class methods (functionName could be "method" or "Class.method")
    for (const cls of moduleInfo.classes) {
      for (const method of cls.methods) {
        if (method.name === functionName || `${cls.name}.${method.name}` === functionName) {
          return method;
        }
      }
    }
  } catch {
    // Skip if file read or parsing fails
  }

  return null;
}

function getUniqueCalleeNames(edges: CallEdge[]): string[] {
  const names = new Set<string>();
  for (const edge of edges) {
    names.add(edge.calleeLocation?.name ?? edge.callee);
  }
  return [...names];
}

function getUniqueCallerNames(edges: CallEdge[]): string[] {
  const names = new Set<string>();
  for (const edge of edges) {
    names.add(edge.caller.name);
  }
  return [...names];
}
