# LifeOS Web

Next.js frontend for LifeOS with responsive module-driven UX.

## Core Screens
- Onboarding
- Dashboard
- Tasks
- Budgets
- Inventory
- Obligations
- Notifications Center

Inventory includes food-specific recipe CRUD, feasibility checks, and quick-add actions for missing ingredients.
Matrix includes a LifeOS-oriented chat shell (rooms, timeline, composer, unread signals, and context quick actions).

## Quick Start
```bash
npm install
npm run dev
```

## Security notes
- `ALLOW_DEV_AUTH_BYPASS` is development-only and must remain `false` in production.
- Any production runtime with dev bypass env vars configured is treated as a server misconfiguration.
- Matrix proxy paths require a real authenticated session (dev bypass never grants Matrix access).
- `GET /api/matrix/session` returns explicit recoverable auth states for missing/expired sessions and a short-lived Matrix bridge token.
