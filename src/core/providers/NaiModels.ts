import type {
  Effort,
  GenerationSettings,
  NaiTagFamily,
  NaiTagTable,
  QualityLevel,
  ReferenceTarget,
  SmeaMode,
  UcPresetId,
} from '../domain/types';

export type NaiModelInfo = {
  /** 저장 값. 예전부터 인페인트 모델 ID를 저장해 왔다. */
  id: string;
  /** 인페인트가 없는 모델은 `inpaint`가 없다. */
  requestIds: { inpaint?: string; generate: string };
  /** 없으면 Effort를 고를 수 없다. */
  mediumRequestIds?: { inpaint: string; generate: string };
  label: string;
  family: NaiTagFamily;
  /** V3는 v4_prompt·캐릭터 프롬프트가 없어 하나로 합쳐 보낸다. */
  generation: 'v5' | 'v4' | 'v3';
  /** NovelAI 웹 `maxCharacters`. V3는 공통 프롬프트에 합친다. */
  maxCharacters: number;
  maxSteps: number;
  maxScale: number;
  /** NovelAI 웹 `cfgDelaySigma`(2026-10). 없으면 Variety+ 미지원(V5). */
  varietySigma?: number;
  /** 인페인트 경고에 덧붙인다. */
  noInpaintReason?: string;
};

export const NAI_MODELS: NaiModelInfo[] = [
  {
    id: 'nai-diffusion-5-full-inpainting',
    requestIds: { inpaint: 'nai-diffusion-5-full-inpainting', generate: 'nai-diffusion-5-full' },
    mediumRequestIds: {
      inpaint: 'nai-diffusion-5-full-medium-inpainting',
      generate: 'nai-diffusion-5-full-medium',
    },
    label: 'NAI Diffusion V5 Full',
    family: 'v5',
    generation: 'v5',
    maxCharacters: 32,
    maxSteps: 50,
    maxScale: 10,
  },
  {
    // V5 출시 공지(2026-08-21)·웹 코드(2026-10): Curated 인페인트는 V4.5 Curated 모델로 보낸다.
    id: 'nai-diffusion-5-curated',
    requestIds: { generate: 'nai-diffusion-5-curated' },
    label: 'NAI Diffusion V5 Curated',
    noInpaintReason: 'V5 Curated 전용 인페인트 모델이 아직 나오지 않았습니다.',
    family: 'v5-curated',
    generation: 'v5',
    maxCharacters: 32,
    maxSteps: 50,
    maxScale: 10,
  },
  {
    id: 'nai-diffusion-4-5-full-inpainting',
    requestIds: {
      inpaint: 'nai-diffusion-4-5-full-inpainting',
      generate: 'nai-diffusion-4-5-full',
    },
    label: 'NAI Diffusion V4.5 Full',
    family: 'v4-5-full',
    varietySigma: 58,
    generation: 'v4',
    maxCharacters: 6,
    maxSteps: 50,
    maxScale: 10,
  },
  {
    id: 'nai-diffusion-4-5-curated-inpainting',
    requestIds: {
      inpaint: 'nai-diffusion-4-5-curated-inpainting',
      generate: 'nai-diffusion-4-5-curated',
    },
    label: 'NAI Diffusion V4.5 Curated',
    family: 'v4-5-curated',
    varietySigma: 58,
    generation: 'v4',
    maxCharacters: 6,
    maxSteps: 50,
    maxScale: 10,
  },
  {
    id: 'nai-diffusion-4-full-inpainting',
    requestIds: { inpaint: 'nai-diffusion-4-full-inpainting', generate: 'nai-diffusion-4-full' },
    label: 'NAI Diffusion V4 Full',
    family: 'v4-full',
    varietySigma: 19,
    generation: 'v4',
    maxCharacters: 6,
    maxSteps: 50,
    maxScale: 10,
  },
  {
    id: 'nai-diffusion-4-curated-inpainting',
    requestIds: {
      inpaint: 'nai-diffusion-4-curated-inpainting',
      generate: 'nai-diffusion-4-curated-preview',
    },
    label: 'NAI Diffusion V4 Curated',
    family: 'v4-curated',
    varietySigma: 19,
    generation: 'v4',
    maxCharacters: 6,
    maxSteps: 50,
    maxScale: 10,
  },
  {
    id: 'nai-diffusion-3-inpainting',
    requestIds: { inpaint: 'nai-diffusion-3-inpainting', generate: 'nai-diffusion-3' },
    label: 'NAI Diffusion Anime V3',
    family: 'v3',
    varietySigma: 19,
    generation: 'v3',
    maxCharacters: 6,
    maxSteps: 50,
    maxScale: 10,
  },
  {
    id: 'nai-diffusion-furry-3-inpainting',
    requestIds: { inpaint: 'nai-diffusion-furry-3-inpainting', generate: 'nai-diffusion-furry-3' },
    label: 'NAI Diffusion Furry V3',
    family: 'v3-furry',
    varietySigma: 19,
    generation: 'v3',
    maxCharacters: 6,
    maxSteps: 50,
    maxScale: 10,
  },
];

