# Plan: NovelAI feature expansion

Work after 1.0.0. Version 1.0.0 did one thing: build scene sets with a reference inset (inpaint). Later stages add
other NovelAI generation modes and conveniences, using NovelAI features only (no local models).

**How to read:** read this file, then open only the stage file you are working on. Finished stage files are for
when you change that feature. Real NovelAI calls: [probes.md](plan/probes.md). Code structure, renderer state and
performance history: [dev-guide.md](dev-guide.md#renderer).

Last updated 2026-10-13.

## User decisions

- Scene mode (project gallery) and a separate **free generation** screen.
- Possibly paid features: ask first, one image per feature.
- Releases bundle several stages; the user sets the version and asks for push/tag/release.
- UI says 「씬」 (scene) instead of 「감정」, and 「인페인트」 instead of 「레퍼런스 생성」. Code names (`emotion`,
  `emotionSets`, mode `reference`) and storage are unchanged. Existing set names are not renamed.
- Screens are grouped by task order (inputs → run → results), not by widget type.
- Never call i2i "upscale" in the UI (avoids confusion with NovelAI's real upscaler). The resize-and-redraw dialog
  is 「다듬기」 (NovelAI web: Enhance); moving a result into free i2i is 「자유 생성으로 보내기」.
- Lists and gallery cards keep the native drag feel (a pointer-driven clone was tried and rejected).

## Status

| Stage | Content                                              | Status     | File                                         |
| ----- | ---------------------------------------------------- | ---------- | -------------------------------------------- |
| 0     | NovelAI API and cost probes                          | done       | [stage-0](plan/stage-0-api-cost.md)          |
| 1     | Sidebar folding, clear mask, Anlas estimate          | done       | [stage-1](plan/stage-1-convenience.md)       |
| 2     | Job kinds in the generation pipeline                 | done       | [stage-2](plan/stage-2-job-kinds.md)         |
| 3     | txt2img, mode switch, free generation screen         | done       | [stage-3](plan/stage-3-txt2img-free.md)      |
| 4     | i2i, send results to i2i                             | user check | [stage-4](plan/stage-4-i2i.md)               |
| 5     | Director tools (Emotion, bg removal, …)              | done       | [stage-5](plan/stage-5-director-tools.md)    |
| 6     | Character reference and vibe transfer                | user check | [stage-6](plan/stage-6-reference-vibe.md)    |
| 7     | V5 Effort, multiple characters and positions         | user check | [stage-7](plan/stage-7-effort-characters.md) |
| 8     | NovelAI web features (sampling, vibe files, streams) | user check | [stage-8](plan/stage-8-web-features.md)      |

Stage 5: the user tried the director tools in the app on 2026-10-12 and they worked.

## Off-stage work (one line each)

- **Refactor:** removed duplication in the generation flow; queue retry/cancel/pause and provider tests were
  written first to prove behavior stayed the same.
- **Double results bug:** React StrictMode ran `initialize()` twice in dev, subscribing to main-process events
  twice. Fixed with unsubscribe, one-time init and record ID dedupe.
- **Reference area drag lag:** the mask is encoded to PNG once on release instead of on every move (~30 ms).
- **Ratio slider lag:** redraw immediately, keep only the latest pending value; pass the canvas itself while
  editing (PNG only on save); row-based mask math (12 ms → ~2 ms); GPU display canvas.
- **Dev-only freezes:** React 19.2 dev mode logs changed `Uint8Array` props (the mask) element by element. Not in
  production builds; judge UI speed with a packaged build.
- **Output folders:** `outputs/<인페인트|일반 생성|i2i|디렉터 툴>/<scene or date>/`.
- **Storage:** results and full canvases are saved as lossless WebP by default (~41% smaller than PNG, same
  pixels). Text metadata goes into XMP and is restored on import and PNG export. `inputs/` is still PNG.
- **Task-grouped screens (2026-10-10):** gallery top bar = card actions; queue bar right slot (`BottomSlot`) =
  generate group. Result screens: image, `ResultBar` and filmstrip in the middle, inputs and generate dock on the
  right. `ResultActions` feeds both the bar and the image context menu. Line icons (`Icon`) instead of emoji.
  Inpaint editor toolbar is grouped (areas | brush | invert/clear/undo … view). Areas are named 참고 영역, 결과
  영역, 생성 영역 (teal).
- **Library edit popups:** chip edit buttons open the editor in `LibraryEditorDialog` instead of leaving the
  screen.
- **Lists:** sidebar projects and library lists share `listMenu`; multi-select delete and multi-drag
  (`moveItems`); one-level list folders (Ctrl+G); the library list folds like the sidebar.
- **Mask brush like NovelAI web:** the mask layer is 1/8 of the image and painted in those cells
  (`core/imaging/MaskBrush`); the brush cell outline follows the cursor.
- **Viewer:** wheel zoom at the cursor, drag to pan, 1:1 and original-size window, collapsible filmstrip;
  middle-button pan on the mask canvas too.
- **2026-10-12 polish:** Ctrl+A selects all gallery cards; Del deletes the shown result; result bar gets save /
  show in folder / delete; scene duplicate/delete moved to 「씬 ⋯」; inpaint editor uses the result-screen layout;
  left `PromptPanel` edits the chosen preset's common prompts and character prompt sets; resizable panels
  (`PanelResizer`); Tab/Shift+Tab between scenes. Choosing a preset in "send to i2i" was dropped as too complex.
- **Projects without characters:** like free generation; scene prompt and reference inset go to the common side.
- **Pickers:** configuration chips open a checklist popover (`ChecklistChip`) with folders and edit pencils. Chip
  edit buttons were removed once, then restored on request. The resolution chip has a custom size window (64 px
  steps).
- **Title bar:** one 40 px row (`TitleBar`): sidebar toggle, app name with version or update badge, location,
  icon-only 작업 폴더 and 프로그램 설정, window buttons. JSON import is in settings › 저장 공간 · 백업 and Ctrl+O.
- **Shortcuts:** 1–8 switch screens in sidebar order (ignored while typing); F1 shortcut list; F2 rename; F5
  reload results and account; Ctrl+A/Ctrl+D select/deselect in main lists; F, Home/End, Ctrl+Shift+S in results;
  Ctrl+P preview; Ctrl+E export; Alt+Up/Down, Ctrl+Shift+N/D and Delete in the library. The in-app list is the
  settings 「단축키」 tab.
- **Images to aids:** dropped or pasted (Ctrl+V) images can become a new character reference or vibe, linked to
  the open project.
- **참고 chip toggle (2026-10-12):** one button inside the chip shows the current mode (레퍼런스/바이브) and flips
  it on each click; picks on the other side are kept.
- **Aid fixes (2026-10-12, user report):** the 참고 chip is also in free generation (일반 생성 and i2i; fields on
  `FreeGeneration` like `Project`). The Anlas confirm popup is gone; estimates still show by the generate button
  and in the queue. Inpaint + character reference gave bad images in the user's test (vibes were fine), so the
  picker shows a warning in inpaint requests instead of blocking.
- **2026-10-12 list (user request):** free generation without any prompt; Danbooru tags as of 2026-10-01
  (dbr-e621-lists-archive, ≥25 posts); settings window fixed at the 화면 · 테마 size; bigger scene cards in the scene
  set editor; title bar actions (see Title bar above); background color repaint in place (676 → 7 ms per change);
  「그리기」 Draw tab in free i2i (see screens.md); inpaint mask fill bug at the top-left (negative `fill` end) and
  free pan on inpaint canvases; streaming frames in scene detail. Gallery reordering moved to pointer events
  here and back to native drag on 2026-10-13 (user preference).
- **2026-10-13 follow-ups (user request):** tag autocomplete stays open after a space or underscore that ends a
  word; whole `{}`/`[]`/weight regions are tinted (nested ones deeper); title bar is icon-only with the version by the
  name, JSON import only in settings; scene grid marquee and reorder no longer re-render every card per move
  (grouped records, memoized cards, DOM-drawn box, per-frame hit tests, edge auto-scroll); Draw stacks three GPU
  canvases and stamps straight onto the visible stroke canvas (no per-frame full redraw, no undo readbacks).
- **2026-10-13 second round (user request):** 「i2i로 보내기」 → 「다듬기」 (NovelAI web calls it Enhance), 「자유 생성
  i2i」 → 「자유 생성으로 보내기」; scene cards went back to native drag like the library lists (the user preferred that
  feel over the pointer-driven clone) and move all picked cards together; Ctrl+wheel zooms the window unless a canvas
  or image viewer already took the wheel (renderer sends `app:zoom`).
- **Selection bars (2026-10-13):** the 「N개 선택」 bars in the sidebar and library lists are size containers; when
  narrower than their labels (300 px, vibes 400 px) only the count and icon buttons remain.
- **Docs (2026-10-13):** dev-guide gained Renderer (state, saving, shared parts) and Performance (measured fixes,
  traps, how to measure, candidates) sections for an optimization pass.

## Next

No push yet; local commits only.

0. Code optimization pass (another session): start from [dev-guide § Performance](dev-guide.md#performance);
   keep behavior and the user's feel preferences; measure before and after on a production build.

1. User checks with `npm run dev`: stage 4 (free-range i2i to settle the default strength, 0.3–0.5), stage 6 and
   stage 8 paid one-image tests (lists in those files), stage 7 (Effort Medium, two characters, positions).
2. Maybe store `inputs/` as lossless WebP too (needs a PNG conversion before sending).
3. Open questions: the upscale endpoint's `model` value; how V5 quota is consumed (whether i2i costs double).

## Per stage

1. Code and tests (`npm test`, `npm run typecheck`, `npm run lint`).
2. Real NovelAI checks via the probe tools, free range only.
3. Update the stage file's results and the status table above; log off-stage work above.
4. Local commit only.
5. On a release request: bump version → top section of `CHANGELOG.md` → `npm run package:win` → user check →
   push/release when asked ([dev guide](dev-guide.md#release)).
