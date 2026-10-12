# Developer guide

For people reading or changing NAI RICE's code. Feature behavior, storage layout and how prompts map to NovelAI
request fields are in [자세한 설명](자세한-설명.md) (Korean, user-facing); screen and region names are in
[screens.md](screens.md).

## Quick start

Needs Windows and Node.js LTS.

```powershell
npm ci
npm run dev
```

`npm run dev` builds the main process, then starts the Vite dev server (127.0.0.1:5173) and Electron. Renderer code
(`src/`) hot-reloads; changes in `electron/` need a restart.

> Dev mode uses the real `문서\NAI RICE` folder and the saved token. Generate sends real requests.

Opening only the Vite server in a browser has no `window.referenceDesk`, so [main.tsx](../src/renderer/main.tsx)
installs a preview API without file or generation features. Good for layout checks only.

| Command                    | Does                                                                |
| -------------------------- | ------------------------------------------------------------------- |
| `npm run typecheck`        | `tsc --noEmit`                                                      |
| `npm test`                 | Vitest once (`npm run test:watch` watches)                          |
| `npm run lint`             | ESLint                                                              |
| `npm run format`           | Prettier on everything (`format:check` checks only)                 |
| `npm run package:portable` | build, portable exe and `SHA256SUMS.txt` into `release/`            |
| `npm run package:win`      | build, installer, portable exe and `SHA256SUMS.txt` into `release/` |
| `npm run package:test`     | the same as a test build into `release-test/`                       |

Pass `typecheck`, `test` and `lint` before committing.

## Structure

```text
renderer                     preload                    main process
React + zustand        →  contextBridge exposes   →   handlers in electron/ipc.ts
src/renderer/              only window.referenceDesk    → electron/services/*
                                                         (files, NovelAI requests, token)
            ↘                                          ↙
                  src/core: rules independent of Electron and DOM
                  (prompt composition, request bodies, canvas layout, validation)
```

- **The renderer never touches files or the network.** A Content Security Policy blocks external requests; images
  load through the `desk-media://` protocol, limited to the storage folder ([window.ts](../electron/window.ts)).
- **The main process does not trust the renderer.** Generation requests are re-validated with zod and Anlas
  warnings are recomputed ([GenerationRequests.ts](../electron/services/GenerationRequests.ts)).
- **`src/core` is plain TypeScript,** used by both sides; most tests target it.
- **Services connect through small interfaces in [ports.ts](../electron/services/ports.ts).**
  [main.ts](../electron/main.ts) wires real implementations; tests pass fakes with only the needed methods.

### Folders

| Path                              | Contents                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/core/domain`                 | data shapes (`types.ts`)                                                                          |
| `src/core/validation`             | zod schemas for `library.json` and IPC input                                                      |
| `src/core/model`                  | defaults (`defaults.ts`), library mutations, record summaries for lists                           |
| `src/core/backup`                 | backups, migration from old formats                                                               |
| `src/core/prompts`                | prompt composition, prompt pieces, syntax checks, tag autocomplete search                         |
| `src/core/jobs`                   | per-scene jobs (`JobBuilder.ts`), job state transitions, queue summaries                          |
| `src/core/providers`              | NovelAI models and tags, request bodies, calls, streaming, errors, Anlas costs                    |
| `src/core/vibes`                  | NovelAI vibe file format                                                                          |
| `src/core/imaging`                | canvas auto layout, masks, mask brush, background detection, result cropping                      |
| `src/core/metadata`               | PNG chunks and NovelAI metadata read/write                                                        |
| `src/core/importers`              | NovelAI images, SD Studio projects                                                                |
| `src/core/output`                 | output file name rules                                                                            |
| `src/core/update`                 | parsing the latest GitHub release                                                                 |
| `src/shared/ipc.ts`               | types shared by renderer and main, per-feature API types (`LibraryApi`, `QueueApi`, …)            |
| `src/renderer`                    | UI. `views/` screens, `components/` parts, `store.ts` zustand state and save scheduling           |
| `electron/main.ts`                | app start, service creation and wiring                                                            |
| `electron/ipc.ts`                 | `ipcMain.handle` registration                                                                     |
| `electron/preload.ts`             | defines `window.referenceDesk`                                                                    |
| `electron/window.ts`              | window, `desk-media://` protocol, shortcuts                                                       |
| `electron/services`               | library storage, generation queue, output, token vault, account, export, vibe files, update check |
| `tests/unit`, `tests/integration` | Vitest tests                                                                                      |
| `scripts/`                        | hash files, packaging hook that swaps ffmpeg for a free-codec build                               |

