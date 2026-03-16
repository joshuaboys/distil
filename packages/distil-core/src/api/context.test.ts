/**
 * Tests for context generation API (CORE-009)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { getRelevantContext } from "./context.js";

describe("getRelevantContext", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "distil-context-test-"));

    // Create fixture files with function relationships
    await mkdir(join(tmpDir, "src"), { recursive: true });

    await writeFile(
      join(tmpDir, "src", "auth.ts"),
      `
export function validateToken(token: string): boolean {
  const decoded = decodeToken(token);
  return decoded !== null;
}

function decodeToken(token: string): string | null {
  if (token.length === 0) {
    return null;
  }
  return token;
}

export function login(username: string, password: string): boolean {
  const token = createToken(username);
  return validateToken(token);
}

function createToken(username: string): string {
  return username + "_token";
}
`,
    );

    await writeFile(
      join(tmpDir, "src", "handler.ts"),
      `
import { login } from './auth';

export function handleRequest(req: { user: string; pass: string }): string {
  const ok = login(req.user, req.pass);
  if (ok) {
    return "success";
  }
  return "fail";
}
`,
    );

    // Create .distilignore to skip node_modules etc.
    await writeFile(join(tmpDir, ".distilignore"), "node_modules\n");
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("should return context for a target function", async () => {
    const result = await getRelevantContext(tmpDir, "validateToken");

    expect(result.target).toBeDefined();
    expect(result.target.name).toBe("validateToken");
    expect(result.target.isExported).toBe(true);
    expect(result.target.params.length).toBeGreaterThan(0);
    expect(result.target.params[0]?.name).toBe("token");
  });

  it("should include callers and callees", async () => {
    const result = await getRelevantContext(tmpDir, "validateToken");

    // validateToken calls decodeToken
    expect(result.target.callees).toContain("decodeToken");

    // validateToken is called by login
    expect(result.target.callers).toContain("login");
  });

  it("should include related functions", async () => {
    const result = await getRelevantContext(tmpDir, "validateToken");

    const relatedNames = result.related.map((r) => r.name);
    // Should include direct callers/callees
    expect(relatedNames).toContain("decodeToken");
    expect(relatedNames).toContain("login");
  });

  it("should respect depth option", async () => {
    // depth: 0 means no traversal, only the target
    const shallow = await getRelevantContext(tmpDir, "validateToken", {
      depth: 0,
    });
    expect(shallow.related).toHaveLength(0);

    // depth: 1 gets immediate callers/callees
    const medium = await getRelevantContext(tmpDir, "validateToken", {
      depth: 1,
    });
    const mediumNames = medium.related.map((r) => r.name);
    expect(mediumNames).toContain("decodeToken");
    expect(mediumNames).toContain("login");
  });

  it("should respect maxFunctions option", async () => {
    const result = await getRelevantContext(tmpDir, "validateToken", {
      maxFunctions: 2,
      depth: 3,
    });

    // target + 1 related max
    expect(result.related.length).toBeLessThanOrEqual(1);
    expect(result.summary.totalFunctions).toBeLessThanOrEqual(2);
  });

  it("should include complexity when includeCFG is true", async () => {
    const result = await getRelevantContext(tmpDir, "validateToken", {
      includeCFG: true,
      includeDFG: false,
    });

    expect(result.target.complexity).toBeDefined();
    expect(typeof result.target.complexity).toBe("number");
    expect(result.target.complexityRating).toBeDefined();
    expect(["low", "medium", "high", "very_high"]).toContain(
      result.target.complexityRating,
    );
  });

  it("should include variables when includeDFG is true", async () => {
    const result = await getRelevantContext(tmpDir, "validateToken", {
      includeCFG: false,
      includeDFG: true,
    });

    expect(result.target.variables).toBeDefined();
    expect(Array.isArray(result.target.variables)).toBe(true);
  });

  it("should exclude complexity when includeCFG is false", async () => {
    const result = await getRelevantContext(tmpDir, "validateToken", {
      includeCFG: false,
      includeDFG: false,
    });

    expect(result.target.complexity).toBeUndefined();
    expect(result.target.complexityRating).toBeUndefined();
  });

  it("should exclude variables when includeDFG is false", async () => {
    const result = await getRelevantContext(tmpDir, "validateToken", {
      includeCFG: false,
      includeDFG: false,
    });

    expect(result.target.variables).toBeUndefined();
  });

  it("should throw for non-existent function", async () => {
    await expect(
      getRelevantContext(tmpDir, "nonExistentFunction"),
    ).rejects.toThrow("Function not found: nonExistentFunction");
  });

  it("should populate summary correctly", async () => {
    const result = await getRelevantContext(tmpDir, "validateToken");

    expect(result.summary.totalFunctions).toBeGreaterThanOrEqual(1);
    expect(result.summary.totalFiles).toBeGreaterThanOrEqual(1);
    expect(result.summary.maxComplexity).toBeGreaterThanOrEqual(1);
  });

  it("should include signature and return type", async () => {
    const result = await getRelevantContext(tmpDir, "validateToken", {
      includeCFG: false,
      includeDFG: false,
    });

    expect(result.target.signature).toContain("validateToken");
    expect(result.target.returnType).toBe("boolean");
  });
});