export function modelInfo(id: string): NaiModelInfo | undefined {
  return NAI_MODELS.find((model) => model.id === id);
}

export const INPAINT_MODELS = NAI_MODELS.filter((model) => model.requestIds.inpaint);

export function supportsInpaint(id: string): boolean {
  return Boolean(modelInfo(id)?.requestIds.inpaint);
}

export function noInpaintReason(id: string): string | undefined {
  return modelInfo(id)?.noInpaintReason;
}

export function maxCharactersFor(id: string | undefined): number {
  return modelInfo(id ?? '')?.maxCharacters ?? 6;
}

/** V5는 500 오류(0단계 실측). */
export function supportsReferenceAid(id: string): boolean {
  return modelInfo(id)?.family.startsWith('v4-5') ?? false;
}

export const REFERENCE_TARGETS: Array<{ value: ReferenceTarget; label: string; hint: string }> = [
  { value: 'character&style', label: '캐릭터와 그림체', hint: 'Character & Style' },
  { value: 'character', label: '캐릭터', hint: 'Character' },
  { value: 'style', label: '그림체', hint: 'Style' },
];

export function referenceTargetLabel(target: ReferenceTarget): string {
  return REFERENCE_TARGETS.find((item) => item.value === target)?.label ?? target;
}

/** NovelAI 웹 `streamedResponses`(2026-10). V3는 웹도 스트리밍하지 않는다. */
export function supportsStreaming(id: string): boolean {
  const generation = modelInfo(id)?.generation;
  return generation === 'v4' || generation === 'v5';
}

/** NovelAI 웹 `smea`·`smeaDyn`·`dynamicThresholding`. */
export function supportsV3Sampling(id: string): boolean {
  return modelInfo(id)?.generation === 'v3';
}

/** 기준 값은 832×1216 기준이라 면적의 제곱근 비율로 늘린다(커뮤니티 실측: V4.5 1280×1856 → 88.877…, V4 1024×1024 → 19.343…). */
export function varietySigma(
  settings: Pick<GenerationSettings, 'model' | 'variety'>,
  width: number,
  height: number,
): number | null {
  const base = modelInfo(settings.model)?.varietySigma;
  if (!settings.variety || !base) return null;
  return base * Math.sqrt((width * height) / (832 * 1216));
}

export const SMEA_LABELS: Record<SmeaMode, string> = {
  off: '끄기',
  smea: 'SMEA',
  dyn: 'SMEA DYN',
};

export function samplingExtras(settings: GenerationSettings): string[] {
  const v3 = supportsV3Sampling(settings.model);
  return [
    settings.variety && modelInfo(settings.model)?.varietySigma && 'Variety+',
    v3 && settings.smea && settings.smea !== 'off' && SMEA_LABELS[settings.smea],
    v3 && settings.decrisp && 'Decrisp',
  ].filter(Boolean) as string[];
}

export function supportsEffort(id: string): boolean {
  return Boolean(modelInfo(id)?.mediumRequestIds);
}

/** 모델을 바꿔도 `effort`는 남아 있어 모델까지 본다. */
export function usesMedium(settings: Pick<GenerationSettings, 'model' | 'effort'>): boolean {
  return settings.effort === 'medium' && supportsEffort(settings.model);
}

export const EFFORT_LABELS: Record<Effort, string> = { high: 'High', medium: 'Medium' };

/** NovelAI 웹 `fixedSettings`와, medium 모델에서 웹이 감추는 CFG Rescale(2026-10). */
export const MEDIUM_FIXED = {
  steps: 14,
  sampler: 'k_euler_ancestral',
  ucPreset: 'heavy',
  cfgRescale: 0,
} as const satisfies Partial<GenerationSettings>;

