# v0.1 Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Get Distil to a clean, ship-ready v0.1 state with build passing, docs accurate, publish-ready package metadata, and MCP server implemented.

**Architecture:** Three workstreams — (1) fix build by resolving kindling type errors, (2) project hygiene including APS plans, README, CLAUDE.md, package metadata, (3) new `@distil/mcp` package exposing all analysis layers via MCP. Streams 2 and 3 run in parallel after stream 1 merges.

**Tech Stack:** TypeScript, pnpm monorepo, tree-sitter, `@modelcontextprotocol/sdk`, Zod (via MCP SDK), Commander.js

---

## Stream 1: Fix Build + Kindling (branch: `fix/build-kindling`)

### Task 1.1: Fix kindling type errors

The kindling module has `exactOptionalPropertyTypes` errors throughout. Every place where `contentHash?: ContentHash` is passed as `ContentHash | undefined` needs fixing.

**Files:**

- Modify: `packages/distil-core/src/kindling/observations.ts:38-50`
- Modify: `packages/distil-core/src/kindling/store.ts:34-40`

**Step 1: Fix `createObservation` to handle optional contentHash correctly**

In `packages/distil-core/src/kindling/observations.ts`, the `createObservation` function assigns `input.contentHash` directly which can be `undefined`. With `exactOptionalPropertyTypes`, an optional property `contentHash?: ContentHash` means the property can be absent but NOT explicitly `undefined`.

```typescript
// observations.ts - replace the createObservation function body
export function createObservation(input: ObservationInput): DistilObservation {
  const observation: DistilObservation = {
    kind: input.kind,
    scope: input.scope,
    meta: {
      producer: "distil",
      subkind: input.subkind,
      language: input.language,
      schemaVersion: DISTIL_SCHEMA_VERSION,
      payload: input.payload,
    },
  };
  if (input.contentHash) {
    observation.contentHash = input.contentHash;
  }
  return observation;
}
```

**Step 2: Fix `createScope` to handle optional properties correctly**

In `packages/distil-core/src/kindling/store.ts:34-40`, the `createScope` call passes potentially-undefined values. Fix by only including defined properties:

```typescript
// store.ts - replace the createScope method
createScope(input: { filePath?: string; symbolName?: string }): AnalysisScope {
  return createScope({
    ...(this.projectId != null && { projectId: this.projectId }),
    ...(this.projectRoot != null && { projectRoot: this.projectRoot }),
    ...(input.filePath != null && { filePath: input.filePath }),
    ...(input.symbolName != null && { symbolName: input.symbolName }),
  });
}
```

**Step 3: Fix `writeObservation` to conditionally spread contentHash**

In `packages/distil-core/src/kindling/store.ts:218-234`, fix the private `writeObservation` and all `getCachedByScope` call sites to not pass `contentHash` when undefined:

```typescript
// store.ts - replace the writeObservation method
private async writeObservation(input: {
  kind: ObservationKind;
  subkind: string;
  scope: AnalysisScope;
  language: Language;
  payload: unknown;
  contentHash?: ContentHash;
}): Promise<void> {
  const observation = createObservation({
    kind: input.kind,
    scope: input.scope,
    language: input.language,
    subkind: input.subkind,
    payload: input.payload,
    ...(input.contentHash != null && { contentHash: input.contentHash }),
  });
  await this.adapter.write([observation]);
}
```

Similarly fix all `getCachedByScope` calls to conditionally include `contentHash`:

```typescript
// Pattern for each getCached* method:
async getCachedAST(filePath: string, contentHash?: ContentHash): Promise<ModuleInfo | null> {
  return this.getCachedByScope<ModuleInfo>({
    kind: "code.symbol",
    subkind: DISTIL_SUBKINDS.astModule,
    scope: this.createScope({ filePath }),
    ...(contentHash != null && { contentHash }),
  });
}
```

Apply the same `...(contentHash != null && { contentHash })` pattern to: `getCachedCFG`, `getCachedDFG`, `getCachedPDG`, `cacheCFG`, `cacheDFG`, `cachePDG`, `cacheAST`.

**Step 4: Run build to verify it passes**

Run: `pnpm build`
Expected: SUCCESS, no type errors

**Step 5: Run tests to verify nothing broke**

Run: `pnpm test`
Expected: All 26 tests pass

**Step 6: Commit**

```bash
git checkout -b fix/build-kindling
git add packages/distil-core/src/kindling/
git add packages/distil-core/src/index.ts
git commit -m "fix(core): resolve exactOptionalPropertyTypes errors in kindling module"
```

### Task 1.2: Merge build fix to main

