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

## Quick Start
```bash
npm install
npm run dev
```

## Security notes
- `ALLOW_DEV_AUTH_BYPASS` is development-only and must remain `false` in production.
- Any production runtime with dev bypass env vars configured is treated as a server misconfiguration.
