# Work Dashboard (`work-dashboard`)

Work dashboard project workspace.

## Home Vault Back-Pointer

When an agent session is started directly inside this repository rather than from `home-vault`:

- **Home Repo**: `../home-vault` (or `~/AI Workspaces/home-vault` on macOS / `%USERPROFILE%\AI Workspaces\home-vault` on Windows)
- **Cross-project standards**: consult `../home-vault/docs/standards/` as needed (`coding.md`, `medical.md`, `writing-and-courses.md`)
- **Long-term memory & glossary**: consult `../home-vault/wiki/index.md` and `../home-vault/GLOSSARY.md` before cross-repo or recurring architectural decisions.
- **Cross-Device WIP**: check `../home-vault/wip/ACTIVE.md` when resuming cross-device tasks (macOS ↔ Windows); update via `/wip` before switching machines.

## Local Development & Verification

- **Install**: `npm install` (Windows PowerShell: `npm.cmd install`)
- **Dev**: `npm run dev` (`npm.cmd run dev`)
- **Test**: `npm run test` (`npm.cmd run test`)
- **Lint / Typecheck / Build**: `npm run lint && npm run typecheck && npm run build` (`npm.cmd run lint && npm.cmd run typecheck && npm.cmd run build`)

## Local Boundaries

- Repo-local specs, `.science/` notebooks (if research), and docs live inside this repository.
- Cross-repo plans belong in `../home-vault/.scratch/`, and cross-project durable insights belong in `../home-vault/wiki/`.
- Keep Git history isolated to this repository.

## Agent skills

### Issue tracker

GitHub Issues on `cloudain/work-dashboard` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`GLOSSARY.md` and `docs/adr/` at repo root). See `docs/agents/domain.md`.
