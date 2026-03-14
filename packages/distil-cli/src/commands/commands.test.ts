import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  getParserMock: vi.fn(),
  extractAstMock: vi.fn(),
  buildCallGraphMock: vi.fn(),
  extractCFGMock: vi.fn(),
  extractDFGMock: vi.fn(),
  extractPDGMock: vi.fn(),
  isIgnoredPathMock: vi.fn(),
  createIgnoreMatcherMock: vi.fn(),
  getComplexityRatingMock: vi.fn(),
  findCallersMock: vi.fn(),
  isBuiltinMethodMock: vi.fn(),
}));

vi.mock("@distil/core", () => ({
  VERSION: "0.1.0",
  LANGUAGE_EXTENSIONS: { ".ts": "typescript", ".js": "javascript" },
  getParser: coreMocks.getParserMock,
  buildCallGraph: coreMocks.buildCallGraphMock,
  extractCFG: coreMocks.extractCFGMock,
  extractDFG: coreMocks.extractDFGMock,
  extractPDG: coreMocks.extractPDGMock,
  isIgnoredPath: coreMocks.isIgnoredPathMock,
  createIgnoreMatcher: coreMocks.createIgnoreMatcherMock,
  getComplexityRating: coreMocks.getComplexityRatingMock,
  findCallers: coreMocks.findCallersMock,
  isBuiltinMethod: coreMocks.isBuiltinMethodMock,
}));

import { createProgram } from "../index.js";

const tempRoots: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "distil-cmd-test-"));
  tempRoots.push(dir);
  return dir;
}

