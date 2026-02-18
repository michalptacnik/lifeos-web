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

## 2026-02-17 (MVP2 recipe CRUD + normalization UX)
### What changed
- Expanded `app/page.tsx` food area with recipe lifecycle operations:
  - create recipe with dynamic ingredient rows
  - edit existing recipe and persist via `PATCH /food/recipes/:id`
  - delete recipe via `DELETE /food/recipes/:id`
- Added inline validation with actionable errors for invalid recipe drafts (missing name, bad quantity, duplicate ingredient+unit rows).
- Added normalization/correction hints for noisy ingredient input:
  - trims/collapses ingredient names
  - normalizes known unit aliases (for example `pieces` -> `item`, `kilograms` -> `kg`)
- Kept deterministic feasibility checker integrated with CRUD flows and retained quick-add shortage actions.
- Updated `README.md` and `docs/CODEX_MEMORY.md` for the new recipe CRUD UX contract.

### Why
- Execute MVP2 recipe CRUD issue so users can safely maintain recipes with immediate corrective feedback and no silent failures.

### Commands/tests run
- `./node_modules/.bin/tsc --noEmit && npm run test && npm run build`

### Known issues/risks
- Unit normalization currently uses a small alias map and does not perform conversion math between units.

### Next steps
- Extract recipe CRUD/feasibility panel from `app/page.tsx` into dedicated components.
- Add structured confirm dialogs for destructive recipe deletes.

## 2026-02-17 (MVP3 matrix session/auth bridge)
### What changed
- Added `GET /api/matrix/session` route in `app/api/matrix/session/route.ts`:
  - requires authenticated NextAuth session
  - detects expired JWT session token and returns explicit recoverable 401 status
  - fetches `/matrix/rooms` from API with trusted internal headers
  - issues short-lived HMAC-signed matrix bridge token for client bootstrap
- Added token helper `lib/matrix-bridge.ts` for bridge token creation.
- Hardened generic API proxy in `app/api/lifeos/[...path]/route.ts` so `matrix/*` paths require a real session and cannot use dev bypass fallback.
- Added regression tests:
  - `tests/matrix-session-route.test.ts`
  - updated `tests/proxy-route.test.ts` for matrix no-bypass guarantee
- Updated `README.md` and `docs/CODEX_MEMORY.md` for matrix auth-bridge behavior.

### Why
- Execute MVP3 web session/auth bridge scope so matrix access has explicit, recoverable auth failure modes and no bypass path.

### Commands/tests run
- `./node_modules/.bin/tsc --noEmit && npm run test && npm run build`

### Known issues/risks
- Bridge token is currently web-issued and API does not yet validate it; server-side token validation can be added in a follow-up hardening pass.

### Next steps
- Integrate `GET /api/matrix/session` into matrix client boot flow in UI.
- Add server-side bridge token verification path for matrix mutation APIs.

## 2026-02-17 (MVP3 custom matrix client UI)
### What changed
- Extended `app/page.tsx` with a new `chat` app view and dashboard launcher card.
- Implemented Matrix client shell UX:
  - room list with unread badges and explicit sync action
  - timeline panel with composer and send states (`sending/sent/failed`)
  - progressive disclosure of bridge details in an advanced panel
- Added contextual quick actions to inject workflow context directly into chat composer:
  - share active task
  - share food context
  - share daily focus
- Wired chat initialization to `GET /api/matrix/session` only when chat view opens (event-driven load; no polling loops).
- Added room-read behavior that explicitly clears unread signal and emits relay update hook.
- Updated `README.md` and `docs/CODEX_MEMORY.md` for matrix UI behavior.

### Why
- Execute MVP3 chat UI scope with a LifeOS-native workflow surface instead of a generic clone, while keeping core chat path simple and explicit.

### Commands/tests run
- `./node_modules/.bin/tsc --noEmit && npm run test && npm run build`

### Known issues/risks
- Timeline currently uses local optimistic state and relay hooks; historical message backfill API is not yet exposed.

### Next steps
- Connect timeline read model to backend event history endpoint when available.
- Add mobile-optimized composer affordances and keyboard shortcuts for desktop power flow.
