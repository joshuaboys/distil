/**
 * Built-in ignore patterns shared by core and CLI flows.
 */

export const BUILTIN_IGNORE_DIRS = [
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
] as const;

export const BUILTIN_IGNORE_FILES = [".DS_Store", "Thumbs.db", ".gitkeep"] as const;

/**
 * Preserve existing behavior of skipping hidden files/directories by default.
 */
const BUILTIN_HIDDEN_PATTERNS = [".*", "**/.*"];

export function getBuiltinIgnorePatterns(): string[] {
  const patterns = [...BUILTIN_HIDDEN_PATTERNS];

  for (const dir of BUILTIN_IGNORE_DIRS) {
    patterns.push(`${dir}/`, `**/${dir}/`);
  }
  for (const file of BUILTIN_IGNORE_FILES) {
    patterns.push(file, `**/${file}`);
  }

  return patterns;
}
