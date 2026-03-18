import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  buildCallGraphMock: vi.fn(),
  createIgnoreMatcherMock: vi.fn(),
  isIgnoredPathMock: vi.fn(),
  extractAstMock: vi.fn(),
}));

vi.mock("@distil/core", () => ({
  VERSION: "0.1.0",
  LANGUAGE_EXTENSIONS: { ".ts": "typescript", ".js": "javascript" },
  buildCallGraph: coreMocks.buildCallGraphMock,
  createIgnoreMatcher: coreMocks.createIgnoreMatcherMock,
  extractCFG: vi.fn(),
  extractDFG: vi.fn(),
  extractPDG: vi.fn(),
  getComplexityRating: vi.fn(() => "low"),
  getParser: vi.fn(() => ({ extractAST: coreMocks.extractAstMock })),
  isIgnoredPath: coreMocks.isIgnoredPathMock,
}));

import { createProgram } from "./index.js";

const tempRoots: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "distil-cli-test-"));
  tempRoots.push(dir);
  return dir;
}

describe("CLI ignore integration", () => {
  beforeEach(() => {
    coreMocks.buildCallGraphMock.mockResolvedValue({
      projectRoot: "/tmp/project",
      files: [],
      builtAt: new Date().toISOString(),
      functions: new Map(),
      edges: [],
      forwardIndex: new Map(),
      backwardIndex: new Map(),
    });
    coreMocks.createIgnoreMatcherMock.mockResolvedValue({
      basePath: "/tmp/project",
      ignoreFilePath: null,
      ignores: () => false,
    });
    coreMocks.isIgnoredPathMock.mockResolvedValue(false);
    coreMocks.extractAstMock.mockResolvedValue({
      toCompact: () => ({}),
      toJSON: () => ({}),
      filePath: "file.ts",
      language: "typescript",
      docstring: null,
      imports: [],
      functions: [],
      classes: [],
      interfaces: [],
      typeAliases: [],
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("passes useIgnore=true to calls by default", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "distil", "calls", ".", "--json"]);

    expect(coreMocks.buildCallGraphMock).toHaveBeenCalledWith(expect.any(String), {
      useIgnore: true,
    });
  });

  it("passes useIgnore=false to calls with --no-ignore", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "distil", "--no-ignore", "calls", ".", "--json"]);

    expect(coreMocks.buildCallGraphMock).toHaveBeenCalledWith(expect.any(String), {
      useIgnore: false,
    });
  });

  it("passes useIgnore=false to tree matcher with --no-ignore", async () => {
    const root = await createTempDir();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "export const x = 1;\n", "utf-8");

    const program = createProgram();
    await program.parseAsync(["node", "distil", "--no-ignore", "tree", root, "--json"]);

    expect(coreMocks.createIgnoreMatcherMock).toHaveBeenCalledWith(expect.any(String), {
      useIgnore: false,
    });
  });
});
