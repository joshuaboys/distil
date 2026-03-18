/**
 * Performance benchmarks for Distil analysis layers (L1-L5)
 *
 * Measures extraction time across all analysis layers using
 * realistic TypeScript source fixtures of varying complexity.
 */

import { bench, describe } from "vitest";
import { TypeScriptParser } from "../parsers/typescript.js";

const parser = new TypeScriptParser();

// ---------------------------------------------------------------------------
// Fixtures — small, medium, large
// ---------------------------------------------------------------------------

const SMALL_SOURCE = `
function add(a: number, b: number): number {
  return a + b;
}

function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`;

const MEDIUM_SOURCE = `
interface Config {
  host: string;
  port: number;
  retries: number;
}

class ApiClient {
  private config: Config;
  private cache: Map<string, unknown>;

  constructor(config: Config) {
    this.config = config;
    this.cache = new Map();
  }

  async fetch(endpoint: string): Promise<unknown> {
    const key = \`\${this.config.host}:\${this.config.port}\${endpoint}\`;
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    const result = await this.doFetch(endpoint);
    this.cache.set(key, result);
    return result;
  }

  private async doFetch(endpoint: string): Promise<unknown> {
    let lastError: Error | null = null;
    for (let i = 0; i < this.config.retries; i++) {
      try {
        const response = await globalThis.fetch(
          \`http://\${this.config.host}:\${this.config.port}\${endpoint}\`
        );
        if (!response.ok) {
          throw new Error(\`HTTP \${response.status}\`);
        }
        return await response.json();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError ?? new Error("Unknown error");
  }

  clearCache(): void {
    this.cache.clear();
  }
}

function createClient(host: string, port: number): ApiClient {
  return new ApiClient({ host, port, retries: 3 });
}

export { ApiClient, createClient };
export type { Config };
`;

const LARGE_SOURCE = `
import { readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

interface TaskConfig {
  maxConcurrency: number;
  timeout: number;
  retries: number;
  backoffMs: number;
}

interface Task {
  id: string;
  name: string;
  priority: number;
  dependencies: string[];
  execute: () => Promise<unknown>;
}

class TaskScheduler {
  private tasks: Map<string, Task> = new Map();
  private completed: Set<string> = new Set();
  private running: Set<string> = new Set();
  private failed: Map<string, string> = new Map();
  private config: TaskConfig;
  private logger: Logger;

  constructor(config: TaskConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  addTask(task: Task): void {
    if (this.tasks.has(task.id)) {
      this.logger.warn(\`Task \${task.id} already exists, replacing\`);
    }
    this.tasks.set(task.id, task);
  }

  removeTask(id: string): boolean {
    if (this.running.has(id)) {
      this.logger.error(\`Cannot remove running task \${id}\`);
      return false;
    }
    return this.tasks.delete(id);
  }

  async run(): Promise<Result<Map<string, unknown>>> {
    const results = new Map<string, unknown>();
    const sorted = this.topologicalSort();

    if (!sorted) {
      return { ok: false, error: "Circular dependency detected" };
    }

    for (const batch of this.batchByDependencies(sorted)) {
      const batchPromises = batch.map(async (taskId) => {
        const task = this.tasks.get(taskId);
        if (!task) return;

        this.running.add(taskId);
        this.logger.info(\`Starting task \${task.name}\`);

        let lastError: string | null = null;
        for (let attempt = 0; attempt < this.config.retries; attempt++) {
          try {
            const result = await Promise.race([
              task.execute(),
              this.createTimeout(this.config.timeout),
            ]);
            results.set(taskId, result);
            this.completed.add(taskId);
            this.running.delete(taskId);
            this.logger.info(\`Completed task \${task.name}\`);
            return;
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            this.logger.warn(
              \`Task \${task.name} attempt \${attempt + 1} failed: \${lastError}\`
            );
            if (attempt < this.config.retries - 1) {
              await this.sleep(this.config.backoffMs * (attempt + 1));
            }
          }
        }

        this.running.delete(taskId);
        this.failed.set(taskId, lastError ?? "Unknown error");
        this.logger.error(\`Task \${task.name} failed after \${this.config.retries} attempts\`);
      });

      await Promise.all(batchPromises);
    }

    if (this.failed.size > 0) {
      const failedNames = Array.from(this.failed.entries())
        .map(([id, err]) => \`\${id}: \${err}\`)
        .join(", ");
      return { ok: false, error: \`Tasks failed: \${failedNames}\` };
    }

    return { ok: true, value: results };
  }

  private topologicalSort(): string[] | null {
    const visited = new Set<string>();
    const temp = new Set<string>();
    const order: string[] = [];

    const visit = (id: string): boolean => {
      if (temp.has(id)) return false;
      if (visited.has(id)) return true;

      temp.add(id);
      const task = this.tasks.get(id);
      if (task) {
        for (const dep of task.dependencies) {
          if (!visit(dep)) return false;
        }
      }
      temp.delete(id);
      visited.add(id);
      order.push(id);
      return true;
    };

    for (const id of this.tasks.keys()) {
      if (!visit(id)) return null;
    }

    return order;
  }

  private batchByDependencies(sorted: string[]): string[][] {
    const batches: string[][] = [];
    const assigned = new Set<string>();

    while (assigned.size < sorted.length) {
      const batch: string[] = [];
      for (const id of sorted) {
        if (assigned.has(id)) continue;
        const task = this.tasks.get(id);
        if (!task) continue;
        const depsReady = task.dependencies.every((d) => assigned.has(d));
        if (depsReady && batch.length < this.config.maxConcurrency) {
          batch.push(id);
        }
      }
      if (batch.length === 0) break;
      for (const id of batch) assigned.add(id);
      batches.push(batch);
    }

    return batches;
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Timeout")), ms);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStatus(): { total: number; completed: number; running: number; failed: number } {
    return {
      total: this.tasks.size,
      completed: this.completed.size,
      running: this.running.size,
      failed: this.failed.size,
    };
  }
}

async function loadTasksFromFile(path: string): Promise<Task[]> {
  const content = await readFile(resolve(path), "utf-8");
  const data = JSON.parse(content);
  return data.tasks;
}

async function saveResults(path: string, results: Map<string, unknown>): Promise<void> {
  const output = Object.fromEntries(results);
  await writeFile(join(resolve(path), "results.json"), JSON.stringify(output, null, 2));
}

function createDefaultConfig(): TaskConfig {
  return { maxConcurrency: 4, timeout: 30000, retries: 3, backoffMs: 1000 };
}

export { TaskScheduler, loadTasksFromFile, saveResults, createDefaultConfig };
export type { Task, TaskConfig, Result, Logger };
`;

