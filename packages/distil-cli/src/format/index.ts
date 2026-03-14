/**
 * Output formatting utilities
 *
 * Provides format resolution and output formatting for CLI commands.
 */

export type OutputFormat = "text" | "json" | "compact";

export interface FormatOptions {
  format: OutputFormat;
  color?: boolean;
}

/** Resolve output format from CLI options */
export function resolveFormat(options: { json?: boolean; compact?: boolean }): OutputFormat {
  if (options.compact) return "compact";
  if (options.json) return "json";
  return "text";
}

/** Format an analysis result for output */
export function formatOutput(data: unknown, format: OutputFormat): string {
  switch (format) {
    case "json":
      return JSON.stringify(data, null, 2);
    case "compact":
      return formatCompact(data);
    case "text":
      return JSON.stringify(data, null, 2);
  }
}

function formatCompact(data: unknown): string {
  if (!data || typeof data !== "object") return String(data);

  if (Array.isArray(data)) {
    return data.map((item) => formatCompactItem(item)).join("\n");
  }

  return formatCompactItem(data);
}

function formatCompactItem(item: unknown): string {
  if (!item || typeof item !== "object") return String(item);

  const record = item as Record<string, unknown>;

  // Function-like: name(params): returnType
  if ("name" in record && "parameters" in record) {
    const params = Array.isArray(record.parameters)
      ? (record.parameters as Array<Record<string, unknown>>)
          .map((p) => {
            const type = p.type ? `: ${p.type}` : "";
            return `${p.name}${type}`;
          })
          .join(", ")
      : "";
    const ret = record.returnType ? `: ${record.returnType}` : "";
    const line = record.line ? ` [L${record.line}]` : "";
    return `${record.name}(${params})${ret}${line}`;
  }

  // Edge-like: caller -> callee
  if ("caller" in record && "callee" in record) {
    return `${record.caller} -> ${record.callee}`;
  }

  // Variable-like: name: type (def|use) at line
  if ("name" in record && "type" in record && "line" in record) {
    return `${record.name}: ${record.type} at L${record.line}`;
  }

  // Fall back to one-line JSON
  return JSON.stringify(item);
}