describe("CLI command tests (mock-based)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    coreMocks.isIgnoredPathMock.mockResolvedValue(false);
    coreMocks.getComplexityRatingMock.mockReturnValue("low");
    coreMocks.findCallersMock.mockReturnValue([]);
    coreMocks.isBuiltinMethodMock.mockReturnValue(false);
    coreMocks.createIgnoreMatcherMock.mockResolvedValue({
      basePath: "/tmp/project",
      ignoreFilePath: null,
      ignores: () => false,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const mock of Object.values(coreMocks)) {
      mock.mockClear();
    }
    await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("extract --json calls getParser and extractAST", async () => {
    const root = await createTempDir();
    const filePath = join(root, "sample.ts");
    await writeFile(filePath, "export function hello() {}", "utf-8");

    coreMocks.getParserMock.mockReturnValue({
      extractAST: coreMocks.extractAstMock,
    });
    coreMocks.extractAstMock.mockResolvedValue({
      toCompact: () => ({}),
      toJSON: () => ({ filePath: "sample.ts", functions: [] }),
      filePath: "sample.ts",
      language: "typescript",
      docstring: null,
      imports: [],
      functions: [],
      classes: [],
      interfaces: [],
      typeAliases: [],
    });

    const program = createProgram();
    await program.parseAsync(["node", "distil", "extract", filePath, "--json"]);

    expect(coreMocks.getParserMock).toHaveBeenCalledWith(filePath);
    expect(coreMocks.extractAstMock).toHaveBeenCalled();
  });

  it("extract --compact uses compact output", async () => {
    const root = await createTempDir();
    const filePath = join(root, "sample.ts");
    await writeFile(filePath, "export function hello() {}", "utf-8");

    coreMocks.getParserMock.mockReturnValue({
      extractAST: coreMocks.extractAstMock,
    });
    coreMocks.extractAstMock.mockResolvedValue({
      toCompact: () => ({}),
      toJSON: () => ({}),
      filePath: "sample.ts",
      language: "typescript",
      docstring: null,
      imports: [],
      functions: [],
      classes: [],
      interfaces: [],
      typeAliases: [],
    });

    const program = createProgram();
    await program.parseAsync(["node", "distil", "extract", filePath, "--compact"]);

    // Compact output prints relative file path as first line
    expect(logSpy).toHaveBeenCalled();
    expect(coreMocks.extractAstMock).toHaveBeenCalled();
  });

  it("calls --json calls buildCallGraph with correct path", async () => {
    const root = await createTempDir();

    coreMocks.buildCallGraphMock.mockResolvedValue({
      projectRoot: root,
      files: [],
      builtAt: new Date().toISOString(),
      functions: new Map(),
      edges: [],
      forwardIndex: new Map(),
      backwardIndex: new Map(),
    });

    const program = createProgram();
    await program.parseAsync(["node", "distil", "calls", root, "--json"]);

    expect(coreMocks.buildCallGraphMock).toHaveBeenCalledWith(root, { useIgnore: true });
  });

  it("impact --json calls buildCallGraph, output has target/callers", async () => {
    const root = await createTempDir();

    const targetFn = {
      name: "myFunc",
      qualifiedName: "myFunc",
      file: join(root, "src/index.ts"),
      line: 10,
      kind: "function",
    };

    const functions = new Map([["myFunc", targetFn]]);

    coreMocks.buildCallGraphMock.mockResolvedValue({
      projectRoot: root,
      files: ["src/index.ts"],
      builtAt: new Date().toISOString(),
      functions,
      edges: [],
      forwardIndex: new Map(),
      backwardIndex: new Map(),
    });

    const program = createProgram();
    await program.parseAsync(["node", "distil", "impact", "myFunc", root, "--json"]);

    expect(coreMocks.buildCallGraphMock).toHaveBeenCalled();

    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("target");
    expect(parsed).toHaveProperty("callers");
    expect(parsed.target.name).toBe("myFunc");
  });

  it("cfg --json calls extractCFG with file and function", async () => {
    const root = await createTempDir();
    const filePath = join(root, "sample.ts");
    await writeFile(filePath, "function test() { return 1; }", "utf-8");

    coreMocks.getParserMock.mockReturnValue({
      extractAST: vi.fn().mockResolvedValue({
        functions: [{ name: "test" }],
        classes: [],
      }),
    });

    coreMocks.extractCFGMock.mockResolvedValue({
      functionName: "test",
      blocks: [],
      edges: [],
      cyclomaticComplexity: 1,
      maxNestingDepth: 0,
      decisionPoints: 0,
      toJSON: () => ({}),
    });

    const program = createProgram();
    await program.parseAsync(["node", "distil", "cfg", filePath, "test", "--json"]);

    expect(coreMocks.extractCFGMock).toHaveBeenCalledWith(filePath, "test");
  });

  it("dfg --json calls extractDFG with file and function", async () => {
    const root = await createTempDir();
    const filePath = join(root, "sample.ts");
    await writeFile(filePath, "function test() { return 1; }", "utf-8");

    coreMocks.getParserMock.mockReturnValue({
      extractAST: vi.fn().mockResolvedValue({
        functions: [{ name: "test" }],
        classes: [],
      }),
    });

    coreMocks.extractDFGMock.mockResolvedValue({
      functionName: "test",
      variables: [],
      parameters: [],
      refs: [],
      edges: [],
      returns: [],
      toJSON: () => ({}),
    });

    const program = createProgram();
    await program.parseAsync(["node", "distil", "dfg", filePath, "test", "--json"]);

    expect(coreMocks.extractDFGMock).toHaveBeenCalledWith(filePath, "test");
  });

  it("slice --json calls extractPDG, default backward slice", async () => {
    const root = await createTempDir();
    const filePath = join(root, "sample.ts");
    await writeFile(filePath, "function test() {\n  const x = 1;\n  return x;\n}", "utf-8");

    coreMocks.getParserMock.mockReturnValue({
      extractAST: vi.fn().mockResolvedValue({
        functions: [{ name: "test" }],
        classes: [],
      }),
    });

    coreMocks.extractPDGMock.mockResolvedValue({
      functionName: "test",
      nodes: [],
      edges: [],
      controlEdgeCount: 0,
      dataEdgeCount: 0,
      cfg: { blocks: [] },
      backwardSlice: () => new Set([3]),
      forwardSlice: () => new Set([3, 4]),
      toJSON: () => ({}),
    });

    const program = createProgram();
    await program.parseAsync(["node", "distil", "slice", filePath, "test", "3", "--json"]);

    expect(coreMocks.extractPDGMock).toHaveBeenCalledWith(filePath, "test");

    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.direction).toBe("backward");
    expect(parsed.lines).toEqual([3]);
  });

  // NOTE: --var test must come BEFORE --forward test because Commander's
  // boolean flags persist on module-level singleton commands across parseAsync calls.
  // Once --forward is set, it stays true for subsequent calls.
  it("slice --var passes variable to slice", async () => {
    const root = await createTempDir();
    const filePath = join(root, "sample.ts");
    await writeFile(filePath, "function test() {\n  const x = 1;\n  return x;\n}", "utf-8");

    coreMocks.getParserMock.mockReturnValue({
      extractAST: vi.fn().mockResolvedValue({
        functions: [{ name: "test" }],
        classes: [],
      }),
    });

    const backwardSliceMock = vi.fn().mockReturnValue(new Set([2, 3]));
    coreMocks.extractPDGMock.mockResolvedValue({
      functionName: "test",
      nodes: [],
      edges: [],
      controlEdgeCount: 0,
      dataEdgeCount: 0,
      cfg: { blocks: [] },
      backwardSlice: backwardSliceMock,
      forwardSlice: () => new Set([3, 4]),
      toJSON: () => ({}),
    });

    const program = createProgram();
    await program.parseAsync([
      "node",
      "distil",
      "slice",
      filePath,
      "test",
      "3",
      "--var",
      "x",
      "--json",
    ]);

    expect(backwardSliceMock).toHaveBeenCalledWith(3, "x");

    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.criterion.variable).toBe("x");
  });

  it("slice --forward computes forward slice", async () => {
    const root = await createTempDir();
    const filePath = join(root, "sample.ts");
    await writeFile(filePath, "function test() {\n  const x = 1;\n  return x;\n}", "utf-8");

    coreMocks.getParserMock.mockReturnValue({
      extractAST: vi.fn().mockResolvedValue({
        functions: [{ name: "test" }],
        classes: [],
      }),
    });

    coreMocks.extractPDGMock.mockResolvedValue({
      functionName: "test",
      nodes: [],
      edges: [],
      controlEdgeCount: 0,
      dataEdgeCount: 0,
      cfg: { blocks: [] },
      backwardSlice: () => new Set([3]),
      forwardSlice: () => new Set([3, 4]),
      toJSON: () => ({}),
    });

    const program = createProgram();
    await program.parseAsync([
      "node",
      "distil",
      "slice",
      filePath,
      "test",
      "3",
      "--forward",
      "--json",
    ]);

    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.direction).toBe("forward");
    expect(parsed.lines).toEqual([3, 4]);
  });
});

describe("CLI command integration smoke tests", () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const CLI_ENTRY = join(__dirname, "..", "..", "dist", "index.js");

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("extract --json produces valid JSON with functions", async () => {
    const root = await createTempDir();
    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });
    const filePath = join(srcDir, "hello.ts");
    await writeFile(
      filePath,
      'export function greet(name: string): string {\n  return "hello " + name;\n}\n',
      "utf-8",
    );

    const output = execFileSync("node", [CLI_ENTRY, "extract", filePath, "--json"], {
      encoding: "utf-8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });

    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("functions");
    expect(parsed.functions.length).toBeGreaterThanOrEqual(1);
    expect(parsed.functions[0].name).toBe("greet");
  });

  it("tree --json produces valid JSON with directory structure", async () => {
    const root = await createTempDir();
    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, "index.ts"), "export const x = 1;\n", "utf-8");

    const output = execFileSync("node", [CLI_ENTRY, "tree", root, "--json"], {
      encoding: "utf-8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });

    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("type", "dir");
    expect(parsed).toHaveProperty("children");
    expect(parsed.children.length).toBeGreaterThanOrEqual(1);
  });
});
