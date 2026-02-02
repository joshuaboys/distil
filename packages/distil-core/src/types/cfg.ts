/**
 * L3: Control Flow Graph Types
 *
 * Types for control flow analysis:
 * - Basic blocks
 * - Control flow edges
 * - Cyclomatic complexity
 */

import type { SourceRange } from "./common.js";

/**
 * Type of basic block
 */
export type BlockType =
  | "entry" // Function entry point
  | "exit" // Function exit point
  | "body" // Regular code block
  | "branch" // If/switch decision point
  | "loop_header" // Loop condition check
  | "loop_body" // Loop body
  | "try" // Try block
  | "catch" // Catch block
  | "finally" // Finally block
  | "return" // Return statement
  | "throw"; // Throw statement

/**
 * A basic block in the CFG
 *
 * A basic block is a sequence of statements with:
 * - One entry point (first statement)
 * - One exit point (last statement)
 * - No internal branches
 */
export interface CFGBlock {
  /** Unique block ID within the function */
  id: number;
  /** Block type */
  type: BlockType;
  /** Line range [start, end] (1-based) */
  lines: [number, number];
  /** Source code range */
  range: SourceRange;
  /** Statements in this block (simplified) */
  statements: string[];
  /** Function calls made in this block */
  calls: string[];
  /** Variables defined in this block */
  defines: string[];
  /** Variables used in this block */
  uses: string[];
}

/**
 * Type of control flow edge
 */
export type EdgeType =
  | "unconditional" // Always taken
  | "true" // Condition is true
  | "false" // Condition is false
  | "case" // Switch case
  | "default" // Switch default
  | "break" // Break statement
  | "continue" // Continue statement
  | "return" // Return edge
  | "throw" // Exception edge
  | "back_edge" // Loop back edge
  | "fallthrough"; // Implicit fallthrough

/**
 * An edge in the CFG
 */
export interface CFGEdge {
  /** Source block ID */
  from: number;
  /** Target block ID */
  to: number;
  /** Edge type */
  type: EdgeType;
  /** Condition expression (for conditional edges) */
  condition: string | null;
  /** Is this a back edge (loop) */
  isBackEdge: boolean;
}

/**
 * Control flow graph for a function
 */
export interface CFGInfo {
  /** Function name */
  functionName: string;
  /** File path */
  filePath: string;
  /** All basic blocks */
  blocks: CFGBlock[];
  /** All edges */
  edges: CFGEdge[];
  /** Entry block ID */
  entryBlock: number;
  /** Exit block IDs (may have multiple) */
  exitBlocks: number[];
  /** Cyclomatic complexity (M = E - N + 2P) */
  cyclomaticComplexity: number;
  /** Maximum nesting depth */
  maxNestingDepth: number;
  /** Number of decision points */
  decisionPoints: number;
  /** Nested function CFGs (if any) */
  nestedFunctions: Map<string, CFGInfo>;

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): Record<string, unknown>;
}

/**
 * Complexity thresholds for code quality
 */
export const COMPLEXITY_THRESHOLDS = {
  /** Low complexity (simple function) */
  LOW: 5,
  /** Medium complexity (moderate) */
  MEDIUM: 10,
  /** High complexity (consider refactoring) */
  HIGH: 20,
  /** Very high complexity (definitely refactor) */
  VERY_HIGH: 50,
} as const;

/**
 * Get complexity rating
 */
export function getComplexityRating(complexity: number): "low" | "medium" | "high" | "very_high" {
  if (complexity <= COMPLEXITY_THRESHOLDS.LOW) return "low";
  if (complexity <= COMPLEXITY_THRESHOLDS.MEDIUM) return "medium";
  if (complexity <= COMPLEXITY_THRESHOLDS.HIGH) return "high";
  return "very_high";
}

/**
 * Create CFGInfo with helper methods
 */
export function createCFGInfo(data: Omit<CFGInfo, "toJSON">): CFGInfo {
  return {
    ...data,
    toJSON(): Record<string, unknown> {
      return {
        functionName: this.functionName,
        filePath: this.filePath,
        blocks: this.blocks.map((b) => ({
          id: b.id,
          type: b.type,
          lines: b.lines,
          statements: b.statements,
          calls: b.calls,
        })),
        edges: this.edges.map((e) => ({
          from: e.from,
          to: e.to,
          type: e.type,
          condition: e.condition,
        })),
        entryBlock: this.entryBlock,
        exitBlocks: this.exitBlocks,
        cyclomaticComplexity: this.cyclomaticComplexity,
        maxNestingDepth: this.maxNestingDepth,
        decisionPoints: this.decisionPoints,
        nestedFunctions: Object.fromEntries(
          Array.from(this.nestedFunctions.entries()).map(([k, v]) => [k, v.toJSON()]),
        ),
      };
    },
  };
}

/**
 * Calculate cyclomatic complexity from CFG
 *
 * M = E - N + 2P where:
 * - E = number of edges
 * - N = number of nodes (blocks)
 * - P = number of connected components (usually 1)
 *
 * Minimum complexity is 1 (for a straight-line function).
 */
export function calculateCyclomaticComplexity(blocks: CFGBlock[], edges: CFGEdge[]): number {
  const E = edges.length;
  const N = blocks.length;
  const P = 1; // Assuming single connected component
  // Ensure minimum complexity of 1
  return Math.max(1, E - N + 2 * P);
}

/**
 * Find all paths from entry to exit (for testing/coverage)
 * Warning: Can be exponential for complex functions
 */
export function findAllPaths(cfg: CFGInfo, maxPaths: number = 100): number[][] {
  const paths: number[][] = [];
  const visited = new Set<string>();

  function dfs(current: number, path: number[]): void {
    if (paths.length >= maxPaths) return;

    path.push(current);
    const pathKey = path.join(",");

    // Avoid infinite loops (back edges)
    if (visited.has(pathKey)) {
      path.pop();
      return;
    }
    visited.add(pathKey);

    // Check if we reached an exit
    if (cfg.exitBlocks.includes(current)) {
      paths.push([...path]);
      path.pop();
      visited.delete(pathKey);
      return;
    }

    // Continue to successors
    const outEdges = cfg.edges.filter((e) => e.from === current);
    for (const edge of outEdges) {
      dfs(edge.to, path);
    }

    path.pop();
    visited.delete(pathKey);
  }

  dfs(cfg.entryBlock, []);
  return paths;
}
