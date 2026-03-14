import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { detectWorkspace, parsePnpmWorkspaceYaml } from "./detect.js";
import { resolvePackageImport } from "./resolver.js";
import type { WorkspaceInfo } from "./detect.js";

const tempRoots: string[] = [];

async function createTempDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "distil-workspace-test-"));
  tempRoots.push(root);
  return root;
}

async function writePackageJson(
  dir: string,
  pkg: Record<string, unknown>,
): Promise<void> {
  await writeFile(join(dir, "package.json"), JSON.stringify(pkg, null, 2), "utf-8");
}

describe("workspace detection", () => {
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

  it("detects pnpm workspace", async () => {
    const root = await createTempDir();

    await writeFile(
      join(root, "pnpm-workspace.yaml"),
      'packages:\n  - "packages/*"\n',
      "utf-8",
    );
    await writePackageJson(root, { name: "my-monorepo", private: true });

    const pkgDir = join(root, "packages", "utils");
    await mkdir(pkgDir, { recursive: true });
    await writePackageJson(pkgDir, { name: "@myorg/utils", version: "1.0.0" });

    const result = await detectWorkspace(root);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("pnpm");
    expect(result!.root).toBe(root);
    expect(result!.packages).toHaveLength(1);
    expect(result!.packages[0]!.name).toBe("@myorg/utils");
    expect(result!.packages[0]!.path).toBe(pkgDir);
    expect(result!.packages[0]!.version).toBe("1.0.0");
  });

  it("detects npm workspace from package.json workspaces array", async () => {
    const root = await createTempDir();

    await writePackageJson(root, {
      name: "my-npm-monorepo",
      private: true,
      workspaces: ["packages/*"],
    });

    const pkgA = join(root, "packages", "pkg-a");
    const pkgB = join(root, "packages", "pkg-b");
    await mkdir(pkgA, { recursive: true });
    await mkdir(pkgB, { recursive: true });
    await writePackageJson(pkgA, { name: "pkg-a", version: "1.0.0" });
    await writePackageJson(pkgB, { name: "pkg-b", version: "2.0.0" });

    const result = await detectWorkspace(root);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("npm");
    expect(result!.root).toBe(root);
    expect(result!.packages).toHaveLength(2);
    expect(result!.packages.map((p) => p.name)).toEqual(["pkg-a", "pkg-b"]);
  });

  it("detects yarn workspace when yarn.lock is present", async () => {
    const root = await createTempDir();

    await writePackageJson(root, {
      name: "my-yarn-monorepo",
      private: true,
      workspaces: ["packages/*"],
    });
    await writeFile(join(root, "yarn.lock"), "", "utf-8");

    const pkgDir = join(root, "packages", "ui");
    await mkdir(pkgDir, { recursive: true });
    await writePackageJson(pkgDir, { name: "@myorg/ui", version: "0.1.0" });

    const result = await detectWorkspace(root);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("yarn");
  });

  it("detects lerna workspace", async () => {
    const root = await createTempDir();

    await writeFile(
      join(root, "lerna.json"),
      JSON.stringify({ packages: ["packages/*"], version: "independent" }),
      "utf-8",
    );
    await writePackageJson(root, { name: "my-lerna-monorepo", private: true });

    const pkgDir = join(root, "packages", "core");
    await mkdir(pkgDir, { recursive: true });
    await writePackageJson(pkgDir, { name: "@myorg/core", version: "3.0.0" });

    const result = await detectWorkspace(root);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("lerna");
    expect(result!.packages).toHaveLength(1);
    expect(result!.packages[0]!.name).toBe("@myorg/core");
  });

  it("returns null for non-monorepo directory", async () => {
    const root = await createTempDir();
    await writePackageJson(root, { name: "plain-project", version: "1.0.0" });

    const result = await detectWorkspace(root);
    expect(result).toBeNull();
  });

  it("walks up from a subdirectory to find workspace root", async () => {
    const root = await createTempDir();

    await writeFile(
      join(root, "pnpm-workspace.yaml"),
      'packages:\n  - "packages/*"\n',
      "utf-8",
    );
    await writePackageJson(root, { name: "monorepo", private: true });

    const pkgDir = join(root, "packages", "app");
    const nestedDir = join(pkgDir, "src", "components");
    await mkdir(nestedDir, { recursive: true });
    await writePackageJson(pkgDir, { name: "@myorg/app", version: "1.0.0" });

    const result = await detectWorkspace(nestedDir);
    expect(result).not.toBeNull();
    expect(result!.root).toBe(root);
    expect(result!.type).toBe("pnpm");
  });

  it("handles multiple glob patterns", async () => {
    const root = await createTempDir();

    await writeFile(
      join(root, "pnpm-workspace.yaml"),
      'packages:\n  - "packages/*"\n  - "apps/*"\n',
      "utf-8",
    );
    await writePackageJson(root, { name: "monorepo", private: true });

    const pkgDir = join(root, "packages", "lib");
    const appDir = join(root, "apps", "web");
    await mkdir(pkgDir, { recursive: true });
    await mkdir(appDir, { recursive: true });
    await writePackageJson(pkgDir, { name: "@myorg/lib", version: "1.0.0" });
    await writePackageJson(appDir, { name: "@myorg/web", version: "1.0.0" });

    const result = await detectWorkspace(root);
    expect(result).not.toBeNull();
    expect(result!.packages).toHaveLength(2);
    expect(result!.packages.map((p) => p.name).sort()).toEqual(["@myorg/lib", "@myorg/web"]);
  });

  it("skips directories without package.json", async () => {
    const root = await createTempDir();

    await writeFile(
      join(root, "pnpm-workspace.yaml"),
      'packages:\n  - "packages/*"\n',
      "utf-8",
    );
    await writePackageJson(root, { name: "monorepo", private: true });

    const validPkg = join(root, "packages", "valid");
    const noPkgJson = join(root, "packages", "no-pkg");
    await mkdir(validPkg, { recursive: true });
    await mkdir(noPkgJson, { recursive: true });
    await writePackageJson(validPkg, { name: "@myorg/valid", version: "1.0.0" });
    // no-pkg has no package.json

    const result = await detectWorkspace(root);
    expect(result).not.toBeNull();
    expect(result!.packages).toHaveLength(1);
    expect(result!.packages[0]!.name).toBe("@myorg/valid");
  });
});

