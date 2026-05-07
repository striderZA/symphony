# Symphony TypeScript

This directory contains the TypeScript/Bun agent orchestration service that polls Linear, creates per-issue workspaces, and runs OpenCode in server mode.

## Environment

- Bun >= 1.2, TypeScript ^5.5.
- Install deps: `bun install`.
- Setup: `bun run src/setup.ts`.
- Quality gates: `bun run test && bun run typecheck`.

## Codebase-Specific Conventions

- Runtime config is loaded from `WORKFLOW.md` front matter via `config.ts`.
- Keep the implementation aligned with [`../SPEC.md`](../SPEC.md) where practical.
  - The implementation may be a superset of the spec.
  - The implementation must not conflict with the spec.
  - If implementation changes meaningfully alter the intended behavior, update the spec in the same
    change where practical so the spec stays current.
- Prefer adding config validation through `config.ts` instead of ad-hoc env reads.
- Workspace safety is critical:
  - Never run agent cwd in source repo.
  - Workspaces must stay under configured workspace root (`path_safety.ts`).
- Orchestrator behavior is stateful and concurrency-sensitive; preserve retry, reconciliation, and cleanup semantics.
- Follow `docs/logging.md` for logging conventions and required issue/session context fields.
- Follow `docs/token_accounting.md` for OpenCode SDK v2 token usage accounting rules.

## Tests and Validation

Run targeted tests while iterating, then run full gates before handoff.

```bash
npx vitest run
```

Type checking:

```bash
bun run typecheck
```

## Required Rules

- Exported functions/types should have a corresponding JSDoc or TypeScript type annotation.
- Use Zod schemas for runtime config validation (`config.ts` patterns).
- Prefer `async`/`await` over raw promises; avoid `any` where a typed alternative exists.
- Keep changes narrowly scoped; avoid unrelated refactors.
- Follow existing module patterns in `src/*.ts`.

## PR Requirements

- PR body must follow `../.github/pull_request_template.md` exactly.

## Docs Update Policy

If behavior/config changes, update docs in the same PR:

- `../README.md` for project concept and goals.
- `README.md` for TypeScript implementation and run instructions.
- `WORKFLOW.md` for workflow/config contract changes.
- `docs/logging.md` for logging convention changes.
- `docs/token_accounting.md` for token accounting protocol changes.
