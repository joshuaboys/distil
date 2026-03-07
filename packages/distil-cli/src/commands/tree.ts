/**
 * Tree command
 *
 * Shows file tree structure of a directory.
 */

import { Command } from "commander";
import { readdir } from "fs/promises";
import { resolve, join, relative } from "path";
import { createIgnoreMatcher, LANGUAGE_EXTENSIONS, type IgnoreMatcher } from "@distil/core";
import { resolveCliIgnoreOptions } from "../ignore.js";

export const treeCommand = new Command("tree")
  .description("Show file tree structure")
  .argument("[path]", "Directory to scan", ".")
  .option("--all", "Include all files (not just source files)")
  .option("--depth <n>", "Maximum depth", "10")
  .option("--json", "Output as JSON")
  .action(
    async (
      path: string,
      options: { all?: boolean; depth?: string; json?: boolean },
      cmd: Command,
    ) => {
      try {
        const rootPath = resolve(path);
        const maxDepth = parseInt(options.depth ?? "10", 10);
        const sourceOnly = !options.all;
        const ignoreOptions = resolveCliIgnoreOptions(cmd);
        const matcher = await createIgnoreMatcher(rootPath, ignoreOptions);
        const tree = await buildTree(rootPath, maxDepth, sourceOnly, matcher);

        if (options.json) {
          console.log(JSON.stringify(tree, null, 2));
        } else {
          printTree(tree, "", true, rootPath);
        }
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    },
  );

interface TreeNode {
  name: string;
  type: "dir" | "file";
  path: string;
  children?: TreeNode[];
  language?: string | undefined;
}

export async function buildTree(
  dirPath: string,
  maxDepth: number,
  sourceOnly: boolean,
  matcher: IgnoreMatcher,
  depth: number = 0,
): Promise<TreeNode> {
  const name = dirPath.split("/").pop() ?? dirPath;
  const node: TreeNode = {
    name,
    type: "dir",
    path: dirPath,
    children: [],
  };

  if (depth >= maxDepth) {
    return node;
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const sortedEntries = entries.sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sortedEntries) {
      const fullPath = join(dirPath, entry.name);
      const ignored = matcher.ignores(fullPath, entry.isDirectory());
      if (ignored) continue;

      if (entry.isDirectory()) {
        const child = await buildTree(fullPath, maxDepth, sourceOnly, matcher, depth + 1);
        if (child.children && child.children.length > 0) {
          node.children!.push(child);
        } else if (!sourceOnly) {
          node.children!.push(child);
        }
      } else if (entry.isFile()) {
        const ext = entry.name.slice(entry.name.lastIndexOf("."));
        const language = LANGUAGE_EXTENSIONS[ext];

        if (sourceOnly && !language) continue;

        node.children!.push({
          name: entry.name,
          type: "file",
          path: fullPath,
          language,
        });
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`warning: skipping ${dirPath}: ${msg}\n`);
  }

  return node;
}

function printTree(node: TreeNode, prefix: string, isLast: boolean, rootPath: string): void {
  const connector = isLast ? "+-- " : "|-- ";
  const icon = node.type === "dir" ? "[dir]" : getFileIcon(node.language);
  const relPath = relative(rootPath, node.path);

  if (relPath) {
    console.log(`${prefix}${connector}${icon} ${node.name}`);
  } else {
    console.log(`${icon} ${node.name}/`);
  }

  if (node.children) {
    const childPrefix = prefix + (isLast ? "    " : "|   ");
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child) {
        printTree(child, relPath ? childPrefix : "", i === node.children.length - 1, rootPath);
      }
    }
  }
}

function getFileIcon(language?: string): string {
  switch (language) {
    case "typescript":
      return "[ts]";
    case "javascript":
      return "[js]";
    case "python":
      return "[py]";
    case "rust":
      return "[rs]";
    case "csharp":
      return "[cs]";
    default:
      return "[file]";
  }
}