describe("parsePnpmWorkspaceYaml", () => {
  it("parses simple patterns", () => {
    const yaml = 'packages:\n  - "packages/*"\n  - "apps/*"\n';
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(["packages/*", "apps/*"]);
  });

  it("handles unquoted patterns", () => {
    const yaml = "packages:\n  - packages/*\n  - apps/*\n";
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(["packages/*", "apps/*"]);
  });

  it("handles single-quoted patterns", () => {
    const yaml = "packages:\n  - 'packages/*'\n";
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(["packages/*"]);
  });

  it("returns empty array for missing packages key", () => {
    const yaml = "shamefully-hoist: true\n";
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual([]);
  });
});

describe("resolvePackageImport", () => {
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

  it("resolves a workspace package import to its entry point", async () => {
    const root = await createTempDir();
    const pkgDir = join(root, "packages", "utils");
    await mkdir(pkgDir, { recursive: true });
    await writePackageJson(pkgDir, {
      name: "@myorg/utils",
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
    });

    const workspace: WorkspaceInfo = {
      type: "pnpm",
      root,
      packages: [{ name: "@myorg/utils", path: pkgDir, version: "1.0.0" }],
    };

    const resolved = resolvePackageImport("@myorg/utils", workspace);
    expect(resolved).toBe(join(pkgDir, "dist", "index.d.ts"));
  });

  it("resolves using exports map", async () => {
    const root = await createTempDir();
    const pkgDir = join(root, "packages", "core");
    await mkdir(pkgDir, { recursive: true });
    await writePackageJson(pkgDir, {
      name: "@myorg/core",
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
        },
      },
    });

    const workspace: WorkspaceInfo = {
      type: "pnpm",
      root,
      packages: [{ name: "@myorg/core", path: pkgDir }],
    };

    const resolved = resolvePackageImport("@myorg/core", workspace);
    expect(resolved).toBe(join(pkgDir, "dist", "index.d.ts"));
  });

  it("returns null for non-workspace imports", () => {
    const workspace: WorkspaceInfo = {
      type: "pnpm",
      root: "/tmp/fake",
      packages: [{ name: "@myorg/utils", path: "/tmp/fake/packages/utils" }],
    };

    const resolved = resolvePackageImport("lodash", workspace);
    expect(resolved).toBeNull();
  });

  it("resolves string export entries", async () => {
    const root = await createTempDir();
    const pkgDir = join(root, "packages", "simple");
    await mkdir(pkgDir, { recursive: true });
    await writePackageJson(pkgDir, {
      name: "simple-pkg",
      exports: {
        ".": "./src/index.ts",
      },
    });

    const workspace: WorkspaceInfo = {
      type: "npm",
      root,
      packages: [{ name: "simple-pkg", path: pkgDir }],
    };

    const resolved = resolvePackageImport("simple-pkg", workspace);
    expect(resolved).toBe(join(pkgDir, "src", "index.ts"));
  });
});
