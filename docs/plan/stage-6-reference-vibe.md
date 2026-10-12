# Stage 6: Character reference and vibe transfer (implemented 2026-10-12, awaiting paid user checks)

## Facts (stage 0)

- **V4.5 only.** On V5 both return **500** (not silently switched); retried 500s are not charged.
- **Character reference:** **5 Anlas** per image even in the free range. Fields: `director_reference_images`
  (image fitted onto a fixed canvas with black padding), `director_reference_descriptions` (`base_caption`),
  `director_reference_information_extracted: [1]`, `director_reference_strength_values`,
  `director_reference_secondary_strength_values: [1 - fidelity]`.
- **Vibe:** `POST https://image.novelai.net/ai/encode-vibe`, body `{ image, information_extracted, model }`;
  **2 Anlas** per encode; `application/binary` (~49 KB); reusing an encoding is free. Generation sends
  `reference_image_multiple` (base64 encodings), `reference_strength_multiple`,
  `normalize_reference_strength_multiple`.
- Inset + vibe (V4.5 inpaint) works. Character reference and vibe cannot be combined (NovelAI docs).

## Results

- **Model:** the project picks character references or vibes and combines them with either mode (inpaint or
  txt2img), instead of the planned four "methods" inside inpaint. Inpaint + character reference was blocked at
  first, then opened after the web was found to allow it on V4.5 (stage 8).
- **Library sections** (user request): 캐릭터 레퍼런스 (key 6) and 바이브 (key 7), each item a picture plus values
  (fidelity, target, strength; strength, information extracted). The 참고 chip's mode button sets
  `Project.aidMode`; lists are `characterReferenceIds` and `vibeIds` (any number, picked order). Projects without
  a mode use character reference if one is picked, else vibe.
- **Target** (user request): Character & Style / Character / Style (`CharacterReference.target`, the
  `base_caption` value). The old `styleAware` reads as on → character&style, off → character. Style is unmeasured.
- **Many vibes** (user request): no limit (was 4; the user used double digits on the web; >4 not measured here).
  NovelAI docs: up to 16, and each vibe beyond 4 costs 2 Anlas per image; this is in the estimate and warnings.
  The old single `vibeId` reads as a one-item list.
- **Normalize Reference Strengths** (user request): toggle under the vibe list (`Project.normalizeVibes`, missing
  = on). Like the web, only with 2+ vibes and Σ|strength| > 1 are strengths divided by that sum before sending
  (`vibeStrengths`), and the flag is sent too. Off sends the typed values.
- **From images** (user request): drop or paste (Ctrl+V) an image; both the plain image dialog and the NovelAI
  image dialog (⑤) can make a new character reference or vibe (`addAidFromImage`), linked to the open project.
- **Pictures:** `pictures/<24-char content hash>.png`, shared by duplicates. Full backups embed them as data URLs
  and restore the same names. No per-item JSON export (pictures are not in JSON); vibes export as NovelAI vibe
  files (stage 8).
- **Missing items:** the warning band names 「캐릭터 레퍼런스」/「바이브」 (or 「… 그림」). Deleting an item without
  a replacement unlinks it from projects.
- **V4.5 only:** `supportsReferenceAid` (V4.5 Full/Curated). Other models turn the chip orange, show 「V4.5 모델」
  in the band and block job creation.
- **Character reference prep:** fitted onto 1024×1536, 1536×1024 or 1472×1472 (closest ratio) with black padding
  into `inputs/` (`fitCharacterReference`). +5 Anlas per reference per image.
- **Vibe encoding:** the queue encodes right before generating, using the txt2img model ID (inpaint requests reuse
  it, as in stage 0). Cache outside the project folder: `vibes/<picture hash>-<model>-ie<value>.bin`, so each
  encode is paid once. Enqueue adds 2 Anlas per not-yet-encoded vibe to the estimate.
- **Records:** `aid` (mode, item names, values), shown as 「참고 방식」 in record info.

## User checks (paid, one image each; V4.5 Full, one scene, count 1)

1. txt2img + character reference (5 Anlas): is the character carried over? If possible also target 「캐릭터」/
   「그림체」 and lower fidelity.
2. txt2img + vibe: 2 Anlas encode asked the first time, not the second (file appears in `vibes/`).
3. Inpaint + vibe: works with the inset.
4. txt2img + two vibes: both apply; encoding asked twice (4 Anlas).
