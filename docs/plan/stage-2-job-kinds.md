# Stage 2: Job kinds (done)

Internal change only; behavior stayed as after stage 1.

- **Types:** `GenerationJobSnapshot` is a union by `kind`: `InpaintJobSnapshot`, `Txt2ImgJobSnapshot`,
  `Img2ImgJobSnapshot`, `AugmentJobSnapshot`. Queue items are `QueuedGenerationJob`. All kinds use
  `canvasWidth`/`canvasHeight` for the request size (kept so old queue files and costs still match). Input image
  (`imagePath`, `imageSha256`) for inpaint/i2i/augment; mask, `outputRect` and diagnostic canvas for inpaint only;
  augment has `tool`, `mood`, `toolPrompt`, `defry`.
- **Requests:** `buildNovelAIDiffusionRequest` builds txt2img/i2i/inpaint bodies (only image fields differ),
  `buildNovelAIAugmentRequest` builds director tools, `buildNovelAIJobRequest` picks URL and body by kind. Inpaint
  bodies are byte-identical to before for every model; txt2img/i2i bodies match the stage 0 successes.
- **Models:** the stored `id` is the inpaint model ID; each model has `requestIds` (inpaint, generate).
- **Saving:** only inpaint is cropped to `outputRect`; other kinds save the received image plus metadata.
- **Cost:** i2i multiplies by strength above the free range; bg removal is estimated (see stage 5).
- **Compatibility:** records without `kind` read as inpaint (zod default); queued jobs via `restoreQueuedJob`, which
  requires only `imagePath` like the old loader (requiring the mask would drop old queued jobs).