`dist-electron/`, `dist-renderer/`, `release/`, `release-test/` are build output. `release/` holds only public
stable builds; test builds go to `release-test/`.

## One generation, end to end

1. **Make jobs (renderer):** [actions.ts](../src/renderer/actions.ts) pins inpaint canvas and mask into
   `inputs/<sha256>.png` via `prepareInputs`, then `buildJobs` makes a job snapshot per scene. Final prompts come
   from `composeRequestPrompts`, which the preview also uses.
2. **Validate (main):** `generation:enqueue` → `GenerationRequests` checks the schema and Anlas warnings, then
   enqueues.
3. **Generate (main):** [GenerationQueue.ts](../electron/services/GenerationQueue.ts) calls
   `NovelAIProvider.generate` one at a time with a delay. Bodies come from
   [NovelAIRequestBuilder.ts](../src/core/providers/NovelAIRequestBuilder.ts). Rate limit, server and network
   errors retry after 2/5/10 s; auth, quota and bad requests stop. Vibes are encoded (or read from the `vibes/`
   cache) right before the request. With streaming on, intermediate frames go out as `generation:preview`.
4. **Save (main):** [GenerationOutput.ts](../electron/services/GenerationOutput.ts) crops the generate area (inpaint
   only), saves into the scene folder with metadata and appends to `generations.json`. The renderer receives the
   new record as an event.

Snapshots contain prompts, settings and input hashes, so library edits do not change queued jobs. The queue is
persisted; on restart, pending jobs come back paused.

## Common changes

### Add a setting

Four places must agree for stored values:

1. `src/core/domain/types.ts`: the field
2. `src/core/validation/schemas.ts`: schema with `.default(...)` (old files lack the value)
3. `src/core/model/defaults.ts`: the value for new items
4. UI: `views/library/PresetEditor.tsx` for presets, `views/SettingsModal.tsx` for app settings

If it goes into requests, also change `NovelAIRequestBuilder.ts` and its tests. Bump `schemaVersion` and add code
to `src/core/backup/Migration.ts` only for incompatible format changes.

### Add an IPC call

1. `src/shared/ipc.ts`: add the method to the feature API type (`LibraryApi`, `AppApi`, …)
2. `electron/ipc.ts`: `ipcMain.handle('area:action', ...)`; validate renderer input with a schema
3. `electron/preload.ts`: wire with `ipcRenderer.invoke`
4. `src/renderer/main.tsx`: stub in the preview API (typecheck will tell you)
5. In the renderer call it through [desktop.ts](../src/renderer/desktop.ts) helpers like `libraryApi()`, not
   `window.referenceDesk`.

Outbound actions (opening a browser, etc.) check the URL in main. The update window opens only
`https://github.com/` links.

### NovelAI models or tags

Model list, quality tags, UC preset text and per-model features are in
[NaiModels.ts](../src/core/providers/NaiModels.ts). Version differences in request bodies (V3, V4/V4.5, V5) are in
`NovelAIRequestBuilder.ts`; tests pin the actual request shapes.

## Renderer

### State and saving ([store.ts](../src/renderer/store.ts))

- One zustand store. `library` is the whole `library.json` as one immutable object; `updateLibrary(recipe)`
  replaces it and schedules a save. `useLibrary()` (about 30 components) re-renders on **any** library change,
  including each keystroke in a prompt field. `useResolvedProject` calls `resolveProject` on every render; it is
  not memoized.
- Saving: `scheduleSave(key, task, 400 ms)` debounces per key; `library` saves send the whole object over IPC, and
  `Library.save` (main) re-validates it with the zod schema and rewrites `library.json` atomically. `flushSaves` runs
  on unload and before generating. Reference canvases save separately (`ReferenceEditor`, key per reference).
- Results: `generations[projectId]` is loaded lazily per project (`loadGenerations`) and appended from the
  `generation:record-added` event. `emotionRecords` filters and sorts a project's records per scene; `GalleryView`
  groups them once per change instead.
- Queue: every `generation:queue-update` replaces `queue`; components select `state.queue` (gallery, scene detail,
  free view, queue bar, sidebar). Streaming frames go to `previews[jobId]`; `StreamPreview` selects only its jobs.
- UI-only state (column count, folded folders, panel widths …) is in `localStorage` via `readUiState`/`saveUiState`.

### Screens and shared parts

- Views: `ProjectView` (gallery or scene detail), `FreeView`, `LibraryView` (+ `views/library/*Editor`),
  `ReferenceEditor`, `SettingsModal`/`StorageTab`. Region names: [screens.md](screens.md).
