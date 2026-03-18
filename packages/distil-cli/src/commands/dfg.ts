/**
 * DFG command
 *
 * Extracts data flow graph for a function (L4).
 */

import { Command } from "commander";
import { resolve } from "path";
import { extractDFG, isIgnoredPath } from "@distil/core";
import type { DFGInfo } from "@distil/core";
import { resolveCliIgnoreOptions } from "../ignore.js";
import { checkFileExists, listAvailableFunctions, fuzzyMatchFunction } from "./helpers.js";

export const dfgCommand = new Command("dfg")
  .description("Extract data flow graph for a function (L4)")
  .argument("<file>", "Source file path")
  .argument("<function>", "Function name (or Class.method)")
  .option("--json", "Output as JSON")
  .action(async (file: string, functionName: string, options: { json?: boolean }, cmd: Command) => {
    try {
      const filePath = resolve(file);
      await checkFileExists(filePath, file);
      const ignoreOptions = resolveCliIgnoreOptions(cmd);
      const ignored = await isIgnoredPath(filePath, ignoreOptions);
      if (ignored) {
        console.error(`File is ignored: ${file}. Use --no-ignore to analyze ignored files.`);
        process.exit(1);
      }

      // Get available functions for fuzzy matching
      const available = await listAvailableFunctions(filePath);
      const matches = fuzzyMatchFunction(functionName, available);

      let targetFunction = functionName;
      if (matches.length === 0) {
        console.error(`Function "${functionName}" not found in ${file}`);
        if (available.length > 0) {
          console.error(`\nAvailable functions:`);
          for (const fn of available.slice(0, 15)) {
            console.error(`  ${fn}`);
          }
          if (available.length > 15) {
            console.error(`  ... and ${available.length - 15} more`);
          }
        }
        process.exit(1);
      } else if (matches.length > 1 && !matches.includes(functionName)) {
        console.error(`Multiple functions match "${functionName}":`);
        for (const fn of matches.slice(0, 10)) {
          console.error(`  ${fn}`);
        }
        process.exit(1);
      } else if (matches.length === 1) {
        targetFunction = matches[0]!;
      }

      const dfg = await extractDFG(filePath, targetFunction);

      if (!dfg) {
        console.error(`Function "${targetFunction}" not found in ${file}`);
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(dfg.toJSON(), null, 2));
        return;
      }

      printDFG(dfg, file);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

function printDFG(dfg: DFGInfo, file: string): void {
  console.log(`\nData Flow Graph: ${dfg.functionName}`);
  console.log(`   File: ${file}`);
  console.log("-".repeat(50));

  console.log(`\nVariables (${dfg.variables.length}):`);
  console.log(`   ${dfg.variables.join(", ")}`);

  console.log(`\nParameters (${dfg.parameters.length}):`);
  for (const param of dfg.parameters) {
    console.log(`   ${param.name} (L${param.line})`);
  }

  console.log(`\nReturns (${dfg.returns.length}):`);
  for (const ret of dfg.returns) {
    console.log(`   ${ret.name} (L${ret.line})`);
  }

  const defs = dfg.refs.filter((r) => r.type === "def" || r.type === "param");
  const uses = dfg.refs.filter((r) => r.type === "use");
  const updates = dfg.refs.filter((r) => r.type === "update");

  console.log(`\nReferences:`);
  console.log(`   Definitions: ${defs.length}`);
  console.log(`   Uses: ${uses.length}`);
  console.log(`   Updates: ${updates.length}`);

  console.log(`\nDef-Use Edges (${dfg.edges.length}):`);
  const edgesToShow = dfg.edges.slice(0, 15);
  for (const edge of edgesToShow) {
    const mayReach = edge.isMayReach ? " (may)" : "";
    console.log(`   ${edge.variable}: L${edge.def.line} -> L${edge.use.line}${mayReach}`);
  }
  if (dfg.edges.length > 15) {
    console.log(`   ... and ${dfg.edges.length - 15} more edges`);
  }

  console.log("");
}
