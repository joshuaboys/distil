/**
 * L5: Program Dependence Graph Types
 *
 * Types for program dependence analysis:
 * - Control dependencies
 * - Data dependencies
 * - Program slicing
 */

import type { CFGInfo } from './cfg.js';
import type { DFGInfo } from './dfg.js';
// VarRef and SourceLocation are available but not currently used
// import type { VarRef } from './dfg.js';
// import type { SourceLocation } from './common.js';

/**
 * Type of dependence
 */
export type DependenceType =
  | 'control' // Control dependence (branch affects execution)
  | 'data' // Data dependence (def-use relationship)
  | 'anti' // Anti-dependence (use before def of same var)
  | 'output'; // Output dependence (def before def of same var)

/**
 * A node in the PDG (represents a statement/expression)
 */
export interface PDGNode {
  /** Unique node ID */
  id: number;
  /** Line number */
  line: number;
  /** Statement text (simplified) */
  statement: string;
  /** Node type */
  type: 'entry' | 'statement' | 'predicate' | 'exit';
  /** Variables defined */
  defines: string[];
  /** Variables used */
  uses: string[];
  /** Corresponding CFG block ID */
  cfgBlockId: number | null;
}

/**
 * An edge in the PDG
 */
export interface PDGEdge {
  /** Source node ID */
  from: number;
  /** Target node ID */
  to: number;
  /** Dependence type */
  type: DependenceType;
  /** Variable involved (for data dependencies) */
  variable: string | null;
  /** Label/description */
  label: string;
}

/**
 * Program Dependence Graph for a function
 */
export interface PDGInfo {
  /** Function name */
  functionName: string;
  /** File path */
  filePath: string;
  /** All nodes */
  nodes: PDGNode[];
  /** All edges */
  edges: PDGEdge[];
  /** Entry node ID */
  entryNode: number;
  /** Exit node IDs */
  exitNodes: number[];
  /** Underlying CFG */
  cfg: CFGInfo;
  /** Underlying DFG */
  dfg: DFGInfo;
  /** Control dependence edges count */
  controlEdgeCount: number;
  /** Data dependence edges count */
  dataEdgeCount: number;

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): Record<string, unknown>;

  /**
   * Convert to compact format for LLM
   */
  toCompact(): Record<string, unknown>;

  /**
   * Compute backward slice from a line/variable
   */
  backwardSlice(line: number, variable?: string): Set<number>;

  /**
   * Compute forward slice from a line/variable
   */
  forwardSlice(line: number, variable?: string): Set<number>;
}

/**
 * Slice result with additional context
 */
export interface SliceResult {
  /** Lines in the slice */
  lines: Set<number>;
  /** Slice criterion (starting point) */
  criterion: {
    line: number;
    variable: string | null;
  };
  /** Slice direction */
  direction: 'backward' | 'forward';
  /** Nodes included in slice */
  nodes: PDGNode[];
  /** Edges traversed */
  edges: PDGEdge[];
  /** Variables involved */
  variables: Set<string>;
  /** Source code for the slice */
  sourceCode: string[];
}

/**
 * Create PDGInfo with helper methods
 */
export function createPDGInfo(
  data: Omit<PDGInfo, 'toJSON' | 'toCompact' | 'backwardSlice' | 'forwardSlice'>
): PDGInfo {
  return {
    ...data,

    toJSON(): Record<string, unknown> {
      return {
        functionName: this.functionName,
        filePath: this.filePath,
        nodes: this.nodes.map((n) => ({
          id: n.id,
          line: n.line,
          type: n.type,
          statement: n.statement,
          defines: n.defines,
          uses: n.uses,
        })),
        edges: this.edges.map((e) => ({
          from: e.from,
          to: e.to,
          type: e.type,
          variable: e.variable,
          label: e.label,
        })),
        controlEdgeCount: this.controlEdgeCount,
        dataEdgeCount: this.dataEdgeCount,
        complexity: this.cfg.cyclomaticComplexity,
      };
    },

    toCompact(): Record<string, unknown> {
      return {
        function: this.functionName,
        nodeCount: this.nodes.length,
        edgeCount: this.edges.length,
        controlDeps: this.controlEdgeCount,
        dataDeps: this.dataEdgeCount,
        complexity: this.cfg.cyclomaticComplexity,
        variables: this.dfg.variables,
      };
    },

    backwardSlice(line: number, variable?: string): Set<number> {
      return computeBackwardSlice(this, line, variable);
    },

    forwardSlice(line: number, variable?: string): Set<number> {
      return computeForwardSlice(this, line, variable);
    },
  };
}

/**
 * Compute backward slice (what affects this line?)
 *
 * A backward slice includes all statements that could affect
 * the value of a variable at a given program point.
 */