**Step 1: Verify CI would pass**

Run: `pnpm build && pnpm typecheck && pnpm test && pnpm lint`
Expected: All pass

**Step 2: Merge to main**

```bash
git checkout main
git merge fix/build-kindling
```

---

## Stream 2: Project Hygiene (branch: `chore/project-hygiene`)

Can run in parallel with Stream 3 after Stream 1 merges.

### Task 2.1: Update APS plans to reflect reality

**Files:**

- Modify: `plans/index.aps.md`

**Step 1: Update milestone statuses**

The APS plans are stale. Current reality:

- M1: Complete (correct)
- M2: L2 call graph is done, kindling integration is done -> mark mostly complete
- M3: Complete (correct)
- M4: `.distilignore` and `--no-ignore` are implemented -> mark partially complete
- M5-M7: Still planned (correct)

Update `plans/index.aps.md`:

- M2: Check off kindling integration, update status
- M4: Check off `.distilignore`, `--no-ignore`, update description
- Update the "What's Next" table to remove completed items

**Step 2: Commit**

```bash
git add plans/
git commit -m "docs(plans): update APS milestones to reflect current state"
```

### Task 2.2: Update README for publish readiness

**Files:**

- Modify: `README.md`

**Step 1: Update README**

Current README is mostly accurate but needs:

- Remove "Kindling" references from architecture diagram (it's an internal detail, not user-facing)
- Update roadmap section — `.distilignore` is done, MCP will be done
- Add npm install instructions (even if not published yet, prep the format)
- Ensure command table matches actual CLI behavior
- Add MCP server section once Stream 3 completes

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for v0.1 release"
```

### Task 2.3: Update CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md to match current state**

- Update package structure to include `@distil/mcp`
- Update "currently only L1 is implemented" — L1-L5 are all implemented
- Update architecture section
- Add MCP server description

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect L1-L5 and MCP"
```

### Task 2.4: Clean up package metadata for publish readiness

**Files:**

- Modify: `packages/distil-core/package.json`
- Modify: `packages/distil-cli/package.json`
- Modify: `package.json` (root)

**Step 1: Add missing metadata fields**

For `@distil/core` and `@distil/cli` package.json files, add:

- `homepage`: `"https://github.com/joshuaboys/distil"`
- `bugs`: `{ "url": "https://github.com/joshuaboys/distil/issues" }`
- `author` field
- Verify `files` field includes everything needed for consumers
- Add `publishConfig` for scoped packages: `{ "access": "public" }`

For root `package.json`:

- Add `description` field if missing
- Add `homepage`, `bugs`, `repository` fields

**Step 2: Verify CLI has shebang**

Check `packages/distil-cli/src/index.ts` line 1 has `#!/usr/bin/env node`.
It does. Good.

**Step 3: Test pack output**

Run: `cd packages/distil-core && pnpm pack --dry-run`
Run: `cd packages/distil-cli && pnpm pack --dry-run`
Expected: Only dist/ and src/ files included, no tests or config

**Step 4: Commit**

```bash
git add packages/distil-core/package.json packages/distil-cli/package.json package.json
git commit -m "chore: add publish metadata to package.json files"
```

### Task 2.5: Add GitHub repo description

**Step 1: Set repo description via gh CLI**

```bash
gh repo edit --description "Token-efficient code analysis for LLMs — extract structure instead of dumping text"
```

**Step 2: Set topics**

```bash
gh repo edit --add-topic code-analysis,llm,ast,tree-sitter,typescript,mcp
```

### Task 2.6: Merge hygiene branch

```bash
git checkout main
git merge chore/project-hygiene
```

---

## Stream 3: MCP Server (branch: `feat/mcp-server`)

Can run in parallel with Stream 2 after Stream 1 merges.

### Task 3.1: Scaffold `@distil/mcp` package

**Files:**

- Create: `packages/distil-mcp/package.json`
- Create: `packages/distil-mcp/tsconfig.json`
- Create: `packages/distil-mcp/src/index.ts`
- Modify: `tsconfig.json` (root — add project reference)
- Modify: `pnpm-workspace.yaml` (already includes `packages/*`, so no change needed)

**Step 1: Create package.json**

```json
{
  "name": "@distil/mcp",
  "version": "0.1.0",
  "description": "MCP server for Distil — expose code analysis via Model Context Protocol",
  "type": "module",
  "bin": {
    "distil-mcp": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@distil/core": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.12.1",
    "zod": "^3.25.67"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  },
  "keywords": ["mcp", "code-analysis", "llm", "distil"],
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/joshuaboys/distil.git",
    "directory": "packages/distil-mcp"
  },
  "homepage": "https://github.com/joshuaboys/distil",
  "bugs": { "url": "https://github.com/joshuaboys/distil/issues" },
  "publishConfig": { "access": "public" }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "types": ["node"],
    "composite": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"],
  "references": [{ "path": "../distil-core" }]
}
```

**Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
  },
});
```

**Step 4: Add root tsconfig reference**

Add `{ "path": "./packages/distil-mcp" }` to `tsconfig.json` references array.

**Step 5: Create stub index.ts**

```typescript
#!/usr/bin/env node
import { createServer } from "./server.js";

