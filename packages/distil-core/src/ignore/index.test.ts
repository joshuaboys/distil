import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCallGraph } from "../index.js";
import { createIgnoreMatcher, findNearestDistilignore, isIgnoredPath } from "./index.js";

const tempRoots: string[] = [];

async function createTempProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "distil-ignore-test-"));
  tempRoots.push(root);
  return root;
}

describe("ignore", () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map(async (root) => {
        try {
          await rm(root, { recursive: true, force: true });
        } catch {
          // Ignore cleanup failures in tests.
        }
      }),
    );
  });

  it("finds nearest .distilignore while walking up from target path", async () => {
    const root = await createTempProject();
    const nested = join(root, "src", "feature");
    await mkdir(nested, { recursive: true });
    const ignorePath = join(root, ".distilignore");
    await writeFile(ignorePath, "generated/\n", "utf-8");

    const found = await findNearestDistilignore(join(nested, "file.ts"));
    expect(found).toBe(ignorePath);
  });

  it("supports comments and negation patterns", async () => {
    const root = await createTempProject();
    await mkdir(join(root, "generated"), { recursive: true });
    await writeFile(
      join(root, ".distilignore"),
      ["# Ignore all generated files", "generated/*", "!generated/keep.ts"].join("\n"),
      "utf-8",
    );

    const matcher = await createIgnoreMatcher(root);
    expect(matcher.ignores(join(root, "generated", "drop.ts"))).toBe(true);
    expect(matcher.ignores(join(root, "generated", "keep.ts"))).toBe(false);
  });

  it("merges built-in ignores with .distilignore patterns", async () => {
    const root = await createTempProject();
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "node_modules"), { recursive: true });
    await writeFile(join(root, ".distilignore"), "src/ignored.ts\n", "utf-8");
    await writeFile(join(root, "src", "keep.ts"), "export function keep() {}\n", "utf-8");
    await writeFile(join(root, "src", "ignored.ts"), "export function skip() {}\n", "utf-8");
    await writeFile(
      join(root, "node_modules", "ignored.ts"),
      "export function dependency() {}\n",
      "utf-8",
    );

    const graph = await buildCallGraph(root);
    const files = graph.files.map((file) => file.replace(root + "/", ""));
    expect(files).toContain("src/keep.ts");
    expect(files).not.toContain("src/ignored.ts");
    expect(files).not.toContain("node_modules/ignored.ts");
  });

  it("disables ignore behavior when useIgnore=false", async () => {
    const root = await createTempProject();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, ".distilignore"), "src/ignored.ts\n", "utf-8");
    const target = join(root, "src", "ignored.ts");
    await writeFile(target, "export function ignored() {}\n", "utf-8");

    expect(await isIgnoredPath(target)).toBe(true);
    expect(await isIgnoredPath(target, { useIgnore: false })).toBe(false);

    const graph = await buildCallGraph(root, { useIgnore: false });
    const files = graph.files.map((file) => file.replace(root + "/", ""));
    expect(files).toContain("src/ignored.ts");
  });
});
