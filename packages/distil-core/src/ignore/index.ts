import { access, lstat, readFile } from "fs/promises";
import ignore from "ignore";
import { dirname, relative, resolve } from "path";
import { getBuiltinIgnorePatterns } from "./patterns.js";

export interface IgnoreOptions {
  useIgnore?: boolean;
}

export interface IgnoreMatcher {
  basePath: string;
  ignoreFilePath: string | null;
  ignores(path: string, isDirectory?: boolean): boolean;
}

const DISTILIGNORE_FILE = ".distilignore";

export async function findNearestDistilignore(startPath: string): Promise<string | null> {
  const absoluteStart = resolve(startPath);
  let currentDir = await toDirectory(absoluteStart);

  while (true) {
    const candidate = resolve(currentDir, DISTILIGNORE_FILE);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue searching up the tree.
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

export async function createIgnoreMatcher(
  targetPath: string,
  options: IgnoreOptions = {},
): Promise<IgnoreMatcher> {
  const useIgnore = options.useIgnore ?? true;
  const basePath = resolve(targetPath);

  if (!useIgnore) {
    return {
      basePath,
      ignoreFilePath: null,
      ignores: () => false,
    };
  }

  const ignoreFilePath = await findNearestDistilignore(basePath);
  const ignoreBasePath = ignoreFilePath ? dirname(ignoreFilePath) : basePath;
  const matcher = ignore();
  matcher.add(getBuiltinIgnorePatterns());

  if (ignoreFilePath) {
    const raw = await readFile(ignoreFilePath, "utf-8");
    matcher.add(raw.replace(/\r/g, ""));
  }

  return {
    basePath: ignoreBasePath,
    ignoreFilePath,
    ignores: (path: string, isDirectory: boolean = false): boolean => {
      const absolutePath = resolve(path);
      const relPath = relative(ignoreBasePath, absolutePath).replace(/\\/g, "/");
      if (!relPath || relPath === ".") return false;
      const candidate = isDirectory && !relPath.endsWith("/") ? `${relPath}/` : relPath;
      return matcher.ignores(candidate);
    },
  };
}

export async function isIgnoredPath(path: string, options: IgnoreOptions = {}): Promise<boolean> {
  const matcher = await createIgnoreMatcher(path, options);
  const absolutePath = resolve(path);
  const isDirectory = await isDirectoryPath(absolutePath);
  return matcher.ignores(absolutePath, isDirectory);
}

async function isDirectoryPath(path: string): Promise<boolean> {
  try {
    const stats = await lstat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function toDirectory(path: string): Promise<string> {
  if (await isDirectoryPath(path)) return path;
  return dirname(path);
}
