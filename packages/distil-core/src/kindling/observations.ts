import { isAbsolute, relative } from "path";
import type { AnalysisScope, ContentHash, Language } from "../types/common.js";
import { getLanguageFromPath } from "../types/common.js";
import type { DistilObservation, ObservationKind } from "./types.js";

export const DISTIL_SCHEMA_VERSION = "1" as const;

export interface ScopeInput {
  projectId?: string;
  projectRoot?: string;
  filePath?: string;
  symbolName?: string;
}

export function createScope(input: ScopeInput): AnalysisScope {
  const scope: AnalysisScope = {};
  if (input.projectId) {
    scope.projectId = input.projectId;
  }
  if (input.filePath) {
    scope.filePath = normalizeFilePath(input.projectRoot, input.filePath);
  }
  if (input.symbolName) {
    scope.symbolName = input.symbolName;
  }
  return scope;
}

export interface ObservationInput {
  kind: ObservationKind;
  scope: AnalysisScope;
  language: Language;
  subkind: string;
  payload: unknown;
  contentHash?: ContentHash;
}

export function createObservation(input: ObservationInput): DistilObservation {
  const observation: DistilObservation = {
    kind: input.kind,
    scope: input.scope,
    meta: {
      producer: "distil",
      subkind: input.subkind,
      language: input.language,
      schemaVersion: DISTIL_SCHEMA_VERSION,
      payload: input.payload,
    },
  };
  if (input.contentHash != null) {
    observation.contentHash = input.contentHash;
  }
  return observation;
}

export function languageFromPathOrFallback(filePath: string | undefined, fallback: Language) {
  if (!filePath) return fallback;
  const detected = getLanguageFromPath(filePath);
  return detected ?? fallback;
}

function normalizeFilePath(projectRoot: string | undefined, filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (!projectRoot) return normalized;
  if (!isAbsolute(normalized)) return normalized;
  const rel = relative(projectRoot, normalized);
  return rel.replace(/\\/g, "/");
}
