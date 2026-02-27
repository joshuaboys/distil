import { basename, resolve } from "path";

export interface DistilStoreConfig {
  projectId?: string;
  projectRoot?: string;
}

export function resolveProjectId(projectRoot: string | undefined): string | undefined {
  if (!projectRoot) return undefined;
  const resolved = resolve(projectRoot);
  return basename(resolved);
}
