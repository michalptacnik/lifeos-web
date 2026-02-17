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
