/**
 * TypeScript parser tests
 */

import { describe, it, expect } from "vitest";
import { TypeScriptParser } from "./typescript.js";

describe("TypeScriptParser", () => {
  const parser = new TypeScriptParser();

  describe("canHandle", () => {
    it("should handle TypeScript files", () => {
      expect(parser.canHandle("file.ts")).toBe(true);
      expect(parser.canHandle("file.tsx")).toBe(true);
    });

    it("should handle JavaScript files", () => {
      expect(parser.canHandle("file.js")).toBe(true);
      expect(parser.canHandle("file.jsx")).toBe(true);
      expect(parser.canHandle("file.mjs")).toBe(true);
      expect(parser.canHandle("file.cjs")).toBe(true);
    });

    it("should not handle other files", () => {
      expect(parser.canHandle("file.py")).toBe(false);
      expect(parser.canHandle("file.rs")).toBe(false);
    });
  });

  describe("extractAST", () => {
    it("should extract function declarations", async () => {
      const source = `
        function hello(name: string): string {
          return \`Hello, \${name}!\`;
        }
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0]?.name).toBe("hello");
      expect(result.functions[0]?.params).toHaveLength(1);
      expect(result.functions[0]?.params[0]?.name).toBe("name");
      expect(result.functions[0]?.params[0]?.type).toBe("string");
      expect(result.functions[0]?.returnType).toBe("string");
    });

    it("should extract async functions", async () => {
      const source = `
        async function fetchData(url: string): Promise<Data> {
          return await fetch(url);
        }
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0]?.isAsync).toBe(true);
    });

    it("should extract class declarations", async () => {
      const source = `
        class User {
          name: string;
          
          constructor(name: string) {
            this.name = name;
          }
          
          greet(): string {
            return \`Hello, \${this.name}\`;
          }
        }
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result.classes).toHaveLength(1);
      expect(result.classes[0]?.name).toBe("User");
      expect(result.classes[0]?.methods.length).toBeGreaterThan(0);
    });

    it("should extract imports", async () => {
      const source = `
        import { readFile } from 'fs';
        import path from 'path';
        import * as utils from './utils';
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result.imports).toHaveLength(3);
      expect(result.imports[0]?.module).toBe("fs");
      expect(result.imports[1]?.module).toBe("path");
      expect(result.imports[2]?.module).toBe("./utils");
    });

    it("should extract exports", async () => {
      const source = `
        export function publicFunc() {}
        export default function defaultFunc() {}
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result.functions).toHaveLength(2);
      expect(result.functions[0]?.isExported).toBe(true);
      expect(result.functions[1]?.exportType).toBe("default");
    });
  });

  describe("nested arrow functions", () => {
    it("should attribute calls inside nested arrows to the enclosing function", async () => {
      const source = `
        function outer() {
          const first = () => {
            const second = () => helper();
            second();
          };
          first();
        }

        function helper() {
          return 1;
        }
      `;
      const calls = await parser.extractCalls(source, "test.ts");

      expect(calls.get("outer")).toContain("helper");
      expect(calls.get("outer")).toContain("second");
      expect(calls.get("outer")).toContain("first");
    });
  });

  describe("complex destructuring parameters", () => {
    it("should parse functions with destructured params without failing", async () => {
      const source = `
        function configure(
          { host, auth: { token } }: { host: string; auth: { token: string } },
          [retryCount, delay = 1000]: [number, number],
          options: { verbose: boolean }
        ): void {
          console.log(host, token, retryCount, delay, options.verbose);
        }
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0]?.name).toBe("configure");
      expect(result.functions[0]?.params).toHaveLength(1);
      expect(result.functions[0]?.params[0]?.name).toBe("options");
      expect(result.functions[0]?.params[0]?.type).toBe("{ verbose: boolean }");
      expect(result.functions[0]?.returnType).toBe("void");
    });
  });

  describe("optional chaining call extraction", () => {
    it("should extract calls from optional chaining member calls", async () => {
      const source = `
        function run(foo?: { bar: () => void }) {
          foo?.bar();
        }
      `;
      const calls = await parser.extractCalls(source, "test.ts");

      expect(calls.get("run")).toContain("bar");
    });
  });

  describe("generator functions", () => {
    it("should extract generator function declarations", async () => {
      const source = `
        function* sequence(limit: number): Generator<number, void, unknown> {
          let i = 0;
          while (i < limit) {
            yield i;
            i++;
          }
        }
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0]?.name).toBe("sequence");
      expect(result.functions[0]?.isGenerator).toBe(true);
      expect(result.functions[0]?.returnType).toBe("Generator<number, void, unknown>");
    });
  });

  describe("decorated class methods", () => {
    it("should extract method signatures when decorators are present", async () => {
      const source = `
        class Service {
          @logged
          fetch(id: string): Promise<string> {
            return Promise.resolve(id);
          }
        }
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result.classes).toHaveLength(1);
      expect(result.classes[0]?.name).toBe("Service");
      expect(result.classes[0]?.methods).toHaveLength(1);
      expect(result.classes[0]?.methods[0]?.name).toBe("fetch");
      expect(result.classes[0]?.methods[0]?.returnType).toBe("Promise<string>");
    });
  });

  describe("interface parsing", () => {
    it("should extract interface extends, methods, and properties", async () => {
      const source = `
        interface Reader extends BaseReader, Serializable<string> {
          readonly id: string;
          title?: string;
          read(path: string): Promise<string>;
        }
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result.interfaces).toHaveLength(1);
      expect(result.interfaces[0]?.name).toBe("Reader");
      expect(result.interfaces[0]?.extends).toEqual(["BaseReader", "Serializable<string>"]);
      expect(result.interfaces[0]?.methods).toHaveLength(1);
      expect(result.interfaces[0]?.methods[0]?.name).toBe("read");
      expect(result.interfaces[0]?.methods[0]?.params[0]?.name).toBe("path");
      expect(result.interfaces[0]?.methods[0]?.params[0]?.type).toBe("string");
      expect(result.interfaces[0]?.methods[0]?.returnType).toBe("Promise<string>");
      expect(result.interfaces[0]?.properties).toHaveLength(2);
      expect(result.interfaces[0]?.properties[0]?.name).toBe("id");
      expect(result.interfaces[0]?.properties[0]?.isReadonly).toBe(true);
      expect(result.interfaces[0]?.properties[0]?.isOptional).toBe(false);
      expect(result.interfaces[0]?.properties[1]?.name).toBe("title");
      expect(result.interfaces[0]?.properties[1]?.isReadonly).toBe(false);
      expect(result.interfaces[0]?.properties[1]?.isOptional).toBe(true);
    });
  });

  describe("exported interfaces", () => {
    it("should mark exported interfaces as exported", async () => {
      const source = `
        export interface PublicContract {
          execute(): void;
        }
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result.interfaces).toHaveLength(1);
      expect(result.interfaces[0]?.name).toBe("PublicContract");
      expect(result.interfaces[0]?.isExported).toBe(true);
      expect(result.exports).toHaveLength(1);
      expect(result.exports[0]?.name).toBe("PublicContract");
      expect(result.exports[0]?.isTypeOnly).toBe(true);
    });
  });

  describe("type alias parsing", () => {
    it("should extract type alias names and definitions", async () => {
      const source = `
        type UserID = string | number;
        export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result.typeAliases).toHaveLength(2);
      expect(result.typeAliases[0]?.name).toBe("UserID");
      expect(result.typeAliases[0]?.definition).toBe("string | number");
      expect(result.typeAliases[0]?.isExported).toBe(false);
      expect(result.typeAliases[1]?.name).toBe("Result");
      expect(result.typeAliases[1]?.definition).toBe(
        "{ ok: true; value: T } | { ok: false; error: string }",
      );
      expect(result.typeAliases[1]?.isExported).toBe(true);
    });
  });

  describe("extractCalls", () => {
    it("should extract function calls", async () => {
      const source = `
        function main() {
          helper();
          process();
        }

        class User {
          greet() {
            helper();
          }
        }

        function helper() {
          console.log('help');
        }

        function process() {
          helper();
        }
      `;
      const calls = await parser.extractCalls(source, "test.ts");

      expect(calls.get("main")).toContain("helper");
      expect(calls.get("main")).toContain("process");
      expect(calls.get("process")).toContain("helper");
      expect(calls.get("User.greet")).toContain("helper");
    });
  });

  describe("extractCFG", () => {
    it("should extract CFG for a simple function", async () => {
      const source = `
        function add(a: number, b: number): number {
          return a + b;
        }
      `;
      const cfg = await parser.extractCFG(source, "add", "test.ts");

      expect(cfg).not.toBeNull();
      expect(cfg?.functionName).toBe("add");
      expect(cfg?.blocks.length).toBeGreaterThan(0);
      expect(cfg?.cyclomaticComplexity).toBeGreaterThanOrEqual(1);
    });

    it("should calculate complexity for if statements", async () => {
      const source = `
        function check(x: number): string {
          if (x > 0) {
            return 'positive';
          } else if (x < 0) {
            return 'negative';
          } else {
            return 'zero';
          }
        }
      `;
      const cfg = await parser.extractCFG(source, "check", "test.ts");

      expect(cfg).not.toBeNull();
      expect(cfg?.decisionPoints).toBe(2); // Two if conditions
      // Minimum complexity is 1, should be at least 1 for any function
      expect(cfg?.cyclomaticComplexity).toBeGreaterThanOrEqual(1);
      // Should have multiple branches
      expect(cfg?.blocks.length).toBeGreaterThan(2);
    });

    it("should handle loops", async () => {
      const source = `
        function sum(arr: number[]): number {
          let total = 0;
          for (const n of arr) {
            total += n;
          }
          return total;
        }
      `;
      const cfg = await parser.extractCFG(source, "sum", "test.ts");

      expect(cfg).not.toBeNull();
      expect(cfg?.decisionPoints).toBeGreaterThan(0);
      // Check for back edge (loop)
      const backEdge = cfg?.edges.find((e) => e.isBackEdge);
      expect(backEdge).toBeDefined();
    });

    it("should extract CFG for class methods", async () => {
      const source = `
        class Calculator {
          add(a: number, b: number): number {
            return a + b;
          }
        }
      `;
      const cfg = await parser.extractCFG(source, "Calculator.add", "test.ts");

      expect(cfg).not.toBeNull();
      expect(cfg?.functionName).toBe("Calculator.add");
    });
  });

  describe("extractDFG", () => {
    it("should extract DFG for a simple function", async () => {
      const source = `
        function multiply(a: number, b: number): number {
          const result = a * b;
          return result;
        }
      `;
      const dfg = await parser.extractDFG(source, "multiply", "test.ts");

      expect(dfg).not.toBeNull();
      expect(dfg?.functionName).toBe("multiply");
      expect(dfg?.parameters.length).toBe(2);
      expect(dfg?.variables).toContain("a");
      expect(dfg?.variables).toContain("b");
      expect(dfg?.variables).toContain("result");
    });

    it("should track def-use chains", async () => {
      const source = `
        function process(x: number): number {
          let y = x + 1;
          let z = y * 2;
          return z;
        }
      `;
      const dfg = await parser.extractDFG(source, "process", "test.ts");

      expect(dfg).not.toBeNull();
      // Should have edges from x to y definition, y to z definition
      expect(dfg?.edges.length).toBeGreaterThan(0);
    });

    it("should extract DFG for class methods", async () => {
      const source = `
        class Counter {
          count(n: number): number {
            let sum = 0;
            for (let i = 0; i < n; i++) {
              sum += i;
            }
            return sum;
          }
        }
      `;
      const dfg = await parser.extractDFG(source, "Counter.count", "test.ts");

      expect(dfg).not.toBeNull();
      expect(dfg?.functionName).toBe("Counter.count");
      expect(dfg?.variables).toContain("n");
      expect(dfg?.variables).toContain("sum");
      expect(dfg?.variables).toContain("i");
    });
  });

  describe("extractPDG", () => {
    it("should extract PDG combining CFG and DFG", async () => {
      const source = `
        function compute(x: number): number {
          let result = 0;
          if (x > 0) {
            result = x * 2;
          } else {
            result = x * -1;
          }
          return result;
        }
      `;
      const pdg = await parser.extractPDG(source, "compute", "test.ts");

      expect(pdg).not.toBeNull();
      expect(pdg?.functionName).toBe("compute");
      expect(pdg?.nodes.length).toBeGreaterThan(0);
      expect(pdg?.edges.length).toBeGreaterThan(0);
      expect(pdg?.controlEdgeCount).toBeGreaterThan(0);
      expect(pdg?.dataEdgeCount).toBeGreaterThan(0);
    });

    it("should support backward slicing", async () => {
      const source = `
        function slice(a: number, b: number): number {
          let x = a + 1;
          let y = b + 2;
          let z = x + y;
          return z;
        }
      `;
      const pdg = await parser.extractPDG(source, "slice", "test.ts");

      expect(pdg).not.toBeNull();
      // Find return line dynamically
      const lines = source.split("\n");
      const returnLine = lines.findIndex((l) => l.includes("return z")) + 1;
      // Slice from the return line should include z, x, y definitions
      const sliceLines = pdg?.backwardSlice(returnLine);
      expect(sliceLines?.size).toBeGreaterThan(0);
    });

    it("should support forward slicing", async () => {
      const source = `
        function forward(input: number): number {
          let a = input;
          let b = a * 2;
          let c = b + 1;
          return c;
        }
      `;
      const pdg = await parser.extractPDG(source, "forward", "test.ts");

      expect(pdg).not.toBeNull();
      // Find input line dynamically
      const lines = source.split("\n");
      const inputLine = lines.findIndex((l) => l.includes("let a = input")) + 1;
      // Forward slice from input should include dependent lines
      const sliceLines = pdg?.forwardSlice(inputLine);
      expect(sliceLines?.size).toBeGreaterThan(0);
    });
  });

  describe("default parameter values", () => {
    it("should parse functions with default parameters", async () => {
      const source = `
        function createUser(name: string, role = "user", active: boolean = true) {
          return { name, role, active };
        }
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0]?.name).toBe("createUser");
    });
  });

  describe("rest parameters", () => {
    it("should parse functions with rest parameters", async () => {
      const source = `
        function merge(...items: string[]): string {
          return items.join("");
        }
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result.functions).toHaveLength(1);
    });
  });

  describe("arrow function styles", () => {
    it("should not crash on expression-body arrow functions", async () => {
      const source = `
        const add = (a: number, b: number): number => a + b;
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result).toBeDefined();
    });
  });

  describe("enum declarations", () => {
    it("should not crash on enum declarations", async () => {
      const source = `
        enum Direction {
          Up = "UP",
          Down = "DOWN",
          Left = "LEFT",
          Right = "RIGHT",
        }
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result).toBeDefined();
    });
  });

  describe("namespace declarations", () => {
    it("should not crash on namespace declarations", async () => {
      const source = `
        namespace Validation {
          export interface StringValidator {
            isAcceptable(s: string): boolean;
          }
          export function validate(s: string): boolean {
            return s.length > 0;
          }
        }
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result).toBeDefined();
    });
  });

  describe("try-catch-finally in CFG", () => {
    it("should produce CFG blocks for try-catch-finally", async () => {
      const source = `
        function safeParse(input: string): unknown {
          try {
            return JSON.parse(input);
          } catch (e) {
            console.error(e);
            return null;
          } finally {
            console.log("done");
          }
        }
      `;
      const cfg = await parser.extractCFG(source, "safeParse", "test.ts");

      expect(cfg).not.toBeNull();
      expect(cfg?.blocks.length).toBeGreaterThan(2);
    });
  });

  describe("switch statement in CFG", () => {
    it("should report decision points for switch cases", async () => {
      const source = `
        function describe(x: number): string {
          switch (x) {
            case 1: return "one";
            case 2: return "two";
            case 3: return "three";
            default: return "other";
          }
        }
      `;
      const cfg = await parser.extractCFG(source, "describe", "test.ts");

      expect(cfg).not.toBeNull();
      expect(cfg?.decisionPoints).toBeGreaterThanOrEqual(3);
    });
  });

  describe("closures in DFG", () => {
    it("should track closed-over variables", async () => {
      const source = `
        function makeCounter(): () => number {
          let count = 0;
          return () => { count++; return count; };
        }
      `;
      const dfg = await parser.extractDFG(source, "makeCounter", "test.ts");

      expect(dfg).not.toBeNull();
      expect(dfg?.variables).toContain("count");
    });
  });

  describe("re-exports", () => {
    it("should not crash on re-export statements", async () => {
      const source = `
        export { readFile } from "fs/promises";
        export * from "./utils";
      `;
      const result = await parser.extractAST(source, "test.ts");

      expect(result).toBeDefined();
    });
  });
});