export function computeBackwardSlice(
  pdg: PDGInfo,
  line: number,
  variable?: string
): Set<number> {
  const slice = new Set<number>();
  const visited = new Set<number>();

  // Find starting nodes
  const startNodes = pdg.nodes.filter((n) => {
    if (n.line !== line) return false;
    if (variable) {
      return n.uses.includes(variable) || n.defines.includes(variable);
    }
    return true;
  });

  // Traverse backwards through dependencies
  function traverse(nodeId: number): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = pdg.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    slice.add(node.line);

    // Find all edges pointing to this node
    const incomingEdges = pdg.edges.filter((e) => e.to === nodeId);

    for (const edge of incomingEdges) {
      // For data dependencies, only follow if we care about the variable
      if (edge.type === 'data' && variable && edge.variable !== variable) {
        // But also follow if source defines a variable we use
        const sourceNode = pdg.nodes.find((n) => n.id === edge.from);
        if (!sourceNode?.defines.some((d) => node.uses.includes(d))) {
          continue;
        }
      }
      traverse(edge.from);
    }
  }

  for (const node of startNodes) {
    traverse(node.id);
  }

  return slice;
}

/**
 * Compute forward slice (what does this line affect?)
 *
 * A forward slice includes all statements that could be affected
 * by a change at a given program point.
 */
export function computeForwardSlice(
  pdg: PDGInfo,
  line: number,
  variable?: string
): Set<number> {
  const slice = new Set<number>();
  const visited = new Set<number>();

  // Find starting nodes
  const startNodes = pdg.nodes.filter((n) => {
    if (n.line !== line) return false;
    if (variable) {
      return n.defines.includes(variable);
    }
    return true;
  });

  // Traverse forwards through dependencies
  function traverse(nodeId: number): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = pdg.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    slice.add(node.line);

    // Find all edges from this node
    const outgoingEdges = pdg.edges.filter((e) => e.from === nodeId);

    for (const edge of outgoingEdges) {
      // For data dependencies, only follow if we care about the variable
      if (edge.type === 'data' && variable && edge.variable !== variable) {
        continue;
      }
      traverse(edge.to);
    }
  }

  for (const node of startNodes) {
    traverse(node.id);
  }

  return slice;
}

/**
 * Build PDG from CFG and DFG
 */
export function buildPDG(cfg: CFGInfo, dfg: DFGInfo): PDGInfo {
  const nodes: PDGNode[] = [];
  const edges: PDGEdge[] = [];
  let nodeId = 0;

  // Create nodes from CFG blocks
  const blockToNode = new Map<number, number>();

  for (const block of cfg.blocks) {
    const node: PDGNode = {
      id: nodeId,
      line: block.lines[0],
      statement: block.statements.join('; '),
      type:
        block.type === 'entry'
          ? 'entry'
          : block.type === 'branch' || block.type === 'loop_header'
            ? 'predicate'
            : cfg.exitBlocks.includes(block.id)
              ? 'exit'
              : 'statement',
      defines: block.defines,
      uses: block.uses,
      cfgBlockId: block.id,
    };
    nodes.push(node);
    blockToNode.set(block.id, nodeId);
    nodeId++;
  }

  // Add control dependence edges
  // A node Y is control dependent on X if:
  // - X is a predicate
  // - There's a path from X to Y where X determines if Y executes
  let controlEdgeCount = 0;
  for (const block of cfg.blocks) {
    if (block.type === 'branch' || block.type === 'loop_header') {
      const predicateNodeId = blockToNode.get(block.id);
      if (predicateNodeId === undefined) continue;

      // Find blocks that are control dependent on this predicate
      const outEdges = cfg.edges.filter((e) => e.from === block.id);
      for (const edge of outEdges) {
        const targetNodeId = blockToNode.get(edge.to);
        if (targetNodeId !== undefined && targetNodeId !== predicateNodeId) {
          edges.push({
            from: predicateNodeId,
            to: targetNodeId,
            type: 'control',
            variable: null,
            label: edge.condition ?? edge.type,
          });
          controlEdgeCount++;
        }
      }
    }
  }

  // Add data dependence edges from DFG
  let dataEdgeCount = 0;
  for (const dfgEdge of dfg.edges) {
    // Find nodes for def and use
    const defNode = nodes.find(
      (n) => n.line === dfgEdge.def.line && n.defines.includes(dfgEdge.variable)
    );
    const useNode = nodes.find(
      (n) => n.line === dfgEdge.use.line && n.uses.includes(dfgEdge.variable)
    );

    if (defNode && useNode && defNode.id !== useNode.id) {
      edges.push({
        from: defNode.id,
        to: useNode.id,
        type: 'data',
        variable: dfgEdge.variable,
        label: `${dfgEdge.variable}: ${dfgEdge.def.line}→${dfgEdge.use.line}`,
      });
      dataEdgeCount++;
    }
  }

  return createPDGInfo({
    functionName: cfg.functionName,
    filePath: cfg.filePath,
    nodes,
    edges,
    entryNode: blockToNode.get(cfg.entryBlock) ?? 0,
    exitNodes: cfg.exitBlocks
      .map((b) => blockToNode.get(b))
      .filter((n): n is number => n !== undefined),
    cfg,
    dfg,
    controlEdgeCount,
    dataEdgeCount,
  });
}