// ---------------------------------------------------------------------------
// L1: AST extraction
// ---------------------------------------------------------------------------
describe("L1: AST extraction", () => {
  bench("small (2 functions)", async () => {
    await parser.extractAST(SMALL_SOURCE, "bench.ts");
  });

  bench("medium (class + 3 functions)", async () => {
    await parser.extractAST(MEDIUM_SOURCE, "bench.ts");
  });

  bench("large (class + 5 functions, ~180 lines)", async () => {
    await parser.extractAST(LARGE_SOURCE, "bench.ts");
  });
});

// ---------------------------------------------------------------------------
// L2: Call extraction
// ---------------------------------------------------------------------------
describe("L2: call extraction", () => {
  bench("small", async () => {
    await parser.extractCalls(SMALL_SOURCE, "bench.ts");
  });

  bench("medium", async () => {
    await parser.extractCalls(MEDIUM_SOURCE, "bench.ts");
  });

  bench("large", async () => {
    await parser.extractCalls(LARGE_SOURCE, "bench.ts");
  });
});

// ---------------------------------------------------------------------------
// L3: CFG extraction
// ---------------------------------------------------------------------------
describe("L3: CFG extraction", () => {
  bench("simple function (add)", async () => {
    await parser.extractCFG(SMALL_SOURCE, "add", "bench.ts");
  });

  bench("method with branching (doFetch)", async () => {
    await parser.extractCFG(MEDIUM_SOURCE, "ApiClient.doFetch", "bench.ts");
  });

  bench("complex method (TaskScheduler.run)", async () => {
    await parser.extractCFG(LARGE_SOURCE, "TaskScheduler.run", "bench.ts");
  });
});

// ---------------------------------------------------------------------------
// L4: DFG extraction
// ---------------------------------------------------------------------------
describe("L4: DFG extraction", () => {
  bench("simple function (add)", async () => {
    await parser.extractDFG(SMALL_SOURCE, "add", "bench.ts");
  });

  bench("method with branching (doFetch)", async () => {
    await parser.extractDFG(MEDIUM_SOURCE, "ApiClient.doFetch", "bench.ts");
  });

  bench("complex method (TaskScheduler.run)", async () => {
    await parser.extractDFG(LARGE_SOURCE, "TaskScheduler.run", "bench.ts");
  });
});

// ---------------------------------------------------------------------------
// L5: PDG extraction + slicing
// ---------------------------------------------------------------------------
describe("L5: PDG extraction", () => {
  bench("simple function (add)", async () => {
    await parser.extractPDG(SMALL_SOURCE, "add", "bench.ts");
  });

  bench("method with branching (doFetch)", async () => {
    await parser.extractPDG(MEDIUM_SOURCE, "ApiClient.doFetch", "bench.ts");
  });

  bench("complex method (TaskScheduler.run)", async () => {
    await parser.extractPDG(LARGE_SOURCE, "TaskScheduler.run", "bench.ts");
  });
});

// Precompute PDGs and slice targets outside benchmarks
const smallReturnLine =
  SMALL_SOURCE.split("\n").findIndex((l) => l.includes("return a + b")) + 1;
const largeReturnLine =
  LARGE_SOURCE.split("\n").findIndex((l) => l.includes("ok: true, value: results")) + 1;

let cachedSmallPDG: Awaited<ReturnType<typeof parser.extractPDG>> | null = null;
let cachedLargePDG: Awaited<ReturnType<typeof parser.extractPDG>> | null = null;

describe("L5: backward slicing", () => {
  bench("slice from return in simple function", async () => {
    if (!cachedSmallPDG) {
      cachedSmallPDG = await parser.extractPDG(SMALL_SOURCE, "add", "bench.ts");
    }
    cachedSmallPDG?.backwardSlice(smallReturnLine);
  });

  bench("slice from complex method", async () => {
    if (!cachedLargePDG) {
      cachedLargePDG = await parser.extractPDG(LARGE_SOURCE, "TaskScheduler.run", "bench.ts");
    }
    cachedLargePDG?.backwardSlice(largeReturnLine);
  });
});
