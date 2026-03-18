import { readFileSync } from "fs";
import { readFile } from "fs/promises";
import { join, resolve } from "path";
import type { WorkspaceInfo } from "./detect.js";

/**
 * Resolve a package import to an actual file path within a workspace.
 *
 * Given an import like "@myorg/utils", this finds the matching workspace
 * package and resolves to its entry point file.
 */
export function resolvePackageImport(
  importPath: string,
  workspace: WorkspaceInfo,
): string | null {
  const pkg = workspace.packages.find((p) => {
    // Exact match: import "@myorg/utils" → package named "@myorg/utils"
    if (importPath === p.name) return true;

    // Subpath import: import "@myorg/utils/foo" → package named "@myorg/utils"
    if (importPath.startsWith(p.name + "/")) return true;

    return false;
  });

  if (!pkg) return null;

  // For subpath imports, we'd need to check the package's exports map,
  // but for now just resolve the main entry point for exact matches
  const subpath = importPath === pkg.name ? "." : "./" + importPath.slice(pkg.name.length + 1);

  return resolveEntryPoint(pkg.path, subpath);
}

/**
 * Resolve the entry point of a package synchronously by reading its package.json.
 * Returns null if the package.json can't be read or no entry point is found.
 *
 * This is intentionally synchronous for use in import resolution hot paths.
 * It reads the package.json from the filesystem.
 */
function resolveEntryPoint(pkgDir: string, subpath: string): string | null {
  const pkgJsonPath = join(pkgDir, "package.json");
  let content: string;
  try {
    content = readFileSync(pkgJsonPath, "utf-8");
  } catch {
    return null;
  }

  let pkg: {
    exports?: string | Record<string, string | Record<string, string>>;
    main?: string;
    types?: string;
    module?: string;
  };
  try {
    pkg = JSON.parse(content) as typeof pkg;
  } catch {
    return null;
  }

  // Try exports map first (modern Node.js resolution)
  if (pkg.exports) {
    // String shorthand: "exports": "./dist/index.js"
    if (typeof pkg.exports === "string") {
      if (subpath === ".") return resolve(pkgDir, pkg.exports);
    } else if (subpath in pkg.exports) {
      const exportEntry = pkg.exports[subpath];
      if (exportEntry) {
        const resolved = resolveExportEntry(exportEntry);
        if (resolved) return resolve(pkgDir, resolved);
      }
    }
  }

  // For root subpath, fall back to main/types/module
  if (subpath === ".") {
    const entry = pkg.types ?? pkg.main ?? pkg.module;
    if (entry) return resolve(pkgDir, entry);

    return resolve(pkgDir, "index.js");
  }

  // For non-root subpaths without exports match, try direct file resolution
  return resolve(pkgDir, subpath);
}

function resolveExportEntry(entry: string | Record<string, string>): string | null {
  if (typeof entry === "string") return entry;

  // Prefer types → import → require → default
  return entry["types"] ?? entry["import"] ?? entry["require"] ?? entry["default"] ?? null;
}

/**
 * Async version of resolvePackageImport for contexts where async is preferred.
 */
export async function resolvePackageImportAsync(
  importPath: string,
  workspace: WorkspaceInfo,
): Promise<string | null> {
  const pkg = workspace.packages.find((p) => {
    if (importPath === p.name) return true;
    if (importPath.startsWith(p.name + "/")) return true;
    return false;
  });

  if (!pkg) return null;

  const subpath = importPath === pkg.name ? "." : "./" + importPath.slice(pkg.name.length + 1);

  return resolveEntryPointAsync(pkg.path, subpath);
}

async function resolveEntryPointAsync(pkgDir: string, subpath: string): Promise<string | null> {
  const pkgJsonPath = join(pkgDir, "package.json");
  let content: string;
  try {
    content = await readFile(pkgJsonPath, "utf-8");
  } catch {
    return null;
  }

  let pkg: {
    exports?: string | Record<string, string | Record<string, string>>;
    main?: string;
    types?: string;
    module?: string;
  };
  try {
    pkg = JSON.parse(content) as typeof pkg;
  } catch {
    return null;
  }

  if (pkg.exports) {
    if (typeof pkg.exports === "string") {
      if (subpath === ".") return resolve(pkgDir, pkg.exports);
    } else if (subpath in pkg.exports) {
      const exportEntry = pkg.exports[subpath];
      if (exportEntry) {
        const resolved = resolveExportEntry(exportEntry);
        if (resolved) return resolve(pkgDir, resolved);
      }
    }
  }

  if (subpath === ".") {
    const entry = pkg.types ?? pkg.main ?? pkg.module;
    if (entry) return resolve(pkgDir, entry);
    return resolve(pkgDir, "index.js");
  }

  return resolve(pkgDir, subpath);
}
