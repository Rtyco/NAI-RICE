import type { GenerationKind } from '../domain/types';

/** 이 구분 이전의 결과는 `outputs/<감정>/`에 남아 있다. */
export const KIND_FOLDERS: Record<GenerationKind, string> = {
  inpaint: '인페인트',
  txt2img: '일반 생성',
  img2img: 'i2i',
  augment: '디렉터 툴',
};

export const DEFAULT_OUTPUT_FILENAME_TEMPLATE = '{character}__{emotion}__v{variant}__{seed}';

export const OUTPUT_FILENAME_TOKENS = [
  '{character}',
  '{emotion}',
  '{emotionId}',
  '{variant}',
  '{seed}',
  '{model}',
  '{date}',
  '{time}',
] as const;

/** 씬 내보내기 기본값은 예전처럼 씬 이름만 쓴다. */
export const DEFAULT_EXPORT_FILENAME_TEMPLATE = '{emotion}';

export const EXPORT_FILENAME_TOKENS: Record<string, string> = {
  '{emotion}': '씬 이름',
  '{number}': '씬 모음 안 순서',
  '{character}': '캐릭터',
  '{project}': '작업 이름',
  '{seed}': 'Seed',
  '{model}': '모델',
  '{date}': '생성 날짜',
  '{time}': '생성 시각',
};

export type OutputFilenameContext = {
  character: string;
  emotion: string;
  emotionId: string;
  variant: number;
  seed: number;
  model: string;
  createdAt: string;
};

function timestampParts(createdAt: string): { date: string; time: string } {
  const parsed = new Date(createdAt);
  const iso = Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
  return {
    date: iso.slice(0, 10).replaceAll('-', ''),
    time: iso.slice(11, 19).replaceAll(':', ''),
  };
}

export function sanitizeFilenameStem(value: string): string {
  let cleaned = value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('')
    .replace(/[. ]+$/g, '')
    .trim();
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned)) cleaned = `_${cleaned}`;
  cleaned = cleaned.slice(0, 180).replace(/[. ]+$/g, '');
  return cleaned || 'result';
}

export function validateOutputFilenameTemplate(
  template: string,
  allowed: readonly string[] = OUTPUT_FILENAME_TOKENS,
): string | null {
  const trimmed = template.trim();
  if (!trimmed) return '파일명 템플릿을 입력하십시오.';
  const known = new Set(allowed);
  const tokens = trimmed.match(/\{[^{}]*\}/g) ?? [];
  const unknown = tokens.find((token) => !known.has(token));
  if (unknown) return `지원하지 않는 토큰입니다: ${unknown}`;
  const withoutTokens = tokens.reduce((value, token) => value.replaceAll(token, ''), trimmed);
  if (/[{}]/.test(withoutTokens)) return '중괄호가 올바르게 닫히지 않았습니다.';
  return null;
}

export function renderOutputFilename(template: string, context: OutputFilenameContext): string {
  const { date, time } = timestampParts(context.createdAt);
  const values: Record<(typeof OUTPUT_FILENAME_TOKENS)[number], string> = {
    '{character}': context.character,
    '{emotion}': context.emotion,
    '{emotionId}': context.emotionId,
    '{variant}': String(context.variant),
    '{seed}': String(context.seed),
    '{model}': shortModel(context.model),
    '{date}': date,
    '{time}': time,
  };
  let rendered = template.trim().replace(/\.png$/i, '');
  for (const token of OUTPUT_FILENAME_TOKENS) rendered = rendered.replaceAll(token, values[token]);
  return sanitizeFilenameStem(rendered);
}

function shortModel(model: string): string {
  return model.replace(/^nai-diffusion-/, '').replace(/-inpainting$/, '');
}

export function renderExportFilename(
  template: string,
  context: {
    emotion: string;
    /** 1부터. 씬 수의 자릿수만큼 0을 채운다. */
    number: number;
    total: number;
    character: string;
    project: string;
    seed: number;
    model: string;
    createdAt: string;
  },
): string {
  const { date, time } = timestampParts(context.createdAt);
  const values: Record<string, string> = {
    '{emotion}': context.emotion,
    '{number}': String(context.number).padStart(String(context.total).length, '0'),
    '{character}': context.character,
    '{project}': context.project,
    '{seed}': String(context.seed),
    '{model}': shortModel(context.model),
    '{date}': date,
    '{time}': time,
  };
  // 한 번에 바꿔야 씬 이름 속 `{seed}` 같은 글자가 다시 바뀌지 않는다.
  const rendered = template
    .trim()
    .replace(/\.(png|webp|avif)$/i, '')
    .replace(/\{[^{}]*\}/g, (token) => values[token] ?? token);
  return sanitizeFilenameStem(rendered);
}

/** 같은 이름은 _2, _3을 붙인다. */
export function exportFileNames(names: string[], extension: string): string[] {
  const used = new Map<string, number>();
  return names.map((name) => {
    const stem = sanitizeFilenameStem(name);
    const key = stem.toLowerCase();
    const count = (used.get(key) ?? 0) + 1;
    used.set(key, count);
    return `${stem}${count > 1 ? `_${count}` : ''}.${extension}`;
  });
}
