/**
 * Call graph utility functions
 *
 * Shared helpers for call graph analysis, used by both CLI and MCP packages.
 */

import type { ProjectCallGraph, FunctionLocation, CallEdge } from "./types/callgraph.js";

/**
 * A caller with its depth in the transitive call chain.
 */
export interface CallerWithDepth {
  caller: FunctionLocation;
  edge: CallEdge;
  depth: number;
}

/**
 * Find callers of a function in the call graph with depth tracking.
 *
 * Walks backward edges to find direct and transitive callers up to maxDepth.
 */
export function findCallers(
  graph: ProjectCallGraph,
  qualifiedName: string,
  maxDepth: number,
): CallerWithDepth[] {
  const visited = new Set<string>();
  const result: CallerWithDepth[] = [];

  function traverse(name: string, depth: number): void {
    if (depth > maxDepth || visited.has(name)) return;
    visited.add(name);

    const edges = graph.backwardIndex.get(name) ?? [];
    for (const edge of edges) {
      result.push({ caller: edge.caller, edge, depth });
      traverse(edge.caller.qualifiedName, depth + 1);
    }
  }

  traverse(qualifiedName, 1);
  return result;
}

/**
 * Built-in method names to filter from call graph output.
 *
 * These are standard library methods (Array, String, Object, etc.) that
 * add noise to call graphs without providing useful structural information.
 */
export const BUILTIN_METHODS = new Set([
  // Array methods
  "push", "pop", "shift", "unshift", "slice", "splice", "concat", "join",
  "map", "filter", "reduce", "forEach", "find", "findIndex", "some", "every",
  "includes", "indexOf", "lastIndexOf", "sort", "reverse", "flat", "flatMap",
  "fill", "copyWithin", "at", "from", "of", "isArray",
  // String methods
  "split", "trim", "trimStart", "trimEnd", "toLowerCase", "toUpperCase",
  "replace", "replaceAll", "startsWith", "endsWith", "padStart", "padEnd",
  "repeat", "charAt", "charCodeAt", "codePointAt", "substring", "substr",
  "match", "matchAll", "search", "localeCompare", "normalize", "anchor", "link",
  // Object methods
  "toString", "valueOf", "toJSON", "toFixed", "toPrecision", "toLocaleString",
  "keys", "values", "entries", "fromEntries", "assign", "freeze", "seal",
  "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable",
  // Map/Set methods
  "has", "get", "set", "delete", "clear", "add", "size",
  // Console methods
  "log", "warn", "error", "info", "debug", "trace", "dir", "table", "time", "timeEnd",
  // Promise methods
  "then", "catch", "finally", "all", "race", "allSettled", "any",
  // JSON methods
  "parse", "stringify",
  // Global functions
  "isNaN", "isFinite", "parseInt", "parseFloat",
  "encodeURI", "decodeURI", "encodeURIComponent", "decodeURIComponent",
  "String", "Number", "Boolean",
  // Node fs methods
  "readFile", "writeFile", "readdir", "stat", "mkdir", "rmdir", "unlink",
  "access", "chmod", "chown", "copyFile", "rename", "appendFile",
  "isDirectory", "isFile", "isSymbolicLink",
  // Node path methods
  "resolve", "join", "dirname", "basename", "extname", "relative", "normalize", "parse",
  // Process methods
  "exit", "cwd", "chdir", "env", "argv", "nextTick",
  // Other common
  "setTimeout", "setInterval", "clearTimeout", "clearInterval", "setImmediate",
  "bind", "call", "apply", "signature",
]);

/**
 * Check if a callee name refers to a built-in method.
 */
export function isBuiltinMethod(name: string): boolean {
  return BUILTIN_METHODS.has(name);
}
