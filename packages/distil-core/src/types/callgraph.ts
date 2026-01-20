/**
 * L2: Call Graph Types
 *
 * Types for cross-file call graph analysis:
 * - Forward edges (what does this call?)
 * - Backward edges (what calls this?)
 * - Import relationships
 */

// SourceLocation is defined in common.js but not currently used here
// import type { SourceLocation } from './common.js';

/**
 * A call site (where a function is called from)
 */
export interface CallSite {
  /** File containing the call */
  file: string;
  /** Function making the call */
  caller: string;
  /** Line number of the call */
  line: number;
  /** Column of the call */
  column: number;
  /** Is this a method call (obj.method()) */
  isMethodCall: boolean;
  /** Receiver expression (for method calls) */
  receiver: string | null;
  /** Arguments (simplified representation) */
  argumentCount: number;
}

/**
 * A function definition location
 */
export interface FunctionLocation {
  /** File path */
  file: string;
  /** Function name */
  name: string;
  /** Qualified name (Class.method or module.function) */
  qualifiedName: string;
  /** Line number */
  line: number;
  /** Is exported */
  isExported: boolean;
}

/**
 * An edge in the call graph
 */
export interface CallEdge {
  /** Caller function location */
  caller: FunctionLocation;
  /** Callee function name (may not be resolved) */
  callee: string;
  /** Resolved callee location (if found) */
  calleeLocation: FunctionLocation | null;
  /** Call site information */
  callSite: CallSite;
  /** Is this a dynamic call (can't statically resolve) */
  isDynamic: boolean;
  /** Call type */
  callType: 'direct' | 'method' | 'constructor' | 'callback' | 'dynamic';
}

/**
 * Intra-file call graph (calls within a single file)
 */
export interface IntraFileCallGraph {
  /** File path */
  file: string;
  /** Forward edges: caller -> callees */
  calls: Map<string, string[]>;
  /** Backward edges: callee -> callers */
  calledBy: Map<string, string[]>;
}

/**
 * Project-wide call graph
 */
export interface ProjectCallGraph {
  /** Project root path */
  projectRoot: string;
  /** All edges in the graph */
  edges: CallEdge[];
  /** Index: function qualified name -> outgoing edges */
  forwardIndex: Map<string, CallEdge[]>;
  /** Index: function qualified name -> incoming edges */
  backwardIndex: Map<string, CallEdge[]>;
  /** All known function locations */
  functions: Map<string, FunctionLocation>;
  /** Files included in the graph */
  files: string[];
  /** Build timestamp */
  builtAt: number;
}

/**
 * Impact analysis result
 */
export interface ImpactResult {
  /** The function being analyzed */
  target: FunctionLocation;
  /** Direct callers (depth 1) */
  directCallers: CallSite[];
  /** All callers (transitive, up to depth limit) */
  allCallers: CallSite[];
  /** Depth of analysis */
  depth: number;
  /** Files affected */
  affectedFiles: string[];
  /** Total caller count */
  callerCount: number;
}

/**
 * Dead code detection result
 */
export interface DeadCodeResult {
  /** Functions with no callers (potential dead code) */
  unreachableFunctions: FunctionLocation[];
  /** Entry points used for reachability analysis */
  entryPoints: FunctionLocation[];
  /** Files with dead code */
  affectedFiles: string[];
}

/**
 * Call graph statistics
 */
export interface CallGraphStats {
  /** Total number of functions */
  functionCount: number;
  /** Total number of edges */
  edgeCount: number;
  /** Number of files */
  fileCount: number;
  /** Average calls per function */
  avgCallsPerFunction: number;
  /** Max calls from a single function */
  maxCallsFromFunction: number;
  /** Functions with most callers */
  mostCalledFunctions: Array<{ name: string; callerCount: number }>;
  /** Functions with most callees */
  mostCallingFunctions: Array<{ name: string; calleeCount: number }>;
}

/**
 * Create empty project call graph
 */
export function createProjectCallGraph(
  projectRoot: string
): ProjectCallGraph {
  return {
    projectRoot,
    edges: [],
    forwardIndex: new Map(),
    backwardIndex: new Map(),
    functions: new Map(),
    files: [],
    builtAt: Date.now(),
  };
}

/**
 * Add an edge to the call graph
 */
export function addCallEdge(
  graph: ProjectCallGraph,
  edge: CallEdge
): void {
  graph.edges.push(edge);

  // Update forward index
  const callerKey = edge.caller.qualifiedName;
  const forwardEdges = graph.forwardIndex.get(callerKey) ?? [];
  forwardEdges.push(edge);
  graph.forwardIndex.set(callerKey, forwardEdges);

  // Update backward index (if callee is resolved)
  if (edge.calleeLocation) {
    const calleeKey = edge.calleeLocation.qualifiedName;
    const backwardEdges = graph.backwardIndex.get(calleeKey) ?? [];
    backwardEdges.push(edge);
    graph.backwardIndex.set(calleeKey, backwardEdges);
  }
}

/**
 * Get all callers of a function (for impact analysis)
 */
export function getCallers(
  graph: ProjectCallGraph,
  qualifiedName: string,
  maxDepth: number = 10
): CallSite[] {
  const visited = new Set<string>();
  const result: CallSite[] = [];

  function traverse(name: string, depth: number): void {
    if (depth > maxDepth || visited.has(name)) return;
    visited.add(name);

    const edges = graph.backwardIndex.get(name) ?? [];
    for (const edge of edges) {
      result.push(edge.callSite);
      traverse(edge.caller.qualifiedName, depth + 1);
    }
  }

  traverse(qualifiedName, 0);
  return result;
}

/**
 * Get all callees of a function
 */
export function getCallees(
  graph: ProjectCallGraph,
  qualifiedName: string,
  maxDepth: number = 10
): FunctionLocation[] {
  const visited = new Set<string>();
  const result: FunctionLocation[] = [];

  function traverse(name: string, depth: number): void {
    if (depth > maxDepth || visited.has(name)) return;
    visited.add(name);

    const edges = graph.forwardIndex.get(name) ?? [];
    for (const edge of edges) {
      if (edge.calleeLocation) {
        result.push(edge.calleeLocation);
        traverse(edge.calleeLocation.qualifiedName, depth + 1);
      }
    }
  }

  traverse(qualifiedName, 0);
  return result;
}
