# AGENTS.md

NAI RICE: a Windows Electron app that builds character emotion (scene) image sets with NovelAI inpainting.
Read [docs/dev-guide.md](docs/dev-guide.md) for structure and workflow and [docs/plan.md](docs/plan.md) for
current work first. Stage details live in `docs/plan/`; open only the stage you are working on. Screen and region
names are in [docs/screens.md](docs/screens.md). For performance or refactoring work, read the Renderer and
Performance sections of the dev guide: they list measured fixes and the user's feel preferences not to undo.

Agent docs are in English. User-facing docs stay in Korean: `README.md`, `CHANGELOG.md`, `docs/자세한-설명.md`,
`docs/인페인트-실험.md`.

## Rules

- **Never push, tag or release on GitHub unless the user asks.** Local commits only, one per task. The user tests
  locally and pushes.
- Talk to the user in Korean. UI text uses the polite "~합니다/~십시오" form; avoid translationese.
- The user sets versions. Do not bump the version before a public release.
- Real NovelAI calls only within the Opus free range (≤1024×1024, ≤28 steps, 1 image). Possibly paid features
  need the user's permission and run one image at a time. Claude does not run real calls; the user runs them
  ([docs/plan/probes.md](docs/plan/probes.md)). The token is used only for NovelAI requests.
- Never put the user's prompts (e.g. artist tag lists) into docs or commits.
- Do not commit the user's own uncommitted edits; stage only your own hunks.

## Comments

Comment only what the code cannot tell. No other comments.

- Keep: why (rejected alternatives, why order or timing matters); external constraints (NovelAI API, Electron,
  Windows, browser quirks); where values come from (measurements, numbers or formats taken from the NovelAI web);
  easy-to-miss traps and compatibility (how old data is read); for type fields, only units, formats and special
  values (what 0 or empty means).
- Skip: comments that restate the code, JSDoc that spells out names, section dividers (`// ── 라이브러리 ──`;
  exception: the section titles in `styles.css`, which are landmarks in a long file), change history (that goes in
  commit messages).
- If a rename makes a comment unnecessary, rename instead.

## Commands

- `npm test`, `npm run typecheck`, `npm run lint` must all pass before each commit.
- Format only changed lines. Running `prettier --write` on a whole file can reformat untouched code.
- `npm run package:win`: installer, portable and `SHA256SUMS.txt` into `release/`. **`release/` holds only public
  stable builds.** Use only for a version chosen for release.
- `npm run package:test`: test builds into `release-test/`. "패키징해 줘" means this one unless stated otherwise.
  Do not package unless asked; the user checks with `npm run dev`.

## Environment (Windows)

- Unset `ELECTRON_RUN_AS_NODE` before running or packaging.
- EBUSY/EPERM while packaging: Windows Defender is scanning the new exe. Build with
  `-c.directories.output=release-new`, then swap it with `release/` (or `release-test/`). The user may be running
  the app from `release/`.
- `legacy/`, `ForTest/`, `release/`, `release-test/` are not in git (`release-*/` ignored). Old builds go in
  `legacy/release-*`.
- Probe scripts: `legacy/tools/nai-exp/`. GitHub release scripts: `legacy/tools/release/`. Get a GitHub token with
  `printf 'protocol=https\nhost=github.com\n\n' | git credential fill`.
- Repository: `Rtyco/NAI-RICE`. Commit author comes from git config (amagi).
