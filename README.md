<div align="center">

# Distil

**Token-efficient code analysis for LLMs.
Extract structure, not text.**

[![CI](https://github.com/joshuaboys/distil/actions/workflows/ci.yml/badge.svg)](https://github.com/joshuaboys/distil/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@distil/cli)](https://www.npmjs.com/package/@distil/cli)

</div>

---

## Features

- **~95% token reduction** — structured analysis instead of raw source dumps
- **Five analysis layers** — from function signatures (L1) to program slicing (L5)
- **Tree-sitter powered** — fast, accurate parsing for TypeScript and JavaScript
- **MCP server** — plug into any editor or AI agent that supports MCP
- **Fuzzy matching** — find functions by name without exact spelling
- **JSON output** — `--json` on every command for programmatic use

## Quick Start

```sh
# Install from npm
npm install -g @distil/cli

# See the structure of a project
distil tree .

# Extract functions, classes, and imports from a file
distil extract src/auth.ts

# Who calls this function? What breaks if I change it?
distil impact validateToken .
```

## Install

```sh
npm install -g @distil/cli
```

<details>
<summary><strong>From source</strong></summary>

Requires [pnpm](https://pnpm.io) and Node 18+.

```sh
git clone https://github.com/joshuaboys/distil.git
cd distil
pnpm install && pnpm build
pnpm -F @distil/cli link --global
```

</details>

## Usage

### Explore unfamiliar code

```sh
distil tree .                 # file tree structure
distil extract src/auth.ts    # functions, classes, imports, signatures
```

### Understand dependencies before editing

```sh
distil impact validateToken .           # who calls this function?
distil calls .                          # full project call graph
distil dfg src/auth.ts validateToken    # data flow through a function
```

### Assess complexity before refactoring

```sh
distil cfg src/auth.ts validateToken    # control flow + cyclomatic complexity
```

### Debug a specific line

```sh
distil slice src/auth.ts validateToken 42             # what affects line 42?
distil slice src/auth.ts validateToken 42 --forward   # what does line 42 affect?
```

## Commands

| Command | Layer | Description |
| --- | --- | --- |
| `distil tree [path]` | — | File tree structure |
| `distil extract <file>` | L1 | Functions, classes, imports, signatures |
| `distil calls [path]` | L2 | Build project call graph |
| `distil impact <func> [path]` | L2 | Find all callers of a function |
| `distil cfg <file> <func>` | L3 | Control flow graph with complexity |
| `distil dfg <file> <func>` | L4 | Data flow graph with def-use chains |
| `distil slice <file> <func> <line>` | L5 | Program slice (backward/forward) |

All commands support `--json` for programmatic use. Function names use fuzzy matching.

## Analysis Layers

Each layer adds depth — request only what the task needs:

```
Raw source (10,000 tokens)
    │
    ▼
L1: AST      (500 tokens)   "What functions exist?"
L2: Calls    (800 tokens)   "Who calls what?"
L3: CFG      (200 tokens)   "How complex is this function?"
L4: DFG      (300 tokens)   "Where does this value flow?"
L5: Slice    (150 tokens)   "What affects line 42?"
```

## MCP Server

Distil includes an MCP server for editor and agent integration.

```sh
distil mcp
```

Add to your editor's MCP settings:

```json
{
  "mcpServers": {
    "distil": {
      "command": "distil",
      "args": ["mcp"]
    }
  }
}
```

<details>
<summary><strong>Available tools and prompts</strong></summary>

| Tool | Description |
| --- | --- |
| `distil_extract` | L1: Extract file structure (functions, classes) |
| `distil_calls` | L2: Build project call graph |
| `distil_impact` | L2: Find all callers of a function |
| `distil_cfg` | L3: Control flow graph with complexity metrics |
| `distil_dfg` | L4: Data flow graph with def-use chains |
| `distil_slice` | L5: Program slice (backward/forward) |

**Workflow prompts:** `distil_before_editing`, `distil_debug_line`, `distil_refactor_impact`

</details>

## Supported Languages

| Language | L1 | L2 | L3–L5 |
| --- | --- | --- | --- |
| TypeScript / JavaScript | yes | yes | yes |
| Python | planned | — | — |
| Rust | planned | — | — |

## Architecture

```
packages/
  distil-core   # Analysis engine (tree-sitter parsers, L1–L5 extractors)
  distil-cli    # Command-line interface (Commander.js)
  distil-mcp    # MCP server for editor/agent integration
```

## Uninstall

```sh
npm uninstall -g @distil/cli
```

## More

- [Roadmap and module specs](plans/index.aps.md) — planned features and APS design docs
- [Contributing](CONTRIBUTING.md) — development setup and guidelines

## Acknowledgements

Distil is built on:

- **[tree-sitter](https://tree-sitter.github.io/tree-sitter/)** — the incremental parsing framework that powers all of Distil's language analysis. Tree-sitter's concrete syntax trees and query language make accurate, fast extraction possible without relying on regex or language-specific hacks.

## License

Apache 2.0
