# Stage 3: txt2img and the free generation screen (done)

## 3-1. Mode switch (2026-10-10)

- `Project.mode` (`reference` | `txt2img`, old projects read as `reference`); buttons [인페인트 | 일반 생성] in the
  project header. The chosen reference (`referenceId`) is kept when switching.
- Size: `GenerationSettings.width`/`height` (default 832×1216, 256–2048, multiples of 64), picked on the resolution
  chip (free presets or 「직접 입력…」). Inpaint keeps using the reference canvas size.
- `buildTxt2ImgJobs` shares scene/seed/prompt handling with inpaint. The reference inset tag is added only for
  inpaint (preview too). Results go to `outputs/일반 생성/<scene>/`; record info shows the kind.
- **V5 Curated** (`nai-diffusion-5-curated`, txt2img only, labelled "(일반 생성 전용)"): quality tags and UC presets
  match V5 Full; no automatic nsfw. The web sends V5 Curated inpainting to the V4.5 Curated inpaint model, so it is
  not in the inpaint list; an inpaint project with it is blocked with a message. User-tested.

## 3-2. Free generation (2026-10-10)

- Sidebar top 「자유 생성」. Results live in `projects/free/` (project IDs always have a random suffix, so no
  clash). Records, thumbnails, delete and storage share project code.
- Files: `outputs/<일반 생성|i2i|인페인트|디렉터 툴>/<YYYY-MM-DD>/<date>-<time>__<seed>.<ext>` (local date, format
  from settings, default lossless WebP). Older results remain in `outputs/<YYYY-MM-DD>/`. The filename template is
  not used (no scene).
- Layout: header [일반 생성 | i2i | 디렉터 툴]; chips for preset, characters (none allowed), positions, resolution;
  center preview + `ResultBar` + filmstrip; right panel prompt, insert position, dock with count (1–20), estimate,
  generate. Last inputs are saved in `Library.freeGeneration`.
- Prompt insert position: end of common positive or end of character prompt (`FreeGeneration.promptPosition`,
  default common; falls back to common without a character prompt). Stored in the record's `emotionPrompt` for
  "restore prompt"; `emotionId` is empty.
- One request per image to stay in the Opus free range.
