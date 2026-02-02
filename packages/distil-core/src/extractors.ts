/**
 * High-level extraction functions for L3-L5 analysis
 *
 * These functions provide a convenient API for extracting
 * CFG, DFG, and PDG from source files.
 */

import { readFile } from "fs/promises";
import { resolve } from "path";
import { getParser } from "./parsers/index.js";
import type { CFGInfo, DFGInfo, PDGInfo } from "./types/index.js";

/**
 * Extract Control Flow Graph (L3) for a function
 *
 * @param filePath - Path to the source file
 * @param functionName - Name of the function (or Class.method)
 * @returns CFGInfo or null if function not found
 *
 * @example
 * ```typescript
 * const cfg = await extractCFG('./src/auth.ts', 'validateToken');
 * console.log(`Complexity: ${cfg?.cyclomaticComplexity}`);
 * ```
 */
export async function extractCFG(filePath: string, functionName: string): Promise<CFGInfo | null> {
  const absPath = resolve(filePath);
  const parser = getParser(absPath);
  if (!parser) {
    throw new Error(`No parser available for file: ${filePath}`);
  }

  const source = await readFile(absPath, "utf-8");
  return parser.extractCFG(source, functionName, absPath);
}

/**
 * Extract Data Flow Graph (L4) for a function
 *
 * @param filePath - Path to the source file
 * @param functionName - Name of the function (or Class.method)
 * @returns DFGInfo or null if function not found
 *
 * @example
 * ```typescript
 * const dfg = await extractDFG('./src/auth.ts', 'validateToken');
 * console.log(`Variables: ${dfg?.variables.join(', ')}`);
 * ```
 */
export async function extractDFG(filePath: string, functionName: string): Promise<DFGInfo | null> {
  const absPath = resolve(filePath);
  const parser = getParser(absPath);
  if (!parser) {
    throw new Error(`No parser available for file: ${filePath}`);
  }

  const source = await readFile(absPath, "utf-8");
  return parser.extractDFG(source, functionName, absPath);
}

/**
 * Extract Program Dependence Graph (L5) for a function
 *
 * @param filePath - Path to the source file
 * @param functionName - Name of the function (or Class.method)
 * @returns PDGInfo or null if function not found
 *
 * @example
 * ```typescript
 * const pdg = await extractPDG('./src/auth.ts', 'validateToken');
 * // Get backward slice from line 42
 * const slice = pdg?.backwardSlice(42, 'token');
 * ```
 */
export async function extractPDG(filePath: string, functionName: string): Promise<PDGInfo | null> {
  const absPath = resolve(filePath);
  const parser = getParser(absPath);
  if (!parser) {
    throw new Error(`No parser available for file: ${filePath}`);
  }

  const source = await readFile(absPath, "utf-8");
  return parser.extractPDG(source, functionName, absPath);
}
