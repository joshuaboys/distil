/**
 * L4: Data Flow Graph Types
 *
 * Types for data flow analysis:
 * - Variable definitions
 * - Variable uses
 * - Def-use chains
 */

import type { SourceLocation } from "./common.js";

/**
 * Type of variable reference
 */
export type RefType =
  | "def" // Variable definition (assignment)
  | "use" // Variable use (read)
  | "update" // Variable update (read + write, e.g., x++)
  | "param" // Function parameter (implicit def)
  | "capture"; // Closure capture

/**
 * A variable reference (definition or use)
 */
export interface VarRef {
  /** Variable name */
  name: string;
  /** Reference type */
  type: RefType;
  /** Line number (1-based) */
  line: number;
  /** Column (0-based) */
  column: number;
  /** Source location */
  location: SourceLocation;
  /** Scope (function name or 'global') */
  scope: string;
  /** Is this in a nested function/closure */
  isInClosure: boolean;
  /** Expression context (simplified) */
  expression: string | null;
}

/**
 * A def-use edge (definition flows to use)
 */
export interface DefUseEdge {
  /** Variable name */
  variable: string;
  /** Definition location */
  def: VarRef;
  /** Use location */
  use: VarRef;
  /** Is this a may-reach (vs must-reach) */
  isMayReach: boolean;
  /** Is there a potential intervening definition */
  hasInterveningDef: boolean;
}

/**
 * Reaching definitions for a program point
 */
export interface ReachingDefinitions {
  /** Program point (line number) */
  line: number;
  /** Variable -> set of reaching definition lines */
  definitions: Map<string, Set<number>>;
}

/**
 * Live variables at a program point
 */
export interface LiveVariables {
  /** Program point (line number) */
  line: number;
  /** Set of variable names that are live */
  variables: Set<string>;
}

/**
 * Data flow graph for a function
 */
export interface DFGInfo {
  /** Function name */
  functionName: string;
  /** File path */
  filePath: string;
  /** All variable references */
  refs: VarRef[];
  /** All def-use edges */
  edges: DefUseEdge[];
  /** All tracked variables */
  variables: string[];
  /** Parameters (entry definitions) */
  parameters: VarRef[];
  /** Return expressions (exit uses) */
  returns: VarRef[];
  /** Reaching definitions at each line */
  reachingDefs: Map<number, ReachingDefinitions>;
  /** Live variables at each line */
  liveVars: Map<number, LiveVariables>;

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): Record<string, unknown>;

  /**
   * Get all definitions of a variable
   */
  getDefinitions(varName: string): VarRef[];

  /**
   * Get all uses of a variable
   */
  getUses(varName: string): VarRef[];

  /**
   * Get def-use chain for a specific definition
   */
  getUsesOfDefinition(def: VarRef): VarRef[];
}

/**
 * Create DFGInfo with helper methods
 */
export function createDFGInfo(
  data: Omit<DFGInfo, "toJSON" | "getDefinitions" | "getUses" | "getUsesOfDefinition">,
): DFGInfo {
  return {
    ...data,

    toJSON(): Record<string, unknown> {
      return {
        functionName: this.functionName,
        filePath: this.filePath,
        refs: this.refs.map((r) => ({
          name: r.name,
          type: r.type,
          line: r.line,
          column: r.column,
          scope: r.scope,
        })),
        edges: this.edges.map((e) => ({
          variable: e.variable,
          defLine: e.def.line,
          useLine: e.use.line,
          isMayReach: e.isMayReach,
        })),
        variables: this.variables,
      };
    },

    getDefinitions(varName: string): VarRef[] {
      return this.refs.filter(
        (r) => r.name === varName && (r.type === "def" || r.type === "param"),
      );
    },

    getUses(varName: string): VarRef[] {
      return this.refs.filter((r) => r.name === varName && r.type === "use");
    },

    getUsesOfDefinition(def: VarRef): VarRef[] {
      return this.edges
        .filter(
          (e) => e.variable === def.name && e.def.line === def.line && e.def.column === def.column,
        )
        .map((e) => e.use);
    },
  };
}

/**
 * Data flow analysis direction
 */
export type FlowDirection = "forward" | "backward";

/**
 * Common data flow analysis framework
 */
export interface DataFlowAnalysis<T> {
  /** Analysis direction */
  direction: FlowDirection;
  /** Initial value at entry/exit */
  initial: T;
  /** Meet operator (merge values at join points) */
  meet(a: T, b: T): T;
  /** Transfer function (transform value across a block) */
  transfer(block: number, input: T): T;
}

/**
 * Check if a variable is tainted (flows from untrusted source)
 * Simplified taint tracking
 */
export function isTainted(dfg: DFGInfo, varName: string, taintedSources: Set<string>): boolean {
  const visited = new Set<string>();

  function trace(name: string): boolean {
    if (visited.has(name)) return false;
    visited.add(name);

    if (taintedSources.has(name)) return true;

    // Find all edges where this variable is used
    const uses = dfg.refs.filter((r) => r.name === name && r.type === "use");

    for (const use of uses) {
      // Find definitions that reach this use
      const reachingEdges = dfg.edges.filter((e) => e.variable === name && e.use.line === use.line);

      for (const edge of reachingEdges) {
        // Check if the definition comes from a tainted source
        // This is simplified - real taint analysis would be more sophisticated
        if (trace(edge.variable)) {
          return true;
        }
      }
    }

    return false;
  }

  return trace(varName);
}
