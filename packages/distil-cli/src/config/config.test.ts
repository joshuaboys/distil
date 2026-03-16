import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, getConfigValue } from "./index.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "distil-config-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("loadConfig", () => {
  it("returns empty object when no config file exists", async () => {
    const dir = await createTempDir();
    const config = await loadConfig(dir);
    expect(config).toEqual({});
  });

  it("reads .distil/config.json when present", async () => {
    const dir = await createTempDir();
    await mkdir(join(dir, ".distil"), { recursive: true });
    await writeFile(
      join(dir, ".distil", "config.json"),
      JSON.stringify({ defaultFormat: "compact", defaultDepth: 3 }),
      "utf-8",
    );

    const config = await loadConfig(dir);
    expect(config.defaultFormat).toBe("compact");
    expect(config.defaultDepth).toBe(3);
  });

  it("walks up to find config in parent directory", async () => {
    const root = await createTempDir();
    const nested = join(root, "a", "b", "c");
    await mkdir(nested, { recursive: true });
    await mkdir(join(root, ".distil"), { recursive: true });
    await writeFile(
      join(root, ".distil", "config.json"),
      JSON.stringify({ defaultLimit: 50 }),
      "utf-8",
    );

    const config = await loadConfig(nested);
    expect(config.defaultLimit).toBe(50);
  });

  it("returns empty object for invalid JSON", async () => {
    const dir = await createTempDir();
    await mkdir(join(dir, ".distil"), { recursive: true });
    await writeFile(join(dir, ".distil", "config.json"), "not json", "utf-8");

    const config = await loadConfig(dir);
    expect(config).toEqual({});
  });
});

describe("getConfigValue", () => {
  it("returns CLI override over config value", () => {
    const config = { defaultFormat: "compact" as const, defaultDepth: 3 };
    expect(getConfigValue(config, "defaultDepth", 5)).toBe(5);
  });

  it("returns config value when CLI value is undefined", () => {
    const config = { defaultFormat: "compact" as const, defaultDepth: 3 };
    expect(getConfigValue(config, "defaultDepth", undefined)).toBe(3);
  });

  it("returns undefined when neither config nor CLI value exists", () => {
    const config = {};
    expect(getConfigValue(config, "defaultDepth", undefined)).toBeUndefined();
  });
});
