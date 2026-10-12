# Stage 1: Conveniences (done)

- **Sidebar section folding:** clicking a 「작업」/「라이브러리」 header folds that card vertically; the open card takes
  the remaining height. Stored in `localStorage` (`sidebar-sections-collapsed`); ignored in the narrow bar
  (Ctrl+B). The whole header row is clickable. Animation matches the app (240 ms,
  `cubic-bezier(0.2, 0.8, 0.2, 1)`) using `interpolate-size: allow-keywords`.
- **Clear mask:** 「마스크 비우기」 protects every pixel (undoable). An empty mask did not actually block
  generation before, so the main process `prepareInputs` (`electron/services/Library.ts`) now errors when the mask
  has no generate pixels.
- **Anlas estimate:** `imageAnlasCost` (formula) and `estimateJobAnlas` (free check) in `NaiCost.ts`. Shown as
  "예상 0 Anlas (무료)" / "예상 약 N Anlas" next to generate, in the confirm window and per queue item
  (`anlasEstimate`, computed by the main process at enqueue). Account status has the subscription `tier`; unknown
  tier is treated as Opus. No V5 quota estimate (consumption unknown).
