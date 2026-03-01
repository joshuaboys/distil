# npm Publish Workflow Design

## Overview

Add a GitHub Actions workflow to publish all three packages to npm when a
GitHub Release is created.

## Trigger

GitHub Release creation with a tag matching `v*.*.*`.

## Workflow

File: `.github/workflows/publish.yml`

Steps:

1. Checkout code
2. Setup pnpm + Node 22
3. `pnpm install --frozen-lockfile`
4. `pnpm build`
5. `pnpm typecheck`
6. `pnpm test`
7. `pnpm publish -r --no-git-checks` (publishes in topological order)

## Auth

Requires an `NPM_TOKEN` repository secret configured in GitHub Settings >
Secrets and variables > Actions.

## Packaging

Three packages published to npm:

- `@distil/core` — analysis engine
- `@distil/mcp` — MCP server
- `@distil/cli` — CLI (user-facing install target)

pnpm resolves `workspace:*` to real versions at publish time. Topological
ordering ensures core publishes before mcp and cli.

## User Install

```bash
npm install -g @distil/cli
```

## Versioning

Manual. Bump versions in `package.json` files before creating a release.

## Release Process

1. Bump versions in all three `packages/*/package.json` files
2. Commit and push to main
3. Create a GitHub Release with tag `vX.Y.Z`
4. Workflow runs: build, test, publish
