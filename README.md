# Distil

Token-efficient code analysis for LLMs.

Modern codebases are massive. Even when a model's context window is large enough, dumping raw source buries signal under noise. Distil extracts *structure* instead of text, reducing context by **~95%** while preserving what matters for accurate reasoning.

## How It Works

Instead of feeding raw source files into an LLM context, Distil produces structured analysis at five layers of depth. Each layer adds more detail, so you request only what the task needs:

```
Raw source (10,000 tokens)
    |
    v
L1: AST      (500 tokens)   "What functions exist?"
L2: Calls    (800 tokens)   "Who calls what?"
L3: CFG      (200 tokens)   "How complex is this function?"
L4: DFG      (300 tokens)   "Where does this value flow?"
L5: Slice    (150 tokens)   "What affects line 42?"
```

## Installation

```bash
# From source (pnpm monorepo)
git clone https://github.com/joshuaboys/distil.git
cd distil
pnpm install && pnpm build

# Link globally
pnpm -F @distil/cli link --global
```

## Workflows

### Before reading unfamiliar code

```bash
# Get the lay of the land
distil tree .

# Understand a specific file's structure
distil extract src/auth.ts
```

### Before editing a function

```bash
# Who calls this function? What might break?
distil impact validateToken .

# What data flows through it?
distil dfg src/auth.ts validateToken
```

### Before refactoring

```bash
# Build the full call graph to see dependencies
distil calls .

# Check complexity before deciding what to simplify
distil cfg src/auth.ts validateToken
```

### Debugging a specific line

```bash
# What code affects line 42? (backward slice)
distil slice src/auth.ts validateToken 42

# What does line 42 affect? (forward slice)
distil slice src/auth.ts validateToken 42 --forward
```

## Commands

| Command | Layer | Description |
|---------|-------|-------------|
| `distil tree [path]` | - | File tree structure |
| `distil extract <file>` | L1 | Functions, classes, imports, signatures |
| `distil calls [path]` | L2 | Build project call graph |
| `distil impact <func> [path]` | L2 | Find all callers of a function |
| `distil cfg <file> <func>` | L3 | Control flow graph with complexity |
| `distil dfg <file> <func>` | L4 | Data flow graph with def-use chains |
| `distil slice <file> <func> <line>` | L5 | Program slice (backward/forward) |

All commands support `--json` for programmatic use. Function names use fuzzy matching.

## Supported Languages

| Language | L1 | L2 | L3-L5 |
|----------|----|----|-------|
| TypeScript/JavaScript | yes | yes | yes |
| Python | planned | - | - |
| Rust | planned | - | - |

## Architecture

```
packages/
  distil-core   # Analysis engine (tree-sitter parsers, L1-L5 extractors)
  distil-cli    # Command-line interface (Commander.js)
```

Distil will integrate with [Kindling](https://github.com/anthropics/kindling) for caching and persistence:

```
                     Distil CLI
                        |
                        v
              Distil Analysis Engine
         L1 -> L2 -> L3 -> L4 -> L5
                        |
                        v
              Kindling Persistence
         SQLite + FTS5, observation storage
                        |
                        v
               .kindling/distil.db
```

## Roadmap

Planned features (not yet implemented):

- **MCP server** -- expose analysis via Model Context Protocol for editor and agent integration
- **`.distilignore`** -- project-level ignore patterns (like `.gitignore`)
- **Semantic search** -- natural language code search via embeddings
- **Index warming** -- pre-build all analysis layers for fast queries
- **Monorepo support** -- per-package analysis with cross-package call graphs

Roadmap details and module specs are in `plans/` using APS format. Start at [plans/index.aps.md](./plans/index.aps.md).

## Development

```bash
pnpm install        # Install dependencies
pnpm build          # Build all packages
pnpm test           # Run all tests
pnpm typecheck      # Type check
```

## License

Apache 2.0
