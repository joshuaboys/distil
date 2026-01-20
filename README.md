# Distil: Code Analysis for LLMs

[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

**Give LLMs exactly the code they need. Nothing more.**

Your codebase is 100K lines. Claude's context window is 200K tokens. Raw code won't fit—and even if it did, the LLM would drown in irrelevant details.

Distil extracts *structure* instead of dumping *text*. The result: **95% fewer tokens** while preserving everything needed to understand and edit code correctly.

## How It Works

Distil builds 5 analysis layers, each answering different questions:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: Program Dependence  → "What affects line 42?"      │
│ Layer 4: Data Flow           → "Where does this value go?"  │
│ Layer 3: Control Flow        → "How complex is this?"       │
│ Layer 2: Call Graph          → "Who calls this function?"   │
│ Layer 1: AST                 → "What functions exist?"      │
└─────────────────────────────────────────────────────────────┘
```

**Why layers?** Different tasks need different depth:
- Browsing code? Layer 1 (structure) is enough
- Refactoring? Layer 2 (call graph) shows what breaks
- Debugging null? Layer 5 (slice) shows only relevant lines

## Quick Start

```bash
# Install
pnpm add @edda-distil/cli

# Show file tree
distil tree .

# Extract file structure (L1)
distil extract src/index.ts
```

## Commands

| Command | What It Does | Status |
|---------|--------------|--------|
| `distil tree [path]` | File tree structure | ✅ Available |
| `distil extract <file>` | Full file analysis (L1) | ✅ Available |
| `distil structure [path]` | Code structure overview | 🔜 Planned |
| `distil context <func> --project <path>` | LLM-ready summary | 🔜 Planned |
| `distil calls [path]` | Build call graph (L2) | 🔜 Planned |
| `distil impact <func> [path]` | Find all callers (L2) | 🔜 Planned |
| `distil cfg <file> <func>` | Control flow graph (L3) | 🔜 Planned |
| `distil dfg <file> <func>` | Data flow graph (L4) | 🔜 Planned |
| `distil slice <file> <func> <line>` | Program slice (L5) | 🔜 Planned |
| `distil semantic <query> [path]` | Natural language search | 🔜 Planned |
| `distil warm [path]` | Build all indexes | 🔜 Planned |

## Supported Languages

| Language | Status |
|----------|--------|
| TypeScript | ✅ Supported |
| JavaScript | ✅ Supported |
| Python | 🔜 Planned |
| Rust | 🔜 Planned |
| C# | 🔜 Planned |

## Architecture

Distil plans to integrate with [Kindling](https://github.com/EddaCraft/kindling) for caching and persistence:

```
┌─────────────────────────────────────────────────────────────┐
│                      Distil Analysis Engine                    │
│  L1: AST  →  L2: CallGraph  →  L3: CFG  →  L4: DFG  →  L5   │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Kindling Persistence                      │
│  SQLite + FTS5  •  Observation storage  •  Fast retrieval   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    .kindling/distil.db
```

## Development

```bash
# Clone and install
git clone https://github.com/EddaCraft/distil.git
cd distil
pnpm install

# Build
pnpm build

# Test
pnpm test

# Link Kindling locally (during development)
cd ../kindling && pnpm link --global
cd ../distil && pnpm link @kindling/core @kindling/store-sqlite
```

## Planning

Distil uses APS docs for roadmap and module planning. Start at [plans/index.aps.md](./plans/index.aps.md).

## License

Apache 2.0 - See [LICENSE](./LICENSE) for details.

---

**Built by [EddaCraft](https://github.com/EddaCraft)**
