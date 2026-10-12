# Stage 7: V5 Effort, multiple characters and positions (implemented 2026-10-12, awaiting user check)

## 7-1. V5 Full Effort

Sources: [NovelAI announcement](https://journal.novelai.net/novelai-diffusion-v5-full-effort-toggle/) (2026-10-08)
and the web code. V5 Full and its inpaint model have **High** (old) and **Medium** (~42% less usage, Anlas and Opus
quota). The web switches model IDs: `nai-diffusion-5-full` ↔ `-5-full-medium`, `-5-full-inpainting` ↔
`-5-full-medium-inpainting`. Medium fixes Steps 14, `k_euler_ancestral`, UC preset Heavy, no CFG Rescale; custom
negatives are not used (use negative weights like `-3::hat::` in the positive).

- `GenerationSettings.effort` (default `high`), V5 Full only; Medium changes the model ID only at request time
  (`requestModelId`). Stored values stay; `effectiveGenerationSettings` overrides the fixed values when building
  jobs, and cost/preview use it too. High restores the user's values (the app locks, not overwrites).
- Negatives: like the web, Medium rebuilds `uc` from the UC preset only (with `nsfw, ` when the positive lacks it)
  and clears character negatives. Editors show "Medium에서는 쓰이지 않음".
- Measured (free, 3 images, `ForTest/stage7-effort/`): Medium txt2img and inpaint work with the current format;
  Steps 28 is accepted and run as 14. Source labels are all `NovelAI Diffusion V5 <hash>`: Full `0ADF9AB7`, Full
  inpaint `657484A5`, Medium `70AB5786`, Medium inpaint `93F4BD30`, Curated `DB276663`. Import uses these hashes.
- `nai-diffusion-5-curated-inpainting` is in the web code but the server returns 400 "model doesn't exist"
  (2026-10-12). When it opens, add it to `requestIds.inpaint` in `NaiModels`.
- Unverified: whether paid sizes cost as Steps 14.

## 7-2. Multiple characters and positions

| Model           | Max characters | Positions                                           |
| --------------- | -------------- | --------------------------------------------------- |
| V5 Full/Curated | 32             | from one character, free (0.001 steps)              |
| V4/V4.5         | 6              | from two characters, 5×5 grid (0.1/0.3/0.5/0.7/0.9) |
| V3              | (6 in the app) | none; character prompts appended to common          |

- **Data:** `Project`/`FreeGeneration` have `characters: CharacterSlot[]` (`characterId`, `promptSetId`,
  `center?`) and `positionMode: 'ai' | 'manual'`. Old single fields read as a one-item list
  (`readSingleCharacter`). Backup remap, delete/replace, prompt set edits and image import handle lists.
- **Scenes (user decision, order-based):** `Emotion.prompt` goes to the first character slot (following the
  preset's insert position), `extraPrompts[i]` to character i+2 (end of its prompt). Empty slots add nothing; any
  filled slot makes the scene generatable (`hasScenePrompt`).
- **Jobs:** first character in `characterPrompt`, the rest in `extraCharacters` (name, final prompt, negative),
  manual positions in `characterCenters`. Reference inset only on the first character. `{character}` and
  `promptSetName` join with `+`. Over the model limit (web `maxCharacters`) no jobs are made.
- **Positions:** new characters fill the middle row first like the web (0.5 → 0.3 → 0.7 → 0.1 → 0.9). AI mode
  sends `use_coords: false` with center values. V5 free positions snap to the grid for V4 when shown and sent
  (stored values unchanged).
- **Screens:** character chip (order numbers, prompt set per row, move earlier), position chip and
  `CharacterPositionDialog`, per-character cards in the prompt panel (inpaint notes that only the first character
  is referenced), per-character scene prompt fields, ＋ in the scene set editor; preview and record info list all
  characters.
- **Import:** 「모든 캐릭터」 creates every character and adds them in order; `use_coords` positions are copied. The
  app's own extra metadata stores characters from the second on.
- Measured (free, 2 images, 1216×832, left/right): V5 placed both correctly with separate outfits/expressions;
  V4.5 (A3/E3) got the right one, the left one came out large in the middle. Requests were accepted.

## User checks

Two-character inpaint and txt2img in a real project, the second scene slot, the position window, Effort Medium.
