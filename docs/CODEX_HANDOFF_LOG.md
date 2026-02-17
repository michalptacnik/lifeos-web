# Codex Handoff Log (Web)

## 2026-02-15
### What changed
- Implemented email/password first auth UX with contextual errors.
- Added CSRF-protected local login/register proxy routes.
- Reworked data flow toward targeted invalidation and optimistic task updates.
- Added session profile API route and profile-aware header display.

### Why
- Reduce cognitive load, improve security boundaries, and reduce unnecessary data churn.

### Commands/tests run
- `npm run test`
- `npx tsc --noEmit`

### Known issues/risks
- Main page remains monolithic and should be split by domain components.

### Next steps
- Extract auth screen and task/worktime sections into isolated components/hooks.

## 2026-02-17 (P0.2 CI gates)
### What changed
- Added Web GitHub Actions workflow at `.github/workflows/ci.yml` with install, typecheck, tests, and production build gates.

### Why
- Implement production release blocker P0.2 so web regressions fail in PR before merge.

### Commands/tests run
- `npm ci`
- `./node_modules/.bin/tsc --noEmit && npm run test && npm run build`

### Known issues/risks
- Branch protection updates require authenticated GitHub API access.

### Next steps
- Push this branch and verify `Web CI` workflow passes in GitHub Actions.
- Enforce `Web CI` as required status check on `main`.

## 2026-02-17 (MVP0 auth trust-boundary hardening)
### What changed
- Updated `app/api/lifeos/[...path]/route.ts` to enforce strict dev-bypass resolution.
- Proxy now returns 500 in production when any dev bypass env is present (`ALLOW_DEV_AUTH_BYPASS=true` or non-empty `DEV_AUTH_BYPASS_EMAIL`).
- Proxy now returns 500 if bypass is enabled without `DEV_AUTH_BYPASS_EMAIL` in non-production.
- Added production misconfiguration regression test in `tests/proxy-route.test.ts`.
- Updated `README.md` security notes and `docs/CODEX_MEMORY.md` operational constraints.

### Why
- Implement MVP0 trust boundary requirement: dev auth bypass must be impossible in production and misconfiguration should be explicit, not silent.

### Commands/tests run
- `./node_modules/.bin/tsc --noEmit && npm run test && npm run build`

### Known issues/risks
- API still trusts `x-user-email` from callers with the internal key; this is acceptable for current proxy trust model but should remain tightly scoped to private network ingress.

### Next steps
- Document and enforce private-network ingress assumptions for API internal key routes.
- Continue with API-side trust boundary hardening tasks.

## 2026-02-17 (MVP1 inventory app shell)
### What changed
- Extended `app/page.tsx` with a new `inventory` app view and dashboard launcher.
- Added inventory client models and event-driven resource loading (`/api/lifeos/inventory`) into existing invalidation flow.
- Implemented subtype-focused inventory UX:
  - Home / Work / Food filters
  - create item form (name, subtype, quantity, unit, category, location)
  - list rendering with contextual metadata
  - delete action with optimistic rollback on failure
- Kept interaction model lightweight with immediate feedback and no polling loops.
- Updated `docs/CODEX_MEMORY.md` with inventory shell state.

### Why
- Execute MVP1 web issue for inventory shell so users can navigate and act within subtype-specific inventory context, aligned with recognition-over-recall principles.

### Commands/tests run
- `./node_modules/.bin/tsc --noEmit && npm run test && npm run build`

### Known issues/risks
- Inventory edit/adjust flows are not yet implemented (create/list/delete only in this increment).

### Next steps
- Add inventory edit/update interactions and food-specific affordances for recipe readiness checks.
- Continue with MVP2 food intelligence issue implementation.

## 2026-02-17 (MVP2 food store + feasibility UX)
### What changed
- Extended `app/page.tsx` inventory view with food recipe feasibility flow:
  - loads recipes from `GET /food/recipes`
  - allows recipe selection and explicit feasibility check via `GET /food/recipes/:id/availability`
  - renders per-ingredient `enough/partial/missing` status with exact missing deltas
  - adds `Quick add` action for shortages to create `FOOD` inventory entries in one click
- Extended resource loading pipeline with `food` resource key while keeping targeted invalidation model.
- Added contextual food-store signal (`Food store: N items tracked`) in inventory list.
- Updated `README.md` and `docs/CODEX_MEMORY.md` with food feasibility behavior.

### Why
- Execute MVP2 issue so users can decide if a recipe is cookable from current food stock in a short path and immediately resolve shortages.

### Commands/tests run
- `./node_modules/.bin/tsc --noEmit && npm run test && npm run build`

### Known issues/risks
- UI currently depends on existing recipes and does not yet include recipe create/edit forms (handled in next MVP2 issue).

### Next steps
- Implement recipe CRUD UI with ingredient normalization/validation flows.
- Split food/inventory domain section out of `app/page.tsx` into dedicated components.
