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
