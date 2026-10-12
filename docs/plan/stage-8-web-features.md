# Stage 8: Features from the NovelAI web (implemented 2026-10-12, awaiting user check)

User request, 2026-10-12. Values and formats come from NovelAI docs, the web `image` page scripts (downloaded
2026-10-12) and community code (NekoAI-JS, ComfyUI nodes). No real requests were made.

## Web feature table (relevant columns)

| Model | Variety+ base sigma | SMEA/DYN/Decrisp | Streaming | Char. reference (in inpaint) | Vibes |
| ----- | ------------------- | ---------------- | --------- | ---------------------------- | ----- |
| V3    | 19                  | yes              | no        | no                           | no    |
| V4    | 19                  | no               | yes       | no                           | yes   |
| V4.5  | 58                  | no               | yes       | yes (yes)                    | yes   |
| V5    | none                | no               | yes       | no                           | no    |

## Advanced sampling (preset sampling card)

- **Variety+** (`variety`): `skip_cfg_above_sigma = base × √(w×h / (832×1216))` (`varietySigma`). Matches a
  community measurement (V4.5 1280×1856 → 88.877…) and the web's V4 1024² value (19.343…). Ignored on V5.
- **SMEA / SMEA DYN** (`smea`, V3 only): `sm`/`sm_dyn`, txt2img only like community code. Paid cost ×1.2 / ×1.4.
- **Decrisp** (`decrisp`, V3 only): `dynamic_thresholding`.
- Image import reads `skip_cfg_above_sigma`, `sm`, `sm_dyn`, `dynamic_thresholding`; record info appends them to the
  model line.

## Character reference (Precise Reference) options

- **Strength** per item (`CharacterReference.strength`, default 1) → `director_reference_strength_values` (was
  fixed at 1).
- **Range** (user request): strength, fidelity and vibe strength accept ±10 (`AID_VALUE_LIMIT`). The web slider is
  0–1 but typed values may go negative. Server acceptance above 1 is unverified.
- **Several references:** `characterReferenceIds`, sent in picked order; they blend into one character. Estimated
  at 5 Anlas per reference per image (unmeasured). The old single `characterReferenceId` and old single-picture
  `aid` records read as one-item lists with strength 1.
- **With inpaint:** the web's `charRefInpainting` is on for V4.5, so inpaint projects can use it.

## Vibe files (`.naiv4vibe`, `.naiv4vibeBundle`)

Format (web code): `{ identifier: "novelai-vibe-transfer", version: 1, type, image?, id, encodings, name, thumbnail,
createdAt, importInfo }`; bundle `{ identifier: "novelai-vibe-transfer-bundle", version: 1, vibes }`.

- `type: "image"`: `image` is base64; `id` = SHA-256 of that string;
  `encodings[modelKey][SHA-256("information_extracted:" + value)] = { encoding, params }`.
- `type: "encoding"` (export as encodings, image metadata): no image; `id` = SHA-256 of the encoding; key
  `unknown`; information extracted in `importInfo`.
- Model keys: `v4-5full`, `v4-5curated`, `v4full`, `v4curated`.

Implementation (`core/vibes/VibeFile.ts`, `electron/services/VibeFiles.ts`):

- **Import:** drop a file or 「바이브 파일 가져오기」 under the library vibe list. Pictures go to `pictures/`,
  encodings to the queue's `vibes/<hash>-<model>-ie<value>.bin`, so a matching model/value costs no encode. Adds to
  the open project's vibes.
- **Encoding-only vibes:** `Vibe.encodingId` (document `id`) replaces the picture hash in the cache name; the
  picture is a thumbnail or tinted stand-in; information extracted is locked. Generating with a model/value that
  has no encoding is blocked at enqueue. Loading a real picture makes it a normal vibe. Full backups do not include
  `vibes/`, so these must be re-imported on another PC.
- **Export:** 「바이브 파일로 내보내기」 above the editor, context menu, or the multi-select bar. One →
  `.naiv4vibe`, several → bundle. Includes the PNG, a 256 px JPEG thumbnail and saved encodings. The editor lists
  saved encodings (model, information extracted).
- **Vibes inside images:** NovelAI image metadata (Comment) has `reference_image_multiple` (encodings),
  `reference_strength_multiple`, `reference_information_extracted_multiple`. Import dialog ⑤ offers 「이미지에 든
  바이브 N개 가져오기」, stored under the image's model (Source label). Raw-image values (V3 style) become normal
  vibes. Web downloads with vibes carry a vibe file/bundle in a `naidata` tEXt chunk (base64), used first; a PNG
  with only `naidata` imports directly. Stealth metadata limit raised from 1 MB to 8 MB (~65 KB per encoding).

## Streaming

- **Setting:** 프로그램 설정 → NovelAI 계정 · 요청 → 「생성 과정 보기 (스트리밍)」 (`AppSettings.streaming`, off).
- **Request:** `POST /ai/generate-image-stream` with `parameters.stream = "msgpack"` (`streamingRequest`). V4, V4.5
  and V5 only per the web table; V3 and director tools stay on ZIP. txt2img, i2i and inpaint all stream.
- **Response:** repeated 4-byte big-endian length + MessagePack map. `event_type`: `intermediate` (JPEG,
  `step_ix`), `final`, `error` (`message`). SSE (`data:` JSON, base64 images) is read when `content-type` contains
  `event-stream` (`NaiStream.ts`, no dependency).
- **Final image:** the web asks `image_format: "webp"`; the app does not and expects PNG. Non-PNG finals are
  converted (`ensurePng`), losing NovelAI metadata.
- **UI:** the main process sends `generation:preview`; scene cards, scene detail, the free generation stage and
  the queue bar show the latest frame and a progress bar (`StreamPreview`), cleared when the job ends. Progress uses Steps
  (× strength for i2i/inpaint).

## User checks

- Free: V4.5 Variety+ txt2img (record shows 「Variety+」); V3 shows SMEA/Decrisp, one V3 SMEA image (832×1216, 28
  steps is free).
- Paid, one each: inpaint + character reference (5); two references (expect 10, blended); strength 1.5 or −0.5
  (accepted?).
- Vibe files: drop a web `.naiv4vibe` (editor shows 「저장된 인코딩: V4.5 Full · …」, no encode cost); the web accepts
  app exports; import vibes from a NovelAI image via ⑤ and generate with the same model.
- Streaming (free): V4.5 txt2img shows frames then the result, and saved record info keeps prompt and seed; one
  each V5 txt2img, inpaint, free i2i; cancel stops at once.
