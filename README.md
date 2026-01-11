# TLDR: Code Analysis for LLMs

[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

**Give LLMs exactly the code they need. Nothing more.**

Your codebase is 100K lines. Claude's context window is 200K tokens. Raw code won't fit—and even if it did, the LLM would drown in irrelevant details.

TLDR extracts *structure* instead of dumping *text*. The result: **95% fewer tokens** while preserving everything needed to understand and edit code correctly.

## How It Works

TLDR builds 5 analysis layers, each answering different questions:

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
pnpm add @edda-tldr/cli

# Index your project
tldr warm .

# Get LLM-ready context for a function
tldr context processData --project .

# Find all callers of a function
tldr impact validateToken .

# Get program slice (what affects line 42?)
tldr slice src/auth.ts login 42
```

## Commands

| Command | What It Does |
|---------|--------------|
| `tldr tree [path]` | File tree structure |
| `tldr structure [path]` | Code structure overview |
| `tldr extract <file>` | Full file analysis (L1) |
| `tldr context <func> --project <path>` | LLM-ready summary |
| `tldr calls [path]` | Build call graph (L2) |
| `tldr impact <func> [path]` | Find all callers (L2) |
| `tldr cfg <file> <func>` | Control flow graph (L3) |
| `tldr dfg <file> <func>` | Data flow graph (L4) |
| `tldr slice <file> <func> <line>` | Program slice (L5) |
| `tldr semantic <query> [path]` | Natural language search |
| `tldr warm [path]` | Build all indexes |

## Supported Languages

| Language | Status |
|----------|--------|
| TypeScript | ✅ Supported |
| JavaScript | ✅ Supported |
| Python | 🔜 Planned |
| Rust | 🔜 Planned |
| C# | 🔜 Planned |

## Architecture

TLDR integrates with [Kindling](https://github.com/EddaCraft/kindling) for caching and persistence:

```
┌─────────────────────────────────────────────────────────────┐
│                      TLDR Analysis Engine                    │
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
                    .kindling/tldr.db
```

## Development

```bash
# Clone and install
git clone https://github.com/EddaCraft/tldr.git
cd tldr
pnpm install

# Build
pnpm build

# Test
pnpm test

# Link Kindling locally (during development)
cd ../kindling && pnpm link --global
cd ../tldr && pnpm link @kindling/core @kindling/store-sqlite
```

## Planning

TLDR uses APS docs for roadmap and module planning. Start at [plans/index.aps.md](./plans/index.aps.md).

## License

Apache 2.0 - See [LICENSE](./LICENSE) for details.

---

**Built by [EddaCraft](https://github.com/EddaCraft)**
