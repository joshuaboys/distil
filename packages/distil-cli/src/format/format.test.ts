import { describe, expect, it } from "vitest";
import { resolveFormat, formatOutput } from "./index.js";

describe("resolveFormat", () => {
  it("returns text by default", () => {
    expect(resolveFormat({})).toBe("text");
  });

  it("returns json when --json is set", () => {
    expect(resolveFormat({ json: true })).toBe("json");
  });

  it("returns compact when --compact is set", () => {
    expect(resolveFormat({ compact: true })).toBe("compact");
  });

  it("prefers compact over json when both are set", () => {
    expect(resolveFormat({ json: true, compact: true })).toBe("compact");
  });

  it("returns text when both are false", () => {
    expect(resolveFormat({ json: false, compact: false })).toBe("text");
  });
});

describe("formatOutput", () => {
  it("produces valid JSON for json format", () => {
    const data = { name: "test", value: 42 };
    const output = formatOutput(data, "json");
    expect(JSON.parse(output)).toEqual(data);
  });

  it("pretty-prints JSON with indentation", () => {
    const data = { a: 1 };
    const output = formatOutput(data, "json");
    expect(output).toContain("\n");
    expect(output).toBe(JSON.stringify(data, null, 2));
  });

  it("produces compact function format with name and parameters", () => {
    const data = {
      name: "add",
      parameters: [
        { name: "a", type: "number" },
        { name: "b", type: "number" },
      ],
      returnType: "number",
      line: 5,
    };
    const output = formatOutput(data, "compact");
    expect(output).toBe("add(a: number, b: number): number [L5]");
  });

  it("produces compact edge format with caller and callee", () => {
    const data = { caller: "foo", callee: "bar" };
    const output = formatOutput(data, "compact");
    expect(output).toBe("foo -> bar");
  });

  it("produces compact variable format", () => {
    const data = { name: "x", type: "def", line: 10 };
    const output = formatOutput(data, "compact");
    expect(output).toBe("x: def at L10");
  });

  it("handles arrays in compact format", () => {
    const data = [
      { caller: "a", callee: "b" },
      { caller: "c", callee: "d" },
    ];
    const output = formatOutput(data, "compact");
    expect(output).toBe("a -> b\nc -> d");
  });
});
