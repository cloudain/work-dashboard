---
status: accepted
---

# Deploy static SPA on GitHub Pages with Supabase backend

We will build the dashboard as a static React + Vite + TypeScript + Tailwind PWA deployed automatically to GitHub Pages via GitHub Actions, backed by Supabase (PostgreSQL, single-user Email/Password Auth with public signups disabled and Row-Level Security, plus one Supabase Edge Function serving a token-protected `.ics` calendar subscription feed). This avoids adding a separate hosting provider while delivering full mobile/macOS/Windows sync and live calendar integration on free tiers.

## Considered Options

- Next.js on Vercel + Supabase (requires a separate hosting account outside GitHub).
- Local-only web app with SQLite/JSON files (no direct phone access when working at clinics).
- Google Sheets API as backend (fragile schema, poor mobile UX, complex OAuth setup).

## Consequences

- Because GitHub Pages on GitHub Free requires a public repository, `resource/` and all personal backups/historical Excel files must stay gitignored and never enter Git history.
- Historical 2025–2026 financial records are imported at runtime via an in-app Import tool (or local script) directly into the authenticated Supabase account rather than hardcoded in the repository.
