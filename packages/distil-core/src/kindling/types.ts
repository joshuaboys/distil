import type { AnalysisScope, ContentHash, Language } from "../types/common.js";

export type ObservationKind =
  | "code.symbol"
  | "code.reference"
  | "code.callgraph"
  | "code.flow.control"
  | "code.flow.data"
  | "code.dependence"
  | "analysis.metric";

export interface DistilObservationMeta {
  producer: "distil";
  subkind: string;
  language: Language;
  schemaVersion: "1";
  payload: unknown;
}

export interface DistilObservation {
  kind: ObservationKind;
  scope: AnalysisScope;
  contentHash?: ContentHash;
  meta: DistilObservationMeta;
  createdAt?: string;
}

export interface DistilObservationQuery {
  kind?: ObservationKind;
  scope?: AnalysisScope;
  subkind?: string;
  limit?: number;
}

export interface KindlingAdapter {
  write(observations: DistilObservation[]): Promise<void>;
  query(query: DistilObservationQuery): Promise<DistilObservation[]>;
}
