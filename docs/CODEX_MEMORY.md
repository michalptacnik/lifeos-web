# LifeOS Web Memory

## Current state
- Unauthenticated flow now prioritizes email/password; SSO is secondary.
- Local auth proxy routes exist with CSRF checks:
  - `app/api/local-auth/register/route.ts`
  - `app/api/local-auth/login/route.ts`
- Proxy hard-fails in production when any dev auth bypass env is configured.
- Task/worktime/automation data loading uses targeted invalidation instead of full refresh on every mutation.
- Added inventory app shell with subtype-focused views (`Home`, `Work`, `Food`) and direct API-backed CRUD.
- Added session profile route (`/api/session/profile`) and client-side profile consumption.

## Key files
- `app/page.tsx`
- `lib/auth.ts`
- `app/api/lifeos/[...path]/route.ts`
- `app/api/session/profile/route.ts`
- `app/api/local-auth/*`

## Operational notes
- Web requires same strong `INTERNAL_API_KEY` as API.
- NextAuth credentials flow relies on API `/auth/login`.
- Production must keep `ALLOW_DEV_AUTH_BYPASS=false` and `DEV_AUTH_BYPASS_EMAIL` unset.

## Open risks
- `app/page.tsx` is large; further modularization is recommended.
- Some UX messages still map generic backend errors.
- Inventory interactions currently support create/list/delete; edit/adjust flows are still pending.