const server = createServer();
await server.start();
```

**Step 6: Install dependencies**

Run: `pnpm install`

**Step 7: Commit**

```bash
git add packages/distil-mcp/ tsconfig.json
git commit -m "feat(mcp): scaffold @distil/mcp package"
```

### Task 3.2: Implement MCP server core

**Files:**

- Create: `packages/distil-mcp/src/server.ts`
- Modify: `packages/distil-mcp/src/index.ts`

**Step 1: Create server.ts with tool registrations**

```typescript
import { McpServer, StdioServerTransport } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { resolve } from "path";
import { readFile } from "fs/promises";
import {
  buildCallGraph,
  extractCFG,
  extractDFG,
  extractPDG,
  getParser,
  VERSION,
} from "@distil/core";

export function createServer() {
  const server = new McpServer({
    name: "distil",
    version: VERSION,
  });

  registerTools(server);
  registerPrompts(server);

  return {
    server,
    async start() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error(`Distil MCP server v${VERSION} running on stdio`);
    },
  };
}
```

Register each tool per the MCP SDK pattern — see Task 3.3.

**Step 2: Update index.ts**

```typescript
#!/usr/bin/env node
import { createServer } from "./server.js";

const { start } = createServer();
await start();
```

**Step 3: Commit**

```bash
git add packages/distil-mcp/src/
git commit -m "feat(mcp): implement server core with stdio transport"
```

### Task 3.3: Register analysis tools

**Files:**

- Modify: `packages/distil-mcp/src/server.ts`

Register these tools using `server.tool()`:

**`distil_extract`** — L1 AST extraction

- Input: `{ file: z.string() }`
- Reads file, gets parser, calls `parser.extractAST()`, returns JSON

**`distil_tree`** — File tree

- Input: `{ path: z.string().optional() }`
- Walks directory, returns tree structure

**`distil_calls`** — L2 call graph

- Input: `{ path: z.string().optional() }`
- Calls `buildCallGraph()`, returns edges/functions

**`distil_impact`** — L2 impact analysis

- Input: `{ function: z.string(), path: z.string().optional(), depth: z.number().optional() }`
- Builds call graph, finds callers of function

**`distil_cfg`** — L3 control flow graph

- Input: `{ file: z.string(), function: z.string() }`
- Calls `extractCFG()`, returns blocks/edges/complexity

**`distil_dfg`** — L4 data flow graph

- Input: `{ file: z.string(), function: z.string() }`
- Calls `extractDFG()`, returns variables/edges

**`distil_slice`** — L5 program slice

- Input: `{ file: z.string(), function: z.string(), line: z.number(), variable: z.string().optional(), forward: z.boolean().optional() }`
- Calls `extractPDG()`, computes slice, returns relevant lines

Each tool handler should:

1. Resolve paths relative to `process.cwd()`
2. Return `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`
3. On error, return `{ content: [{ type: "text", text: "Error: ..." }], isError: true }`

**Step 1: Implement all tool registrations**

Write a `registerTools(server: McpServer)` function that registers all 7 tools.

**Step 2: Run build**

Run: `pnpm build`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add packages/distil-mcp/src/
git commit -m "feat(mcp): register L1-L5 analysis tools"
```

### Task 3.4: Register prompts

**Files:**

- Modify: `packages/distil-mcp/src/server.ts`

Register workflow prompts:

**`distil_before_editing`** — Context needed before editing a function

- Arguments: `{ file: z.string(), function: z.string() }`
- Returns prompt that guides the LLM to use extract + cfg + impact tools

**`distil_debug_line`** — Context needed to debug a specific line

- Arguments: `{ file: z.string(), function: z.string(), line: z.number() }`
- Returns prompt that guides the LLM to use slice + dfg tools

**`distil_refactor_impact`** — What would break if we change something

- Arguments: `{ function: z.string(), path: z.string().optional() }`
- Returns prompt that guides the LLM to use impact + calls tools

**Step 1: Implement prompt registrations**

