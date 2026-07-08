# Issue tracker: Local Markdown

Issues for this repo live as markdown files in `.scratch/`. An **issue is the carrier** for one of three kinds of work — `spec`, `prd`, or `bug`.

## Conventions

- One feature per directory: `.scratch/<YYYY-MM-DD>-<feature-slug>/`
- Only `spec` issues go in `specs/`; `prd` and `bug` (the parents) sit at the feature root, beside `specs/`:

  ```
  .scratch/2026-06-18-login-redirect/
  ├── 01-fix-login-redirect-loop.md   # prd or bug — the parent
  └── specs/
      ├── 01-validate-token.md         # spec
      └── 02-refresh-flow.md           # spec
  ```

- Files are numbered `<NN>` from `01` within their folder. Number `specs/` in dependency order so `Blocked by: #<n>` resolves to a sibling spec; `Parent: #<n>` points at the feature-root parent.
- Each issue opens with a `Type:` line (`spec` / `prd` / `bug`), a `Status:` line (see `triage-labels.md`), and a `## Comments` section appended at the bottom.

Example minimal issue file:

```markdown
# Fix login redirect loop

Type: bug
Status: needs-triage

<the bug report / spec / PRD body>

## Comments

- 2026-06-18 — reproduced on staging with…
```

## When a skill says "publish to the issue tracker"

Create `.scratch/<YYYY-MM-DD>-<feature-slug>/specs/<NN>-<slug>.md` for a `spec`, or `.scratch/<YYYY-MM-DD>-<feature-slug>/<NN>-<slug>.md` (feature root) for a `prd`/`bug`. Create the directory if needed.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.
