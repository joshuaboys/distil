import { readFile } from "fs/promises";
import { resolve } from "path";
import type { ModuleInfo } from "../types/ast.js";
import type { ProjectCallGraph } from "../types/callgraph.js";
import type { CFGInfo, DFGInfo, PDGInfo } from "../types/index.js";
import type { AnalysisScope, ContentHash, Language } from "../types/common.js";
import { computeContentHash } from "../types/common.js";
import { createObservation, createScope, languageFromPathOrFallback } from "./observations.js";
import type { KindlingAdapter, ObservationKind } from "./types.js";
import type { DistilStoreConfig } from "./config.js";
import { resolveProjectId } from "./config.js";

export const DISTIL_SUBKINDS = {
  astModule: "distil.ast.module",
  callGraph: "distil.callgraph.project",
  cfg: "distil.cfg.function",
  dfg: "distil.dfg.function",
  pdg: "distil.pdg.function",
  fileHash: "distil.file.hash",
} as const;

export class DistilStore {
  private readonly projectId: string | undefined;
  private readonly projectRoot: string | undefined;

  constructor(
    private readonly adapter: KindlingAdapter,
    config: DistilStoreConfig = {},
  ) {
    this.projectRoot = config.projectRoot;
    this.projectId = config.projectId ?? resolveProjectId(config.projectRoot);
  }

  createScope(input: { filePath?: string; symbolName?: string }): AnalysisScope {
    return createScope({
      ...(this.projectId != null && { projectId: this.projectId }),
      ...(this.projectRoot != null && { projectRoot: this.projectRoot }),
      ...(input.filePath != null && { filePath: input.filePath }),
      ...(input.symbolName != null && { symbolName: input.symbolName }),
    });
  }

  async computeFileHash(filePath: string): Promise<ContentHash> {
    const absPath = resolve(filePath);
    const source = await readFile(absPath, "utf-8");
    return computeContentHash(source);
  }

  async getCachedAST(filePath: string, contentHash?: ContentHash): Promise<ModuleInfo | null> {
    return this.getCachedByScope<ModuleInfo>({
      kind: "code.symbol",
      subkind: DISTIL_SUBKINDS.astModule,
      scope: this.createScope({ filePath }),
      ...(contentHash != null && { contentHash }),
    });
  }

  async cacheAST(
    filePath: string,
    moduleInfo: ModuleInfo,
    contentHash?: ContentHash,
  ): Promise<void> {
    const scope = this.createScope({ filePath });
    const language = languageFromPathOrFallback(filePath, "typescript");
    await this.writeObservation({
      kind: "code.symbol",
      subkind: DISTIL_SUBKINDS.astModule,
      scope,
      language,
      payload: moduleInfo,
      ...(contentHash != null && { contentHash }),
    });
  }

  async getCachedCallGraph(): Promise<ProjectCallGraph | null> {
    return this.getCachedByScope<ProjectCallGraph>({
      kind: "code.callgraph",
      subkind: DISTIL_SUBKINDS.callGraph,
      scope: this.createScope({}),
    });
  }

  async cacheCallGraph(graph: ProjectCallGraph, language: Language): Promise<void> {
    await this.writeObservation({
      kind: "code.callgraph",
      subkind: DISTIL_SUBKINDS.callGraph,
      scope: this.createScope({}),
      language,
      payload: graph,
    });
  }

  async getCachedCFG(
    filePath: string,
    functionName: string,
    contentHash?: ContentHash,
  ): Promise<CFGInfo | null> {
    return this.getCachedByScope<CFGInfo>({
      kind: "code.flow.control",
      subkind: DISTIL_SUBKINDS.cfg,
      scope: this.createScope({ filePath, symbolName: functionName }),
      ...(contentHash != null && { contentHash }),
    });
  }

  async cacheCFG(
    filePath: string,
    functionName: string,
    cfg: CFGInfo,
    contentHash?: ContentHash,
  ): Promise<void> {
    const scope = this.createScope({ filePath, symbolName: functionName });
    const language = languageFromPathOrFallback(filePath, "typescript");
    await this.writeObservation({
      kind: "code.flow.control",
      subkind: DISTIL_SUBKINDS.cfg,
      scope,
      language,
      payload: cfg,
      ...(contentHash != null && { contentHash }),
    });
  }

  async getCachedDFG(
    filePath: string,
    functionName: string,
    contentHash?: ContentHash,
  ): Promise<DFGInfo | null> {
    return this.getCachedByScope<DFGInfo>({
      kind: "code.flow.data",
      subkind: DISTIL_SUBKINDS.dfg,
      scope: this.createScope({ filePath, symbolName: functionName }),
      ...(contentHash != null && { contentHash }),
    });
  }

  async cacheDFG(
    filePath: string,
    functionName: string,
    dfg: DFGInfo,
    contentHash?: ContentHash,
  ): Promise<void> {
    const scope = this.createScope({ filePath, symbolName: functionName });
    const language = languageFromPathOrFallback(filePath, "typescript");
    await this.writeObservation({
      kind: "code.flow.data",
      subkind: DISTIL_SUBKINDS.dfg,
      scope,
      language,
      payload: dfg,
      ...(contentHash != null && { contentHash }),
    });
  }

  async getCachedPDG(
    filePath: string,
    functionName: string,
    contentHash?: ContentHash,
  ): Promise<PDGInfo | null> {
    return this.getCachedByScope<PDGInfo>({
      kind: "code.dependence",
      subkind: DISTIL_SUBKINDS.pdg,
      scope: this.createScope({ filePath, symbolName: functionName }),
      ...(contentHash != null && { contentHash }),
    });
  }

  async cachePDG(
    filePath: string,
    functionName: string,
    pdg: PDGInfo,
    contentHash?: ContentHash,
  ): Promise<void> {
    const scope = this.createScope({ filePath, symbolName: functionName });
    const language = languageFromPathOrFallback(filePath, "typescript");
    await this.writeObservation({
      kind: "code.dependence",
      subkind: DISTIL_SUBKINDS.pdg,
      scope,
      language,
      payload: pdg,
      ...(contentHash != null && { contentHash }),
    });
  }

  private async getCachedByScope<T>(input: {
    kind: ObservationKind;
    subkind: string;
    scope: AnalysisScope;
    contentHash?: ContentHash;
  }): Promise<T | null> {
    const results = await this.adapter.query({
      kind: input.kind,
      scope: input.scope,
      subkind: input.subkind,
      limit: 1,
    });
    const candidate = results[0];
    if (!candidate) return null;
    if (input.contentHash && candidate.contentHash) {
      if (
        candidate.contentHash.algorithm !== input.contentHash.algorithm ||
        candidate.contentHash.hash !== input.contentHash.hash
      ) {
        return null;
      }
    }
    if (candidate.meta.subkind !== input.subkind) return null;
    return candidate.meta.payload as T;
  }

  private async writeObservation(input: {
    kind: ObservationKind;
    subkind: string;
    scope: AnalysisScope;
    language: Language;
    payload: unknown;
    contentHash?: ContentHash;
  }): Promise<void> {
    const observation = createObservation({
      kind: input.kind,
      scope: input.scope,
      language: input.language,
      subkind: input.subkind,
      payload: input.payload,
      ...(input.contentHash != null && { contentHash: input.contentHash }),
    });
    await this.adapter.write([observation]);
  }
}