export function requestModelId(
  id: string,
  use: 'inpaint' | 'generate',
  effort: Effort = 'high',
): string {
  const model = modelInfo(id);
  const requestId =
    effort === 'medium' && model?.mediumRequestIds
      ? model.mediumRequestIds[use]
      : model?.requestIds[use];
  if (!model) throw new Error(`지원되지 않는 NovelAI 모델입니다: ${id}`);
  if (!requestId) throw new Error(`${model.label}은(는) 인페인트를 지원하지 않습니다.`);
  return requestId;
}

export function modelLabel(id: string): string {
  return modelInfo(id)?.label ?? id;
}

const V5_HEAVY =
  'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page';
const V5_FURRY =
  '{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic';
const V4_HEAVY =
  'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks';
const V4_LIGHT =
  'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing';
const V4_CURATED_HEAVY =
  'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts';
const V4_CURATED_LIGHT =
  'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature';
const V3_HEAVY =
  'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]';

/** novelai.net 웹 문구(2026-10). docs.novelai.net과 다르면 웹을 따른다. legacy는 옛 이미지를 불러올 때만 쓴다. */
const V5_TAGS: NaiTagTable = {
  quality: {
    standard: 'very aesthetic, masterpiece, no text',
    light: 'very aesthetic, amazing quality, no text',
  },
  uc: {
    heavy: V5_HEAVY,
    light:
      'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::',
    human: `${V5_HEAVY}, @_@, mismatched pupils, glowing eyes, bad anatomy`,
    furry: V5_FURRY,
  },
};

export const NAI_TAGS: Record<NaiTagFamily, NaiTagTable> = {
  v5: V5_TAGS,
  // 웹에서 V5 Full과 같은 목록을 쓴다. 차이는 nsfw 자동 추가뿐이다.
  'v5-curated': V5_TAGS,
  'v4-5-full': {
    quality: { standard: 'very aesthetic, masterpiece, no text' },
    legacyQuality: { standard: 'location, very aesthetic, masterpiece, no text' },
    uc: {
      heavy: V5_HEAVY,
      light:
        'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page',
      human: `${V5_HEAVY}, @_@, mismatched pupils, glowing eyes, bad anatomy`,
      furry: V5_FURRY,
    },
  },
  'v4-5-curated': {
    quality: { standard: 'very aesthetic, masterpiece, no text, -0.8::feet::, rating:general' },
    legacyQuality: { standard: 'location, masterpiece, no text, -0.8::feet::, rating:general' },
    uc: {
      heavy:
        'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page',
      light:
        'blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page',
      human:
        'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page',
    },
  },
  'v4-full': {
    quality: { standard: 'no text, best quality, very aesthetic, absurdres' },
    uc: {
      heavy: `${V4_HEAVY}, white blank page, blank page`,
      light: `${V4_LIGHT}, white blank page, blank page`,
    },
    legacyUc: { heavy: V4_HEAVY, light: V4_LIGHT },
  },
  'v4-curated': {
    quality: { standard: 'rating:general, best quality, very aesthetic, absurdres' },
    legacyQuality: { standard: 'rating:general, amazing quality, very aesthetic, absurdres' },
    uc: {
      heavy: `${V4_CURATED_HEAVY}, white blank page, blank page`,
      light: `${V4_CURATED_LIGHT}, white blank page, blank page`,
    },
    legacyUc: { heavy: V4_CURATED_HEAVY, light: V4_CURATED_LIGHT },
  },
  v3: {
    quality: { standard: 'best quality, amazing quality, very aesthetic, absurdres' },
    uc: {
      heavy: V3_HEAVY,
      light: 'lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing',
      human: `${V3_HEAVY}, bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes`,
    },
    emptyUc: 'lowres',
  },
  'v3-furry': {
    quality: { standard: '{best quality}, {amazing quality}' },
    uc: {
      heavy:
        '{{worst quality}}, [displeasing], {unusual pupils}, guide lines, {{unfinished}}, {bad}, url, artist name, {{tall image}}, mosaic, {sketch page}, comic panel, impact (font), [dated], {logo}, ych, {what}, {where is your god now}, {distorted text}, repeated text, {floating head}, {1994}, {widescreen}, absolutely everyone, sequence, {compression artifacts}, hard translated, {cropped}, {commissioner name}, unknown text, high contrast',
      light:
        '{worst quality}, guide lines, unfinished, bad, url, tall image, widescreen, compression artifacts, unknown text',
    },
    emptyUc: 'lowres',
  },
};

