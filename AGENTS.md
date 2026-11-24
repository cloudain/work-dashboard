# Work Dashboard (`work-dashboard`)

Work dashboard project workspace.

## Home Vault Back-Pointer

When an agent session is started directly inside this repository rather than from `home-vault`:

- **Home Repo**: `../home-vault` (or `~/AI Workspaces/home-vault` on macOS / `%USERPROFILE%\AI Workspaces\home-vault` on Windows)
- **Cross-project standards**: consult `../home-vault/docs/standards/` as needed (`coding.md`, `medical.md`, `writing-and-courses.md`)
- **Long-term memory & glossary**: consult `../home-vault/wiki/index.md` and `../home-vault/GLOSSARY.md` before cross-repo or recurring architectural decisions.
- **Active handoffs**: check `../home-vault/handoff/ACTIVE.md` when resuming cross-device tasks (macOS ↔ Windows); update via `/handoff` before switching machines.

## Local Development & Verification

- **Install**: `<command>`
- **Test**: `<command>`
- **Lint / Typecheck**: `<command>`

## Local Boundaries

- Repo-local specs, `.science/` notebooks (if research), and docs live inside this repository.
- Cross-repo plans belong in `../home-vault/.scratch/`, and cross-project durable insights belong in `../home-vault/wiki/`.
- Keep Git history isolated to this repository.
