/**
 * @distil/core
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
 * import { extractFile, buildCallGraph, getSlice } from '@distil/core';
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

import { readFile, readdir } from "fs/promises";
import { join, relative, resolve } from "path";
import {
  addCallEdge,
  createProjectCallGraph,
  type CallEdge,
  type FunctionLocation,
  type ProjectCallGraph,
} from "./types/callgraph.js";
import { LANGUAGE_EXTENSIONS } from "./types/common.js";
import { getParser } from "./parsers/index.js";

// Type exports
export * from "./types/index.js";

// Parser exports
export { getParser, type LanguageParser } from "./parsers/index.js";

// Extractor exports (to be implemented)
// export { extractFile } from './extractors/ast/index.js';
// export { buildCallGraph, getImpact } from './extractors/callgraph/index.js';
// export { extractCFG } from './extractors/cfg/index.js';
// export { extractDFG } from './extractors/dfg/index.js';
// export { extractPDG, getSlice } from './extractors/pdg/index.js';

// Analysis layer extractors
export { extractCFG, extractDFG, extractPDG } from "./extractors.js";

// API exports (to be implemented)
// export { getRelevantContext } from './api/context.js';

// Kindling integration (to be implemented)
// export { DistilStore } from './kindling/store.js';

export async function buildCallGraph(projectRoot: string): Promise<ProjectCallGraph> {
  const rootPath = resolve(projectRoot);
  const graph = createProjectCallGraph(rootPath);
  const files = await collectSourceFiles(rootPath);
  graph.files = files;

  const nameIndex = new Map<string, FunctionLocation[]>();
  const fileIndex = new Map<string, Map<string, FunctionLocation>>();
  const fileCalls = new Map<string, Map<string, string[]>>();

  for (const filePath of files) {
    const parser = getParser(filePath);
    if (!parser) continue;

    const source = await readFile(filePath, "utf-8");
    const moduleInfo = await parser.extractAST(source, filePath);
    const calls = await parser.extractCalls(source, filePath);

    fileCalls.set(filePath, calls);

    const moduleName = getModuleName(rootPath, filePath);
    const fileFunctions = new Map<string, FunctionLocation>();

    for (const fn of moduleInfo.functions) {
      const location = createFunctionLocation({
        filePath,
        name: fn.name,
        qualifiedName: `${moduleName}.${fn.name}`,
        line: fn.lineNumber,
        isExported: fn.isExported,
      });
      registerFunctionLocation(fileFunctions, nameIndex, graph, location, [fn.name]);
    }

    for (const cls of moduleInfo.classes) {
      for (const method of cls.methods) {
        const methodKey = `${cls.name}.${method.name}`;
        const location = createFunctionLocation({
          filePath,
          name: method.name,
          qualifiedName: `${moduleName}.${methodKey}`,
          line: method.lineNumber,
          isExported: cls.isExported,
        });
        registerFunctionLocation(fileFunctions, nameIndex, graph, location, [
          methodKey,
          method.name,
        ]);
      }
    }

    fileIndex.set(filePath, fileFunctions);
  }

  for (const [filePath, calls] of fileCalls) {
    const fileFunctions = fileIndex.get(filePath);
    if (!fileFunctions) continue;

    for (const [callerName, callees] of calls) {
      const callerLocation = fileFunctions.get(callerName);
      if (!callerLocation) continue;

      for (const calleeName of callees) {
        const { location: calleeLocation, isDynamic } = resolveCallee(
          calleeName,
          fileFunctions,
          nameIndex,
        );
        const isMethodCall = calleeName.includes(".");
        const callType: CallEdge["callType"] = isDynamic
          ? "dynamic"
          : isMethodCall
            ? "method"
            : "direct";
        const edge: CallEdge = {
          caller: callerLocation,
          callee: calleeName,
          calleeLocation,
          callSite: {
            file: filePath,
            caller: callerLocation.qualifiedName,
            line: callerLocation.line,
            column: 0,
            isMethodCall,
            receiver: null,
            argumentCount: 0,
          },
          isDynamic,
          callType,
        };
        addCallEdge(graph, edge);
      }
    }
  }

  return graph;
}

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".tox",
  "venv",
  ".venv",
  "__pycache__",
  ".cache",
  ".kindling",
  ".distil",
]);

const IGNORE_FILES = new Set([".DS_Store", "Thumbs.db", ".gitkeep"]);

async function collectSourceFiles(rootPath: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dirPath: string): Promise<void> {
    let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[] = [];
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (IGNORE_FILES.has(entry.name)) continue;
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = entry.name.slice(entry.name.lastIndexOf("."));
      if (!LANGUAGE_EXTENSIONS[ext]) continue;
      results.push(fullPath);
    }
  }

  await walk(rootPath);
  results.sort();
  return results;
}

function getModuleName(rootPath: string, filePath: string): string {
  const relPath = relative(rootPath, filePath).replace(/\\/g, "/");
  return relPath.replace(/\.[^/.]+$/, "");
}

function createFunctionLocation(input: {
  filePath: string;
  name: string;
  qualifiedName: string;
  line: number;
  isExported: boolean;
}): FunctionLocation {
  return {
    file: input.filePath,
    name: input.name,
    qualifiedName: input.qualifiedName,
    line: input.line,
    isExported: input.isExported,
  };
}

function registerFunctionLocation(
  fileFunctions: Map<string, FunctionLocation>,
  nameIndex: Map<string, FunctionLocation[]>,
  graph: ProjectCallGraph,
  location: FunctionLocation,
  lookupKeys: string[],
): void {
  graph.functions.set(location.qualifiedName, location);
  for (const key of lookupKeys) {
    const existing = nameIndex.get(key) ?? [];
    existing.push(location);
    nameIndex.set(key, existing);
  }
  for (const key of lookupKeys) {
    if (!fileFunctions.has(key)) {
      fileFunctions.set(key, location);
    }
  }
}

function resolveCallee(
  calleeName: string,
  fileFunctions: Map<string, FunctionLocation>,
  nameIndex: Map<string, FunctionLocation[]>,
): { location: FunctionLocation | null; isDynamic: boolean } {
  const localMatch = fileFunctions.get(calleeName);
  if (localMatch) {
    return { location: localMatch, isDynamic: false };
  }

  const matches = nameIndex.get(calleeName) ?? [];
  if (matches.length === 1) {
    return { location: matches[0] ?? null, isDynamic: false };
  }

  return { location: null, isDynamic: true };
}

// Version
export const VERSION = "0.1.0";