Write a `registerPrompts(server: McpServer)` function.

**Step 2: Commit**

```bash
git add packages/distil-mcp/src/
git commit -m "feat(mcp): add workflow prompts"
```

### Task 3.5: Write tests

**Files:**

- Create: `packages/distil-mcp/src/server.test.ts`

**Step 1: Write server unit tests**

Test that:

- `createServer()` returns a server object
- Server has expected tools registered (check tool list)
- Server has expected prompts registered
- Each tool handler works with valid input (use a small test fixture file)
- Tools return error content for invalid input (missing file, bad function name)

Use vitest. Import `createServer` and call tools directly through the MCP client test helper or by invoking handlers.

**Step 2: Run tests**

Run: `pnpm -F @distil/mcp test`
Expected: All pass

**Step 3: Commit**

```bash
git add packages/distil-mcp/src/server.test.ts
git commit -m "test(mcp): add server unit tests"
```

### Task 3.6: Add `distil mcp` CLI subcommand

**Files:**

- Create: `packages/distil-cli/src/commands/mcp.ts`
- Modify: `packages/distil-cli/src/index.ts`
- Modify: `packages/distil-cli/package.json` (add @distil/mcp dependency)

**Step 1: Create mcp command**

```typescript
// packages/distil-cli/src/commands/mcp.ts
import { Command } from "commander";

export const mcpCommand = new Command("mcp")
  .description("Start MCP server for editor integration")
  .action(async () => {
    const { createServer } = await import("@distil/mcp");
    const { start } = createServer();
    await start();
  });
```

**Step 2: Register command in CLI**

Add to `packages/distil-cli/src/index.ts`:

```typescript
import { mcpCommand } from "./commands/mcp.js";
// ... in createProgram():
program.addCommand(mcpCommand);
```

**Step 3: Add dependency**

Add `"@distil/mcp": "workspace:*"` to `packages/distil-cli/package.json` dependencies.

**Step 4: Run `pnpm install` and `pnpm build`**

**Step 5: Commit**

```bash
git add packages/distil-cli/
git commit -m "feat(cli): add 'distil mcp' subcommand"
```

### Task 3.7: Update CI for new package

**Files:**

- Modify: `.github/workflows/ci.yml` (if needed — pnpm -r commands already cover all packages)

**Step 1: Verify CI covers new package**

The existing CI runs `pnpm build`, `pnpm typecheck`, `pnpm test` which use `pnpm -r` and will automatically include the new package. No changes needed unless the MCP SDK requires special setup.

**Step 2: Run full CI locally**

Run: `pnpm build && pnpm typecheck && pnpm test && pnpm lint`
Expected: All pass

**Step 3: Commit if changes needed**

### Task 3.8: Merge MCP branch

```bash
git checkout main
git merge feat/mcp-server
```

---

## Stream 4: Final Integration

### Task 4.1: Final README update with MCP docs

**Files:**

- Modify: `README.md`

After MCP server is merged, add MCP usage section to README:

````markdown
## MCP Server

Distil includes an MCP server for editor and agent integration.

### Configuration

Add to your editor's MCP settings:

```json
{
  "mcpServers": {
    "distil": {
      "command": "npx",
      "args": ["@distil/cli", "mcp"]
    }
  }
}
```
````

### Available Tools

| Tool             | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `distil_extract` | L1: Extract file structure (functions, classes, imports) |
| `distil_calls`   | L2: Build project call graph                             |
| `distil_impact`  | L2: Find all callers of a function                       |
| `distil_cfg`     | L3: Control flow graph with complexity                   |
| `distil_dfg`     | L4: Data flow graph with def-use chains                  |
| `distil_slice`   | L5: Program slice (backward/forward)                     |

````

**Step 1: Update README**

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add MCP server documentation to README"
````

### Task 4.2: Final verification

**Step 1: Run full CI suite**

```bash
pnpm install && pnpm build && pnpm typecheck && pnpm test && pnpm lint
```

**Step 2: Test CLI end-to-end**

```bash
# Test on the distil repo itself
node packages/distil-cli/dist/index.js tree .
node packages/distil-cli/dist/index.js extract packages/distil-core/src/extractors.ts
node packages/distil-cli/dist/index.js calls .
node packages/distil-cli/dist/index.js cfg packages/distil-core/src/extractors.ts extractCFG
```

**Step 3: Verify pack output**

```bash
cd packages/distil-core && pnpm pack --dry-run
cd packages/distil-cli && pnpm pack --dry-run
cd packages/distil-mcp && pnpm pack --dry-run
```

Expected: Only dist/ files, no test files or configs
