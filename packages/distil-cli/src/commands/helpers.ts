/**
 * Shared helpers for CLI commands
 *
 * Functions used by multiple command files (cfg, dfg, slice).
 */

import { access } from "fs/promises";
import { readFile } from "fs/promises";
import { getParser } from "@distil/core";

export async function checkFileExists(filePath: string, displayPath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    console.error(`File not found: ${displayPath}`);
    process.exit(1);
  }
}

export async function listAvailableFunctions(filePath: string): Promise<string[]> {
  const parser = getParser(filePath);
  if (!parser) return [];

  try {
    const source = await readFile(filePath, "utf-8");
    const moduleInfo = await parser.extractAST(source, filePath);
    const functions: string[] = [];

    for (const fn of moduleInfo.functions) {
      functions.push(fn.name);
    }
    for (const cls of moduleInfo.classes) {
      for (const method of cls.methods) {
        functions.push(`${cls.name}.${method.name}`);
      }
    }
    return functions;
  } catch {
    return [];
  }
}

export function fuzzyMatchFunction(searchTerm: string, available: string[]): string[] {
  const term = searchTerm.toLowerCase();
  return available.filter((fn) => fn.toLowerCase().includes(term) || fn.toLowerCase() === term);
}
