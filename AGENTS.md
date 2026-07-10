# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

### Project knowledge

Long-lived, cross-task facts and gotchas live in `PROJECT_KNOWLEDGE.md` at the repo root — check it on entry / new-chat resume / cross-task decisions.

## Agent skills

### Issue tracker

Local markdown under `.scratch/` at the repo root — issues are the carrier for `spec`/`prd`/`bug`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles; the label string equals the role name (`needs-triage`, `needs-info`, `ready-for-human`, `ready-for-agent`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root (created lazily by `/domain-modeling`). See `docs/agents/domain.md`.

### CodeMap

Start here when exploring the codebase: a project-level terrain index under `docs/codemap/`; refresh or add feature maps via `/codemap`; when unsure whether a map is still trustworthy, run `/codemap` drift-check — if it reports drift, update the affected map.

### Git contract

Solo workflow (develop on the current branch) + conventional-commits messages referencing the issue slug. `/sdd-flow` and `/tdd` follow it for commits and branch decisions. See `docs/agents/git-contract.md`.
