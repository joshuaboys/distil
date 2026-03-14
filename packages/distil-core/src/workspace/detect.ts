import { readFile, readdir, stat } from "fs/promises";
import { basename, dirname, join, resolve } from "path";

export type WorkspaceType = "pnpm" | "npm" | "yarn" | "lerna";

export interface WorkspaceInfo {
  type: WorkspaceType;
  root: string;
  packages: WorkspacePackage[];
}

export interface WorkspacePackage {
  name: string;
  path: string;
  version?: string | undefined;
}

/** Detect monorepo workspace from a directory (walks up to find root). */
export async function detectWorkspace(startPath: string): Promise<WorkspaceInfo | null> {
  const absPath = resolve(startPath);
  let current = absPath;

  // Walk up looking for workspace config files
  while (true) {
    const result = await detectAt(current);
    if (result) return result;

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

async function detectAt(dir: string): Promise<WorkspaceInfo | null> {
  // Check pnpm-workspace.yaml first (most specific signal)
  const pnpmResult = await detectPnpm(dir);
  if (pnpmResult) return pnpmResult;

  // Check lerna.json
  const lernaResult = await detectLerna(dir);
  if (lernaResult) return lernaResult;

  // Check package.json workspaces field (npm/yarn)
  const npmResult = await detectNpmYarn(dir);
  if (npmResult) return npmResult;

  return null;
}

async function detectPnpm(dir: string): Promise<WorkspaceInfo | null> {
  const yamlPath = join(dir, "pnpm-workspace.yaml");
  const content = await readFileSafe(yamlPath);
  if (content === null) return null;

  const patterns = parsePnpmWorkspaceYaml(content);
  if (patterns.length === 0) return null;

  const packages = await resolveWorkspacePackages(dir, patterns);
  return { type: "pnpm", root: dir, packages };
}

async function detectLerna(dir: string): Promise<WorkspaceInfo | null> {
  const lernaPath = join(dir, "lerna.json");
  const content = await readFileSafe(lernaPath);
  if (content === null) return null;

  let lernaConfig: { packages?: string[] };
  try {
    lernaConfig = JSON.parse(content) as { packages?: string[] };
  } catch {
    return null;
  }

  const patterns = lernaConfig.packages ?? ["packages/*"];
  const packages = await resolveWorkspacePackages(dir, patterns);
  return { type: "lerna", root: dir, packages };
}

async function detectNpmYarn(dir: string): Promise<WorkspaceInfo | null> {
  const pkgPath = join(dir, "package.json");
  const content = await readFileSafe(pkgPath);
  if (content === null) return null;

  let pkg: { workspaces?: string[] | { packages?: string[] } };
  try {
    pkg = JSON.parse(content) as { workspaces?: string[] | { packages?: string[] } };
  } catch {
    return null;
  }

  if (!pkg.workspaces) return null;

  // Yarn supports { packages: [...] } or flat array
  const patterns = Array.isArray(pkg.workspaces)
    ? pkg.workspaces
    : pkg.workspaces.packages ?? [];

  if (patterns.length === 0) return null;

  const packages = await resolveWorkspacePackages(dir, patterns);

  // Distinguish npm vs yarn by checking for yarn.lock
  const hasYarnLock = (await readFileSafe(join(dir, "yarn.lock"))) !== null;
  const type: WorkspaceType = hasYarnLock ? "yarn" : "npm";

  return { type, root: dir, packages };
}

/**
 * Parse pnpm-workspace.yaml without a yaml dependency.
 * Handles the simple format:
 * ```
 * packages:
 *   - "packages/*"
 *   - "apps/*"
 * ```
 */
export function parsePnpmWorkspaceYaml(content: string): string[] {
  const lines = content.split("\n");
  const patterns: string[] = [];
  let inPackages = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      continue;
    }

    if (inPackages) {
      // A non-indented, non-empty line means we left the packages block
      if (line.length > 0 && !line.startsWith(" ") && !line.startsWith("\t")) {
        break;
      }

      const match = line.match(/^\s+-\s+['"]?([^'"#]+?)['"]?\s*$/);
      if (match?.[1]) {
        patterns.push(match[1]);
      }
    }
  }

  return patterns;
}

/**
 * Resolve glob-like workspace patterns to actual packages.
 * Supports simple patterns like "packages/*" and "apps/*".
 * Does NOT support recursive globs or complex patterns — just single-level wildcards.
 */
async function resolveWorkspacePackages(
  root: string,
  patterns: string[],
): Promise<WorkspacePackage[]> {
  const packages: WorkspacePackage[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    const resolved = await resolvePattern(root, pattern);
    for (const pkg of resolved) {
      if (!seen.has(pkg.path)) {
        seen.add(pkg.path);
        packages.push(pkg);
      }
    }
  }

  packages.sort((a, b) => a.name.localeCompare(b.name));
  return packages;
}

async function resolvePattern(root: string, pattern: string): Promise<WorkspacePackage[]> {
  // If no wildcard, treat as a direct package path
  if (!pattern.includes("*")) {
    const pkgDir = resolve(root, pattern);
    const pkg = await readPackageAt(pkgDir);
    return pkg ? [pkg] : [];
  }

  // Split on "*" — only support single-level wildcard
  const starIndex = pattern.indexOf("*");
  const prefix = pattern.slice(0, starIndex);
  const suffix = pattern.slice(starIndex + 1);

  const parentDir = resolve(root, prefix);
  let entries: string[];
  try {
    entries = await readdir(parentDir);
  } catch {
    return [];
  }

  const results: WorkspacePackage[] = [];
  for (const entry of entries) {
    if (suffix && !entry.endsWith(suffix)) continue;

    const pkgDir = join(parentDir, entry);
    const dirStat = await statSafe(pkgDir);
    if (!dirStat?.isDirectory()) continue;

    const pkg = await readPackageAt(pkgDir);
    if (pkg) results.push(pkg);
  }

  return results;
}

async function readPackageAt(pkgDir: string): Promise<WorkspacePackage | null> {
  const pkgJsonPath = join(pkgDir, "package.json");
  const content = await readFileSafe(pkgJsonPath);
  if (content === null) return null;

  let pkg: { name?: string; version?: string };
  try {
    pkg = JSON.parse(content) as { name?: string; version?: string };
  } catch {
    return null;
  }

  const name = pkg.name ?? basename(pkgDir);
  const result: WorkspacePackage = { name, path: pkgDir };
  if (pkg.version !== undefined) {
    result.version = pkg.version;
  }
  return result;
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function statSafe(filePath: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}
