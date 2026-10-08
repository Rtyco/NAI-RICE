export const DEFAULT_OUTPUT_FILENAME_TEMPLATE =
  '{character}__{emotion}__v{variant}__{seed}';

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

export function validateOutputFilenameTemplate(template: string): string | null {
  const trimmed = template.trim();
  if (!trimmed) return '파일명 템플릿을 입력하십시오.';
  const known = new Set<string>(OUTPUT_FILENAME_TOKENS);
  const tokens = trimmed.match(/\{[^{}]*\}/g) ?? [];
  const unknown = tokens.find((token) => !known.has(token));
  if (unknown) return `지원하지 않는 토큰입니다: ${unknown}`;
  const withoutTokens = tokens.reduce((value, token) => value.replaceAll(token, ''), trimmed);
  if (/[{}]/.test(withoutTokens)) return '중괄호가 올바르게 닫히지 않았습니다.';
  return null;
}

export function renderOutputFilename(
  template: string,
  context: OutputFilenameContext,
): string {
  const { date, time } = timestampParts(context.createdAt);
  const values: Record<(typeof OUTPUT_FILENAME_TOKENS)[number], string> = {
    '{character}': context.character,
    '{emotion}': context.emotion,
    '{emotionId}': context.emotionId,
    '{variant}': String(context.variant),
    '{seed}': String(context.seed),
    '{model}': context.model.replace(/^nai-diffusion-/, '').replace(/-inpainting$/, ''),
    '{date}': date,
    '{time}': time,
  };
  let rendered = template.trim().replace(/\.png$/i, '');
  for (const token of OUTPUT_FILENAME_TOKENS) rendered = rendered.replaceAll(token, values[token]);
  return sanitizeFilenameStem(rendered);
}

/** 내보내기용: 감정 이름을 그대로 파일 이름으로 쓰고, 같은 이름은 _2, _3을 붙인다. */
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
