# npm Publish Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a GitHub Actions workflow that publishes all packages to npm when a GitHub Release is created.

**Architecture:** Single workflow file triggered by `release: [released]`. Runs the full CI pipeline (install, build, typecheck, test) then publishes all workspace packages via `pnpm publish -r`. Auth via `NPM_TOKEN` secret.

**Tech Stack:** GitHub Actions, pnpm, Node.js 22

---

### Task 1: Create feature branch

**Step 1: Create and switch to feature branch**

Run: `git checkout -b feat/npm-publish-workflow`
Expected: `Switched to a new branch 'feat/npm-publish-workflow'`

---

### Task 2: Create the publish workflow

**Files:**

- Create: `.github/workflows/publish.yml`

**Step 1: Write the workflow file**

```yaml
name: Publish

on:
  release:
    types: [released]

concurrency:
  group: publish
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org

      - run: pnpm install --frozen-lockfile

      - run: pnpm build

      - run: pnpm typecheck

      - run: pnpm test

      - run: pnpm publish -r --no-git-checks --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Step 2: Validate YAML syntax**

Run: `node -e "const fs = require('fs'); const y = require('yaml'); y.parse(fs.readFileSync('.github/workflows/publish.yml','utf8')); console.log('Valid YAML');"` or if yaml isn't available: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/publish.yml')); print('Valid YAML')"`

If neither available, `gh workflow list` after push will catch syntax errors.

**Step 3: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: add npm publish workflow on GitHub Release"
```

---

### Task 3: Commit design doc

**Files:**

- Stage: `docs/plans/2026-03-01-npm-publish-workflow-design.md`
- Stage: `docs/plans/2026-03-01-npm-publish-workflow.md`

**Step 1: Commit the plan docs**

```bash
git add docs/plans/2026-03-01-npm-publish-workflow-design.md docs/plans/2026-03-01-npm-publish-workflow.md
git commit -m "docs: add npm publish workflow design and plan"
```

---

### Task 4: Push and create PR

**Step 1: Push the branch**

Run: `git push -u origin feat/npm-publish-workflow`

**Step 2: Create pull request**

```bash
gh pr create --title "ci: add npm publish workflow" --body "$(cat <<'EOF'
## Summary
- Add `.github/workflows/publish.yml` triggered on GitHub Release
- Runs full CI (build, typecheck, test) then `pnpm publish -r`
- Requires `NPM_TOKEN` repo secret to be configured

## Setup required
Add an `NPM_TOKEN` secret in Settings > Secrets > Actions with a
npm access token that has publish permissions for the @distil scope.

## Test plan
- [ ] Verify workflow YAML is valid (CI passes)
- [ ] After merge, create a test release to verify publish works

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Post-merge setup

After the PR is merged, you need to:

1. Create an npm access token at https://www.npmjs.com/settings/tokens
2. Add it as `NPM_TOKEN` in GitHub repo Settings > Secrets and variables > Actions
3. To publish: bump versions, commit, create a GitHub Release with tag `vX.Y.Z`
