# ui-logic (temporary home)

Framework-free TypeScript logic for the UI (PLAN.md s.3, s.9, s.10), TDD with Vitest.
Paths mirror the planned app layout so the files move unchanged into the SvelteKit scaffold:
`src/lib/checking/` (document versioning + analysis state), `src/lib/commands/` (command registry),
`src/lib/theme/` (semantic tokens). `checking/contract.ts` is hand-written until contracts/v1 lands
with generated types.

    npm ci && npm test && npm run typecheck