- Actions that call the main process live in plain modules, not components: `actions.ts` (generate),
  `generationOps.tsx`, `emotionOps.tsx`, `freeImageOps.ts`, `projectOps.tsx`, `importers.tsx`.
- Lists: `useBoxSelection` (marquee, Ctrl/Shift click, Delete/Esc/Ctrl+A), native drag with `listDrag.ts` payloads
  (multi-select moves), `ListFolder`. Gallery cards use the same drag.
- Canvases: `canvasViewport.ts` (transform viewport: zoom at cursor, free pan), `ReferenceCanvas` (inpaint mask in
  1/8 cells as `Int8Array` overrides, `core/imaging/MaskBrush`), `DrawCanvas` (three stacked GPU canvases),
  `ImageStage` (result viewer). `zoom.ts` holds the shared wheel handling.
- `styles.css` is one file (~4,400 lines) with section title comments as landmarks; colors are theme tokens.

## Performance

What has been measured and fixed, so it is not undone. Numbers are from dev-mode benchmarks unless noted.

| Area                     | Fix                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Reference area drag      | mask encoded to PNG once on release, not per move (~30 ms per move before)             |
| Ratio slider             | latest pending value only; canvas passed while editing; row-based mask math (12→2 ms)  |
| Inpaint background color | repaint the same canvas instead of rebuilding (676→7 ms per change)                    |
| Mask brush               | paints `Int8Array` cells and redraws once per frame                                    |
| Draw brush               | GPU canvases, stamps on the visible stroke canvas, undo as canvas copies (no readback) |
| Gallery marquee          | box drawn to the DOM, item rects measured once per drag, state only on pick change     |
| Gallery cards            | records/jobs grouped once, `EmotionCard` memoized with stable callbacks                |

Rules and traps:

- **Judge UI speed on a production build.** React 19.2 dev mode logs changed `Uint8Array` props element by
  element and freezes on mask edits; production does not.
- Do not use `willReadFrequently` on canvases that are shown or drawn every frame (CPU canvases re-upload to the
  GPU). Read pixels from a separate copy.
- Chromium already sends `pointermove` once per frame; deferring the reaction by another rAF makes drags feel late.
  Use `getCoalescedEvents()` for strokes.
- **User feel preferences:** lists and gallery cards use native HTML5 drag; a pointer-driven clone was tried and the
  user preferred the native feel. Mask brush feel is the reference for other brushes.
- Measuring without the real app: run Vite and drive an Electron window with `executeJavaScript` (synthetic pointer
  events, `performance.now()` around handlers and rAF). `webContents.sendInputEvent` wheel events do not reliably
  reach the page; the DevTools protocol `Input.dispatchMouseEvent` does. Synthetic `setPointerCapture` fails for
  pointer IDs the browser does not know.

Likely candidates (observed, not measured): library-wide re-renders from `useLibrary()` while typing; whole-library
zod validation and JSON write on each save; `resolveProject` per render.

## Tests

- `tests/unit`: `src/core` and service units; services use fakes matching `ports.ts`.
- `tests/integration`: library migration, storage cleanup, vibe files and the generation pipeline end to end in a
  temp folder, with NovelAI faked.
- No test calls the real NovelAI.
- `greatOathFixtures.test.ts` runs only with an external sample folder (`GREAT_OATH_NOTES`), otherwise skipped.

## Release

1. Bump the version in `package.json` and `package-lock.json`.
2. Write the new version's entry at the top of `CHANGELOG.md` (Korean). It becomes the GitHub release notes and is
   shown in the app's update window.
3. `npm run package:win` makes the installer, portable exe and `SHA256SUMS.txt` in `release/`.
4. Create a GitHub release tagged `v<version>` with the three files.

The update check ([UpdateCheck.ts](../src/core/update/UpdateCheck.ts)) reads this repo's `releases/latest` and
looks for assets ending in `-setup.exe` or `-portable.exe`. Names follow `artifactName` in `electron-builder.yml`;
do not change it.

## Troubleshooting

| Symptom                                               | Fix                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev` runs like Node without a window         | `ELECTRON_RUN_AS_NODE` is set. PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE`     |
| `EBUSY` while packaging (`win-unpacked\NAI RICE.exe`) | the app in that folder is running or the file is briefly locked; close it and retry   |
| The app cannot read `library.json`                    | usually types, schema and defaults disagree; originals are in `문서\NAI RICE\backups` |
