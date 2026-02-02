/**
 * Common types shared across all analysis layers
 */

/**
 * Supported programming languages
 */
export type Language = "typescript" | "javascript" | "python" | "rust" | "csharp";

/**
 * File extensions mapped to languages
 */
export const LANGUAGE_EXTENSIONS: Record<string, Language> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".pyi": "python",
  ".rs": "rust",
  ".cs": "csharp",
};

/**
 * Get language from file extension
 */
export function getLanguageFromPath(filePath: string): Language | null {
  const ext = filePath.slice(filePath.lastIndexOf("."));
  return LANGUAGE_EXTENSIONS[ext] ?? null;
}

/**
 * Source location in a file
 */
export interface SourceLocation {
  /** 1-based line number */
  line: number;
  /** 0-based column number */
  column: number;
}

/**
 * Range in source code
 */
export interface SourceRange {
  start: SourceLocation;
  end: SourceLocation;
}

/**
 * Scope for analysis results (matches Kindling scope)
 */
export interface AnalysisScope {
  /** Project/repo identifier */
  projectId?: string;
  /** File path relative to project root */
  filePath?: string;
  /** Function or class name */
  symbolName?: string;
}

/**
 * Content hash for dirty detection
 */
export interface ContentHash {
  algorithm: "sha256";
  hash: string;
}

/**
 * Compute SHA-256 hash of content
 */
export async function computeContentHash(content: string): Promise<ContentHash> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return { algorithm: "sha256", hash };
}