/** V3는 캐릭터 네거티브까지 합쳐 비었을 때. */
export function emptyNegativeFor(model: string): string {
  return tagsFor(model).emptyUc ?? '';
}

export const UC_PRESET_LABELS: Record<UcPresetId, string> = {
  none: '없음',
  heavy: 'Heavy',
  light: 'Light',
  human: 'Human Focus',
  furry: 'Furry Focus',
};

export const QUALITY_LEVEL_LABELS: Record<QualityLevel, string> = {
  standard: 'Standard',
  light: 'Light',
};

function tagsFor(model: string | undefined): NaiTagTable {
  return NAI_TAGS[modelInfo(model ?? '')?.family ?? 'v4-5-full'];
}

export function qualityLevelsFor(model: string): QualityLevel[] {
  return (Object.keys(QUALITY_LEVEL_LABELS) as QualityLevel[]).filter(
    (level) => tagsFor(model).quality[level],
  );
}

/** 'none' 포함 */
export function ucPresetsFor(model: string): UcPresetId[] {
  return (Object.keys(UC_PRESET_LABELS) as UcPresetId[]).filter(
    (id) => id === 'none' || tagsFor(model).uc[id],
  );
}

export function naiTagText(
  model: string,
  options: { qualityTags: boolean; qualityLevel?: QualityLevel; ucPreset: UcPresetId },
) {
  const tags = tagsFor(model);
  return {
    quality: options.qualityTags
      ? (tags.quality[options.qualityLevel ?? 'standard'] ?? tags.quality.standard ?? '')
      : '',
    uc: options.ucPreset === 'none' ? '' : (tags.uc[options.ucPreset] ?? ''),
  };
}

/** NovelAI 요청의 `tag_hint_qt`·`tag_hint_uc_preset` 번호. 메타데이터에 남아 불러올 때 쓴다. */
export const NAI_TAG_HINT = {
  none: 0,
  standard: 1,
  heavy: 2,
  light: 3,
  human: 4,
  furry: 5,
} as const;

/** 모델에 없어 붙지 않은 것은 0. */
export function naiTagHints(
  model: string,
  options: { qualityTags: boolean; qualityLevel?: QualityLevel; ucPreset: UcPresetId },
): { tag_hint_qt: number; tag_hint_uc_preset: number } {
  const text = naiTagText(model, options);
  const level =
    options.qualityLevel && tagsFor(model).quality[options.qualityLevel]
      ? options.qualityLevel
      : 'standard';
  return {
    tag_hint_qt: text.quality ? NAI_TAG_HINT[level] : NAI_TAG_HINT.none,
    tag_hint_uc_preset: text.uc ? NAI_TAG_HINT[options.ucPreset] : NAI_TAG_HINT.none,
  };
}

function clean(value: string): string {
  return value.trim().replace(/^[,\s]+|[,\s]+$/g, '');
}

const NO_AUTO_NSFW = new Set<NaiTagFamily>(['v5-curated', 'v4-5-curated', 'v4-curated']);

/** NovelAI 웹은 UC 프리셋을 쓰면 네거티브 앞에 `nsfw`를 붙인다(Curated와 포지티브에 nsfw가 있으면 제외). 여기서는 모델·프리셋 조건만 본다. */
export function addsAutoNsfw(model: string, ucPreset: UcPresetId): boolean {
  const family = modelInfo(model)?.family ?? 'v4-5-full';
  return !NO_AUTO_NSFW.has(family) && naiTagText(model, { qualityTags: false, ucPreset }).uc !== '';
}

function mentionsNsfw(...prompts: string[]): boolean {
  return prompts.some((prompt) => prompt.toLowerCase().includes('nsfw'));
}

/** 모델에 없는 단계·프리셋은 무시한다. 자동 nsfw는 캐릭터 프롬프트까지 보고 정한다. */
export function applyNaiTags(
  model: string,
  options: { qualityTags: boolean; qualityLevel?: QualityLevel; ucPreset: UcPresetId },
  positive: string,
  negative: string,
  characterPositive = '',
): { positive: string; negative: string } {
  const text = naiTagText(model, options);
  const finalPositive = [clean(positive), clean(text.quality)].filter(Boolean).join(', ');
  const nsfw =
    addsAutoNsfw(model, options.ucPreset) && !mentionsNsfw(finalPositive, characterPositive);
  return {
    positive: finalPositive,
    negative: [nsfw ? 'nsfw' : '', clean(text.uc), clean(negative)].filter(Boolean).join(', '),
  };
}

