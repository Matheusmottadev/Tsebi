# TypeScript Migration Strategy (Backend)

## Current state

- Backend remains JavaScript runtime (`Node + Express`).
- TypeScript is currently used in **check mode** (`allowJs + checkJs + noEmit`) for gradual migration.
- Build pipeline remains `tsc -p tsconfig.build.json` emitting CommonJS output to `dist/` with `allowJs: true` and `checkJs: false`.
- Latest strict check baseline: **1005 TypeScript errors** (expected in early migration).

## Commands

- Strict (developer migration target, currently failing):

```bash
npm run typecheck:strict
```

- CI-safe check (green path for pipeline):

```bash
npm run typecheck:ci
```

- Default developer command (alias to strict):

```bash
npm run typecheck
```

- Strict watch mode:

```bash
npm run typecheck:watch
```

## Config split

- `tsconfig.strict.json`:
  - full strict migration mode
  - `allowJs: true`
  - `checkJs: true`
  - checks current JS codebase with JSDoc typing

- `tsconfig.ci.json`:
  - pipeline-safe mode
  - `allowJs: false`
  - `checkJs: false`
  - checks only:
    - `src/types/**/*.d.ts`
    - existing `*.ts` files in `src/`, `server/`, `scripts/`

## Incremental allowlist approach

1. Keep CI on `typecheck:ci` so tests and deploys are not blocked.
2. Gradually add typed modules by converting or introducing `.ts` files in targeted folders.
3. For JS modules, add JSDoc and fix strict errors module-by-module under `typecheck:strict`.
4. As error count drops, expand CI coverage (either by:
   - including specific JS allowlist in CI config, or
   - migrating those modules to `.ts`).
5. Final target: strict check becomes green and can replace CI-safe profile.

## TS-1.5 migration guardrails

1. One source of truth per module: no `foo.js` + mirrored `foo.ts` pair.
2. `@ts-nocheck` mirror files are not allowed.
3. Convert a file to `.ts` only after removing `@ts-nocheck` and making it compile.
4. During incremental migration, keep remaining JavaScript modules in build via `allowJs: true` instead of generating mirrored TypeScript files.
5. When a module is intentionally migrated, switch imports to that `.ts` module and remove the old `.js` module from source.
