# Distil

Token-efficient code analysis for LLMs.

Modern codebases are massive. Even when a model's context window is large enough, dumping raw source buries signal under noise. Distil extracts *structure* instead of text, reducing context by **~95%** while preserving what matters for accurate reasoning.

## Analysis Layers

```
┌─────────────────────────────────────────────────────────────┐
│ L5: Program Dependence  → "What affects line 42?"           │
│ L4: Data Flow           → "Where does this value go?"       │
│ L3: Control Flow        → "How complex is this function?"   │
│ L2: Call Graph          → "Who calls this? What breaks?"    │
│ L1: AST                 → "What functions/classes exist?"   │
└─────────────────────────────────────────────────────────────┘
```

Different tasks need different depth:
- **Browsing code?** L1 (structure) is enough
- **Refactoring?** L2 (call graph) shows impact
- **Debugging?** L5 (slice) shows only relevant lines

## Installation

```bash
pnpm add @distil/cli
```

## Commands

| Command | Description | Layer |
|---------|-------------|-------|
| `distil tree [path]` | File tree structure | - |
| `distil extract <file>` | Functions, classes, imports | L1 |
| `distil calls [path]` | Build project call graph | L2 |
| `distil impact <func> [path]` | Find all callers of a function | L2 |

### Examples

```bash
# Show project structure
distil tree .

# Extract file analysis
distil extract src/index.ts

# Build call graph for a project
distil calls .

# Find what calls a function (with transitive callers)
distil impact validateToken --depth 3
```

## Supported Languages

| Language | L1 | L2 | L3-L5 |
|----------|----|----|-------|
| TypeScript | ✅ | ✅ | in review ([PR #1](https://github.com/joshuaboys/distil/pull/1)) |
| JavaScript | ✅ | ✅ | in review ([PR #1](https://github.com/joshuaboys/distil/pull/1)) |
| Python | planned | - | - |
| Rust | planned | - | - |

## Architecture

Distil will integrate with [Kindling](https://github.com/anthropics/kindling) for caching and persistence:

```
┌─────────────────────────────────────────────────────────────┐
│                    Distil Analysis Engine                   │
│  L1: AST  →  L2: CallGraph  →  L3: CFG  →  L4: DFG  →  L5  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Kindling Persistence                     │
│  SQLite + FTS5  •  Observation storage  •  Fast retrieval   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    .kindling/distil.db
```

## Development

```bash
git clone https://github.com/joshuaboys/distil.git
cd distil
pnpm install
pnpm build
pnpm test
```

### Package Structure

```
packages/
├── distil-core   # Analysis engine (tree-sitter parsers)
└── distil-cli    # Command-line interface
```

## Planning

Roadmap and module specs are in `plans/` using APS format. Start at [plans/index.aps.md](./plans/index.aps.md).

## License

Apache 2.0
