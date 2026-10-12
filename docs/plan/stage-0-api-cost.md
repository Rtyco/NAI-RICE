# Stage 0: NovelAI API and cost probes (done, 2026-10-09)

Reference only. Later stage files carry the results they need. The image API has no official docs; formats follow
the NovelAI web and community code (ComfyUI_NAIDGenerator, NekoAI-JS). Probe script: `legacy/tools/nai-exp/probe.ts`
(plans `planS0a~d.json`); per-request logs in `ForTest/stage0-*/`.

## A. Free range (`stage0-a`)

Opus, 832×1216 (one i2i at 1024²), 28 steps, 1 image. 14 requests, all 200, **0 Anlas**. V5 quota stayed at 10%.

- **Response:** every kind returns a `binary/octet-stream` ZIP with `image_0.png` (RGBA). Normal results have
  alpha min 243–254 (NovelAI hides data in alpha), so "transparent" means alpha min = 0.
- **txt2img model IDs:** `nai-diffusion-5-full`, `-5-curated`, `-4-5-full`, `-4-5-curated`, `-4-full`,
  `-4-curated-preview`, `nai-diffusion-3`.
- **txt2img body:** the inpaint body with `action: 'generate'`, a non-inpaint model, and without `image`, `mask`,
  `strength`, `noise`, `img2img`, `inpaintImg2ImgStrength`, `add_original_image`, `extra_noise_seed`. V5 keeps
  top-level `use_new_shared_trial: true`.
- **i2i body:** `action: 'img2img'`, `image`, `strength`, `noise`, `extra_noise_seed` (= seed); V4+ also
  `img2img: { strength, noise, begin_from_sigma: null, extra_noise_seed, color_correct: true }`. No mask fields.
- **i2i size:** the server stretches the input to the requested size **ignoring aspect ratio**. Upscaling a small
  input (416×608 → 832×1216) is fine and free; at strength 0.4 face and layout hold and lines get sharper.
- **V5 transparency:** `transparent background` gives real alpha 0 for txt2img and full-mask inpaint (survives the
  app's crop); not for i2i of an opaque input.

## B/C. Director tools, references, vibes (`stage0-b`, `stage0-c`)

Director tools: `POST https://image.novelai.net/ai/augment-image`, body `{ req_type, width, height, image,
prompt?, defry? }`, ZIP response; result `Comment` holds only `req_type` (+ `prompt`, `defry` for Emotion).

| Test                            | Anlas  | Result                                               |
| ------------------------------- | ------ | ---------------------------------------------------- |
| `emotion` (`prompt: "happy;;"`) | 0      | 1 RGB, same size                                     |
| `bg-removal` 832×1216           | **65** | **3** RGBA, transparent background                   |
| `declutter`/`lineart`/`sketch`  | 0      | 1 RGB each                                           |
| `colorize` (empty prompt)       | 0      | 1 RGB; hair/eye colors change without a prompt       |
| Character reference, V4.5       | **5**  | hair and outfit carried over                         |
| Character reference, V5         | 0      | **500** (5 tries)                                    |
| Vibe encode, V4.5               | **2**  | `application/binary`, 49,024 bytes (not ZIP)         |
| Vibe in V4.5 txt2img / inpaint  | 0      | works; base64 encoding in `reference_image_multiple` |
| Vibe on V5 (V4.5 encoding)      | 0      | **500** (5 tries)                                    |
| `api.novelai.net/ai/upscale`    | 0      | 404                                                  |
| txt2img 512×512, 29 steps       | **6**  | matches the community formula                        |

Retried 500s were not charged. Cost formula: NekoAI-JS `calculateCost`, in `NaiCost.ts`.

## D. (`stage0-d`)

- `image.novelai.net/ai/upscale` exists but needs a `model` value (400 `model doesn't exist`); value unknown.
- Emotion: `angry`/`sad` change only the face; `defry: 3` softens only slightly.
- V5 quota raw value: `{"percent":10,"isNegative":false,"timeUntilNextPercent":6048}`; the app shows `percent`.
  It did not move over 9 V5 requests.

Total spent: 78 Anlas. Open: upscale `model`, V5 quota consumption.
