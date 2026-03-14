/**
 * Configuration file support
 *
 * Loads .distil/config.json from the project root, walking up from the
 * starting directory.
 */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import type { OutputFormat } from "../format/index.js";

export interface DistilConfig {
  /** Default output format */
  defaultFormat?: OutputFormat;
  /** Default depth for impact analysis */
  defaultDepth?: number;
  /** Default max edges for calls command */
  defaultLimit?: number;
}

/** Load config from .distil/config.json, walking up from startPath */
export async function loadConfig(startPath: string): Promise<DistilConfig> {
  let dir = startPath;

  // Walk up looking for .distil/config.json
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const configPath = join(dir, ".distil", "config.json");
    try {
      const content = await readFile(configPath, "utf-8");
      const parsed: unknown = JSON.parse(content);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as DistilConfig;
      }
      return {};
    } catch {
      // File not found or invalid — try parent
    }

    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  return {};
}

/** Get config value with CLI option override */
export function getConfigValue<K extends keyof DistilConfig>(
  config: DistilConfig,
  key: K,
  cliValue?: DistilConfig[K],
): DistilConfig[K] {
  if (cliValue !== undefined) return cliValue;
  return config[key];
}
