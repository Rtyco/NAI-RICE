import type { NaiTagFamily, NaiTagTable, QualityLevel, UcPresetId } from '../domain/types';

export type NaiModelInfo = {
  id: string;
  label: string;
  family: NaiTagFamily;
  /** V4 이상은 v4_prompt와 캐릭터 프롬프트를 지원한다. V3는 하나의 프롬프트로 합쳐 보낸다. */
  generation: 'v5' | 'v4' | 'v3';
  maxSteps: number;
  maxScale: number;
};

export const NAI_MODELS: NaiModelInfo[] = [
  {
    id: 'nai-diffusion-5-full-inpainting',
    label: 'NAI Diffusion V5 Full',
    family: 'v5',
    generation: 'v5',
    maxSteps: 50,
    maxScale: 10,
  },
  {
    id: 'nai-diffusion-4-5-full-inpainting',
    label: 'NAI Diffusion V4.5 Full',
    family: 'v4-5-full',
    generation: 'v4',
    maxSteps: 50,
    maxScale: 10,
  },
  {
    id: 'nai-diffusion-4-5-curated-inpainting',
    label: 'NAI Diffusion V4.5 Curated',
    family: 'v4-5-curated',
    generation: 'v4',
    maxSteps: 50,
    maxScale: 10,
  },
  {
    id: 'nai-diffusion-4-full-inpainting',
    label: 'NAI Diffusion V4 Full',
    family: 'v4-full',
    generation: 'v4',
    maxSteps: 50,
    maxScale: 10,
  },
  {
    id: 'nai-diffusion-4-curated-inpainting',
    label: 'NAI Diffusion V4 Curated',
    family: 'v4-curated',
    generation: 'v4',
    maxSteps: 50,
    maxScale: 10,
  },
  {
    id: 'nai-diffusion-3-inpainting',
    label: 'NAI Diffusion Anime V3',
    family: 'v3',
    generation: 'v3',
    maxSteps: 50,
    maxScale: 10,
  },
  {
    id: 'nai-diffusion-furry-3-inpainting',
    label: 'NAI Diffusion Furry V3',
    family: 'v3-furry',
    generation: 'v3',
    maxSteps: 50,
    maxScale: 10,
  },
];

