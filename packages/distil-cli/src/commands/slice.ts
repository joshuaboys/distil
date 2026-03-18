/**
 * Slice command
 *
 * Computes program slice from a line (L5).
 */

import { Command } from "commander";
import { resolve } from "path";
import { readFile } from "fs/promises";
import { extractPDG, isIgnoredPath } from "@distil/core";
import type { PDGInfo } from "@distil/core";
import { resolveCliIgnoreOptions } from "../ignore.js";
import { checkFileExists, listAvailableFunctions, fuzzyMatchFunction } from "./helpers.js";

export const sliceCommand = new Command("slice")
  .description("Compute program slice from a line (L5)")
  .argument("<file>", "Source file path")
  .argument("<function>", "Function name (or Class.method)")
  .argument("<line>", "Line number for slice criterion")
  .option("--var <variable>", "Variable name for slice criterion")
  .option("--forward", "Compute forward slice (default: backward)")
  .option("--json", "Output as JSON")
  .action(
    async (
      file: string,
      functionName: string,
      lineStr: string,
      options: { var?: string; forward?: boolean; json?: boolean },
      cmd: Command,
    ) => {
      try {
        const filePath = resolve(file);
        await checkFileExists(filePath, file);
        const ignoreOptions = resolveCliIgnoreOptions(cmd);
        const ignored = await isIgnoredPath(filePath, ignoreOptions);
        if (ignored) {
          console.error(`File is ignored: ${file}. Use --no-ignore to analyze ignored files.`);
          process.exit(1);
        }

        const line = parseInt(lineStr, 10);
        if (Number.isNaN(line) || line < 1) {
          console.error("Line number must be a positive integer");
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

        const pdg = await extractPDG(filePath, targetFunction);

        if (!pdg) {
          console.error(`Function "${targetFunction}" not found in ${file}`);
          process.exit(1);
        }

        // Check if line is within function range (compute from CFG blocks)
        const blocks = pdg.cfg.blocks;
        if (blocks.length > 0) {
          const minLine = Math.min(...blocks.map((b) => b.lines[0]));
          const maxLine = Math.max(...blocks.map((b) => b.lines[1]));
          if (line < minLine || line > maxLine) {
            console.error(
              `Warning: Line ${line} is outside function range (${minLine}-${maxLine})`,
            );
          }
        }

        const sliceLines = options.forward
          ? pdg.forwardSlice(line, options.var)
          : pdg.backwardSlice(line, options.var);

        // Read source file for context
        const source = await readFile(filePath, "utf-8");
        const sourceLines = source.split("\n");

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                function: targetFunction,
                file,
                criterion: { line, variable: options.var ?? null },
                direction: options.forward ? "forward" : "backward",
                lines: Array.from(sliceLines).sort((a, b) => a - b),
                lineCount: sliceLines.size,
              },
              null,
              2,
            ),
          );
          return;
        }

        printSlice(
          pdg,
          sliceLines,
          sourceLines,
          line,
          options.var ?? null,
          options.forward ?? false,
          file,
        );
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    },
  );

function printSlice(
  pdg: PDGInfo,
  sliceLines: Set<number>,
  sourceLines: string[],
  criterionLine: number,
  variable: string | null,
  isForward: boolean,
  file: string,
): void {
  const direction = isForward ? "Forward" : "Backward";
  const varStr = variable ? ` on '${variable}'` : "";

  console.log(`\n${direction} Slice${varStr}`);
  console.log(`   File: ${file}`);
  console.log(`   Function: ${pdg.functionName}`);
  console.log(`   Criterion: Line ${criterionLine}`);
  console.log("-".repeat(50));

  const sortedLines = Array.from(sliceLines).sort((a, b) => a - b);

  console.log(`\nSlice (${sortedLines.length} lines):\n`);

  for (const lineNum of sortedLines) {
    const lineIdx = lineNum - 1;
    const sourceLine = sourceLines[lineIdx] ?? "";
    const marker = lineNum === criterionLine ? ">>>" : "   ";
    const lineStr = String(lineNum).padStart(4, " ");
    console.log(`${marker} ${lineStr} | ${sourceLine}`);
  }

  console.log(`\nSummary:`);
  console.log(`   Total lines in slice: ${sortedLines.length}`);
  console.log(`   PDG nodes: ${pdg.nodes.length}`);
  console.log(`   Control dependencies: ${pdg.controlEdgeCount}`);
  console.log(`   Data dependencies: ${pdg.dataEdgeCount}`);
  console.log("");
}