/** 긴 문구부터 비교해야 Human Focus가 Heavy로, 긴 예전 문구가 짧은 문구로 잘못 잡히지 않는다. */
function tagCandidates<K extends string>(
  current: Partial<Record<K, string>>,
  legacy: Partial<Record<K, string>> | undefined,
  preferred?: string,
): Array<[K, string]> {
  // NovelAI 웹과 같은 순서
  const rank = ([key]: [K, string]) => (key === preferred ? 0 : 1);
  return [current, legacy ?? {}]
    .flatMap((table) => Object.entries(table) as Array<[K, string]>)
    .map(([key, text]): [K, string] => [key, clean(text)])
    .filter(([, text]) => text)
    .sort((a, b) => rank(a) - rank(b) || b[1].length - a[1].length);
}

function hintName(hint: number | undefined): string | undefined {
  return (Object.keys(NAI_TAG_HINT) as Array<keyof typeof NAI_TAG_HINT>).find(
    (key) => NAI_TAG_HINT[key] === hint,
  );
}

function stripTagSuffix(prompt: string, suffix: string): string | undefined {
  if (!suffix || !prompt.endsWith(suffix)) return undefined;
  const rest = prompt.slice(0, -suffix.length);
  return rest === '' || /,\s*$/.test(rest) ? clean(rest) : undefined;
}

function stripTagPrefix(prompt: string, prefix: string): string | undefined {
  if (!prefix || !prompt.startsWith(prefix)) return undefined;
  const rest = prompt.slice(prefix.length);
  return rest === '' || /^\s*,/.test(rest) ? clean(rest) : undefined;
}

/** 웹이 붙인 `nsfw` 뒤에서도 프리셋을 찾는다. 힌트(`tag_hint_*`)가 있으면 그것부터 보고, 힌트가 '없음'이면 같은 문구도 사용자가 쓴 것으로 보고 떼지 않는다. */
export function detectNaiTags(
  model: string | undefined,
  positive: string,
  negative: string,
  hints?: { quality?: number; uc?: number },
): {
  positive: string;
  negative: string;
  qualityTags: boolean;
  qualityLevel: QualityLevel;
  ucPreset: UcPresetId;
} {
  const families =
    model && modelInfo(model)
      ? [modelInfo(model)!.family]
      : (Object.keys(NAI_TAGS) as NaiTagFamily[]);
  let resultPositive = clean(positive);
  let resultNegative = clean(negative);
  const autoNsfw = stripTagPrefix(resultNegative, 'nsfw');
  const qualityHint = hintName(hints?.quality);
  const ucHint = hintName(hints?.uc);
  let qualityTags = false;
  let qualityLevel: QualityLevel = 'standard';
  let ucPreset: UcPresetId = 'none';
  for (const family of families) {
    const tags = NAI_TAGS[family];
    if (!qualityTags && qualityHint !== 'none') {
      for (const [level, quality] of tagCandidates(tags.quality, tags.legacyQuality, qualityHint)) {
        const rest = stripTagSuffix(resultPositive, quality);
        if (rest !== undefined) {
          resultPositive = rest;
          qualityTags = true;
          qualityLevel = level;
          break;
        }
      }
    }
    if (ucPreset === 'none' && ucHint !== 'none') {
      for (const [id, value] of tagCandidates(tags.uc, tags.legacyUc, ucHint)) {
        const rest = stripTagPrefix(resultNegative, value);
        const afterNsfw = autoNsfw !== undefined ? stripTagPrefix(autoNsfw, value) : undefined;
        if (rest !== undefined) {
          resultNegative = rest;
        } else if (afterNsfw !== undefined) {
          // 생성할 때 다시 붙을 nsfw만 뗀다.
          const readded = !NO_AUTO_NSFW.has(family) && !mentionsNsfw(positive);
          resultNegative = [readded ? '' : 'nsfw', afterNsfw].filter(Boolean).join(', ');
        } else {
          continue;
        }
        ucPreset = id;
        break;
      }
    }
  }
  // 웹이 대신 보낸 기본값(V3의 lowres)은 생성할 때 다시 붙는다.
  if (ucPreset === 'none' && families.some((family) => NAI_TAGS[family].emptyUc === resultNegative))
    resultNegative = '';
  return {
    positive: resultPositive,
    negative: resultNegative,
    qualityTags,
    qualityLevel,
    ucPreset,
  };
}