export function modelInfo(id: string): NaiModelInfo | undefined {
  return NAI_MODELS.find((model) => model.id === id);
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

/**
 * NovelAI 웹(novelai.net)이 실제로 붙이는 문구(2026-10 웹 코드 기준). docs.novelai.net의 문구와 다른
 * 곳은 웹을 따르고, 예전 문구는 legacy로 남겨 그때 만든 이미지를 불러올 때만 알아본다.
 * 모델에 없는 단계·프리셋은 넣지 않는다.
 */
export const NAI_TAGS: Record<NaiTagFamily, NaiTagTable> = {
  v5: {
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
  },
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

/** 최종 네거티브(V3는 캐릭터 네거티브까지 합친 것)가 비었을 때 NovelAI 웹처럼 대신 보낼 네거티브. */
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

/** 모델이 지원하는 품질 태그 단계. V5만 Standard·Light 두 가지가 있다. */
export function qualityLevelsFor(model: string): QualityLevel[] {
  return (Object.keys(QUALITY_LEVEL_LABELS) as QualityLevel[]).filter(
    (level) => tagsFor(model).quality[level],
  );
}

/** 모델이 지원하는 UC 프리셋('없음' 포함). */
export function ucPresetsFor(model: string): UcPresetId[] {
  return (Object.keys(UC_PRESET_LABELS) as UcPresetId[]).filter(
    (id) => id === 'none' || tagsFor(model).uc[id],
  );
}

/** 모델에서 실제로 쓰이는 품질 태그·UC 문구. 미리보기와 설정 화면에서 보여 준다. */
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

/**
 * NovelAI 웹이 요청의 `tag_hint_qt`·`tag_hint_uc_preset`에 쓰는 번호. 메타데이터에 남아,
 * 이미지를 불러올 때 어떤 품질 태그·UC 프리셋을 썼는지 알려 준다.
 */
export const NAI_TAG_HINT = {
  none: 0,
  standard: 1,
  heavy: 2,
  light: 3,
  human: 4,
  furry: 5,
} as const;

/** 실제로 붙은 품질 태그 단계와 UC 프리셋의 힌트 번호. 모델에 없어 붙지 않은 것은 0(없음)이다. */
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

/** NovelAI 웹이 nsfw를 자동으로 붙이지 않는 모델 계열. */
const NO_AUTO_NSFW = new Set<NaiTagFamily>(['v4-5-curated', 'v4-curated']);

/**
 * NovelAI 웹은 UC 프리셋을 쓰면 네거티브 맨 앞에 `nsfw`를 붙인다. Curated 모델과,
 * 포지티브(품질 태그·캐릭터 프롬프트 포함)에 이미 nsfw가 있는 경우는 빼고. 이 함수는 모델과 프리셋 조건만 본다.
 */
export function addsAutoNsfw(model: string, ucPreset: UcPresetId): boolean {
  const family = modelInfo(model)?.family ?? 'v4-5-full';
  return !NO_AUTO_NSFW.has(family) && naiTagText(model, { qualityTags: false, ucPreset }).uc !== '';
}

function mentionsNsfw(...prompts: string[]): boolean {
  return prompts.some((prompt) => prompt.toLowerCase().includes('nsfw'));
}

/**
 * 품질 태그와 UC 프리셋을 적용한 최종 공통 포지티브/네거티브. 모델에 없는 단계·프리셋은 무시한다.
 * NovelAI 웹처럼 조건이 맞으면 네거티브 맨 앞에 `nsfw`를 붙이며, 이때 캐릭터 프롬프트도 함께 본다.
 */
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

/**
 * 지금 문구와 예전 문구를 함께 후보로 만든다. 긴 문구부터 비교해야 Human Focus가 Heavy로,
 * 긴 예전 문구가 짧은 문구로 잘못 잡히지 않는다.
 */
function tagCandidates<K extends string>(
  current: Partial<Record<K, string>>,
  legacy: Partial<Record<K, string>> | undefined,
  preferred?: string,
): Array<[K, string]> {
  // 힌트로 알려 준 것을 먼저 본다(NovelAI 웹과 같은 순서).
  const rank = ([key]: [K, string]) => (key === preferred ? 0 : 1);
  return [current, legacy ?? {}]
    .flatMap((table) => Object.entries(table) as Array<[K, string]>)
    .map(([key, text]): [K, string] => [key, clean(text)])
    .filter(([, text]) => text)
    .sort((a, b) => rank(a) - rank(b) || b[1].length - a[1].length);
}

/** 힌트 번호를 품질 태그 단계·UC 프리셋 이름으로. 모르는 번호면 undefined. */
function hintName(hint: number | undefined): string | undefined {
  return (Object.keys(NAI_TAG_HINT) as Array<keyof typeof NAI_TAG_HINT>).find(
    (key) => NAI_TAG_HINT[key] === hint,
  );
}

/** `prompt`가 태그 경계에서 `suffix`로 끝나면 그 앞부분을, 아니면 undefined를 돌려준다. */
function stripTagSuffix(prompt: string, suffix: string): string | undefined {
  if (!suffix || !prompt.endsWith(suffix)) return undefined;
  const rest = prompt.slice(0, -suffix.length);
  return rest === '' || /,\s*$/.test(rest) ? clean(rest) : undefined;
}

/** `prompt`가 태그 경계에서 `prefix`로 시작하면 그 뒷부분을, 아니면 undefined를 돌려준다. */
function stripTagPrefix(prompt: string, prefix: string): string | undefined {
  if (!prefix || !prompt.startsWith(prefix)) return undefined;
  const rest = prompt.slice(prefix.length);
  return rest === '' || /^\s*,/.test(rest) ? clean(rest) : undefined;
}

/**
 * 가져온 이미지의 프롬프트에서 품질 태그와 UC 프리셋 문자열을 찾아 떼어낸다.
 * NovelAI 웹은 UC 프리셋 앞에 `nsfw`를 붙이므로 그 뒤에서도 프리셋을 찾는다. 그 `nsfw`는 앱이 생성할 때
 * 다시 붙이므로 떼어 낸다(`applyNaiTags`).
 * NovelAI 웹이 남긴 힌트(`tag_hint_qt`, `tag_hint_uc_preset`)가 있으면 그것부터 찾고, 힌트가 '없음'이면
 * 문구가 같아 보여도 사용자가 직접 쓴 것으로 보고 떼지 않는다.
 */
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
          // 생성할 때 다시 붙을 nsfw만 뗀다. 직접 쓴 것으로 보이면 같은 요청이 되도록 남긴다.
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
  // 네거티브가 비어서 NovelAI 웹이 대신 보낸 기본값(V3의 lowres)은 생성할 때 다시 붙으므로 뗀다.
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
