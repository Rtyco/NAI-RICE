# Probes: real NovelAI calls

Read only when a real request is needed.

## Rules

- Opus free range only (≤1024×1024, ≤28 steps, 1 image). Possibly paid features: show the list, get permission,
  **one image at a time**. The Anlas stop check runs after a request, so it cannot prevent one request's cost.
- **Claude does not run probes** (auto mode blocks real calls). Claude writes the plan and the command; the user
  runs it in a **separate PowerShell window** (the VS Code terminal failed).
- Output goes under `ForTest/` (git-ignored).

## Files (`legacy/tools/nai-exp/`, not in git)

Electron scripts that reuse the app's prompt composition, request building and provider.

- `entry.ts`: inpaint experiments. Copies the app's token files (`%APPDATA%\NAI RICE\Local State`,
  `novelai-token.vault`) into a temp userData and deletes them afterwards. Stops unless Opus (tier 3), stops
  **as soon as Anlas drops**, rejects >1024² or >28 steps up front. Plan JSON: `referenceImage`, `presetFile`,
  `baseLayout`, `characterId`, `promptSetId`, `emotionSetId`, `emotionName`, `seeds`,
  `conditions[{name, commonPositive, layout, model, generation}]`, `out` (examples `planVS.json`, `planI3.json`;
  generators `mkv5.cjs`, `mkI.cjs`).
- `probe.ts`: non-inpaint requests (txt2img, i2i, director tools, vibes). Plans `planS0a~d.json`, `planS5free.json`,
  `planS5paid.json`. Logs request shape (images hashed), response, Anlas and V5 quota per request to
  `<out>/<name>.json`; stops when spending exceeds the plan's allowance.
- Comparison sheet: `sheet3.cjs <out> <reference> <seed,…> <condition,…>` (env `EXP_PROJECT`).

## Running

From PowerShell use the Git Bash path; plain `bash` starts WSL and fails.

```powershell
cd C:\Users\bobow\Desktop\risu\reference-inpaint-desk
& "C:\Program Files\Git\bin\bash.exe" legacy/tools/nai-exp/run-probe.sh <plan.json>
```

`entry.ts` from Git Bash:

```sh
P=C:/Users/bobow/Desktop/risu/reference-inpaint-desk
cd <temp folder with the script>
$P/node_modules/.bin/esbuild entry.ts --bundle --platform=node --format=cjs \
  --external:electron --alias:P=$P --outfile=entry.cjs
unset ELECTRON_RUN_AS_NODE
EXP_PROJECT=$P EXP_PLAN=<plan.json> $P/node_modules/electron/dist/electron.exe entry.cjs
```
