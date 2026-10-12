# Stage 5: Director tools (done 2026-10-12; user tried it in the app and it worked)

Request format: [stage 0](stage-0-api-cost.md#bc-director-tools-references-vibes-stage0-b-stage0-c). Only
background removal costs Anlas, even on Opus.

## Results

- **Jobs:** `buildResultAugmentJobs` makes a director tool job from one result. The source's prompt, settings and
  seed are not sent but are copied into the record. With `targets`, one job per scene (scene set).
- **Multi-image responses:** the provider returns every PNG in the ZIP in name order; the queue saves one record
  per image (file suffix `__2`, `__3`) and puts the Anlas on the first. Records keep `augment` (tool, mood, defry,
  tool prompt, `part`/`parts`).
- **Values:** 24 moods and 6 strengths (defry 0–5) match the list ComfyUI_NAIDGenerator copied from the web. Like
  that code, only inputs above 1024×1024 area are shrunk to multiples of 64; others go at their original size
  (`freeAugmentSize`); the dialog shrinks oversized inputs by default.
- **Director tool window** (`DirectorToolDialog`): from the result bar, image context menu, scene card menu and
  picked-cards bar. One tool list (a button row overflowed narrow panels). Shows the estimate; bg removal shows a
  warning box; the main-process cost confirm still applies. Count 1–4 (results differ each run); not for bg
  removal.
- **Scene set from one image** (`SceneSetDialog`, menu 「이 이미지로 씬 표정 만들기」): runs Emotion per scene with
  per-scene check, mood, strength and count; results stack on each scene. Scenes store optional `augmentMood` and
  `augmentDefry`, edited only in this window (user decision); empty means suggested from the scene name
  (`suggestMood`). Scenes without a mood and the image's own scene start unchecked.
- **Free generation [디렉터 툴] mode** (user request): uses the same image as i2i (`FreeGeneration.image`), settings
  in `FreeGeneration.augment`; sends only the original area of the padded source (`SourceInputRequest.crop`). Same
  fields as the window (`DirectorToolFields`); Emotion/Colorize prompts have tag autocomplete.
- **Bg removal:** all three images are saved to the same scene; transparent results show on a checkerboard.

## Measurements (user-run, 2026-10-12, Opus)

| Request                      | Anlas  | Result                                           |
| ---------------------------- | ------ | ------------------------------------------------ |
| Emotion happy 832×1216 twice | 0      | different each time (89% of pixels differ)       |
| Emotion 600×900, 517×771     | 0      | returned at the same size; non-64 sizes are fine |
| Declutter 517×771            | 0      | same size                                        |
| Emotion 1024×1024            | 0      | free up to 1024² area                            |
| Bg removal 608×832           | **35** | 3 RGBA images, identical transparent masks       |

- **Bg removal cost:** 65 at 832×1216 and 35 at 608×832 fit `5 + 60 × (area / (832×1216))` (not plain area
  ratio). `NaiCost.ts` uses this; only two points, so other sizes may differ.
- **The three images:** `image_0` = input pixels cut out (100% equal where opaque); `image_1` = redrawn (27%
  differ, slightly darker); `image_2` = nearly the input (0.5% differ, edge colors cleaned).
