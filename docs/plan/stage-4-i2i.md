# Stage 4: i2i (implemented 2026-10-10, awaiting user check)

Facts from stage 0: request body and size behavior in [stage 0](stage-0-api-cost.md#a-free-range-stage0-a). The
server stretches to the requested size, so the app must crop or pad first. Free in the Opus range; above it the
formula × strength, rounded up, minimum 2. Opaque input never becomes transparent.

## Results

- **Input prep (main):** `Library.prepareImageInput` fits results, reference originals or picked files to the
  target size into `inputs/<sha256>.png`. Crop keeps the top; pad centers with white; transparency is flattened to
  white (only opaque input was probed). Picked files go through `storeImageInput` first.
- **Settings:** `GenerationSettings.img2imgStrength` (default 0.4, from stage 0) and `img2imgNoise` (0), in the
  preset's 「일반 생성 · i2i」 section; defaults for the send-to-i2i dialog.
- **Project i2i mode dropped (user decision):** project i2i mode, an i2i source library and an early free i2i were
  built and removed; inpaint is the better tool for refining. Instead, results can go to:
  - 「인페인트 만들기」: a new reference (inpaint item) using the result.
  - 「자유 생성으로 보내기」 (was 「자유 생성 i2i」): free generation [i2i] with 「전체 다시 그리기」 (whole image at the preset's i2i strength/noise)
    or 「인페인팅」 (only painted areas; `inpaintStrength` → `inpaintImg2ImgStrength`). The image is stored in
    `sources/<hash>.png`, padded right/bottom to multiples of 64; results are cropped back and saved under
    `projects/free/outputs/<i2i|인페인트>/<date>/`. The mask saves when painting stops. Values are edited in the
    「i2i 이미지」 card with `PresetNumberRow` (±0.05) and saved to the preset. Center tabs: [i2i 이미지 / 마스크
    칠하기], 「그리기」 and [원본과 결과]; a new result switches to the latter.
  - 「그리기」 (2026-10-12): paint over the i2i image like the NovelAI web canvas's Draw (`DrawCanvas`); strokes are
    baked into a new i2i image on 「이미지에 합치기」, generate or leaving the tab (`replaceFreeImagePixels`).
    Without an image it starts from a blank white canvas at the preset size (`newBlankFreeImage`).
  - Old i2i-mode projects read as inpaint; the short-lived [자유 인페인팅] mode reads as i2i + inpainting.
- **Records:** i2i results store the actual input (`inputFile`), shown in record info.
- **「다듬기」 dialog** (was 「i2i로 보내기」, renamed 2026-10-13 after NovelAI web's Enhance): from the result bar, image context menu, scene card 「대표 이미지」 group, and the
  picked-cards bar (many scenes at once). Target size (closest free resolution by default), fit method, strength,
  noise, count, seed (+1 from source or random). Uses the source's final prompt and settings minus the reference
  inset tag (`buildResultImg2ImgJobs`); results stack on the source scene with `sourceRecordId`.

## Left

Settle the default strength (0.3–0.5) with the user in the free range.
