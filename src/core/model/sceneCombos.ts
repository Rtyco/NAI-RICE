import type { Emotion, SceneOption } from '../domain/types';
import { stripComments } from '../prompts/PromptPieces';

export type SceneCombo = {
  /** 칸 순서대로 고른 후보 ID를 `+`로 이었다. 조합 칸이 없으면 빈 값. */
  key: string;
  name: string;
  options: SceneOption[];
};

/** 생성 한 번에 넣는 조합 수 상한(큐 등록 상한 2000장보다 작게). */
export const MAX_COMBOS = 1000;

const enabledOptions = (slot: SceneOption[]) => slot.filter((option) => option.enabled);

export function comboCount(emotion: Pick<Emotion, 'slots'>): number {
  return (emotion.slots ?? []).reduce((total, slot) => total * enabledOptions(slot).length, 1);
}

export function optionLabel(option: SceneOption): string {
  const name = option.name?.trim();
  if (name) return name;
  const text = [option.prompt, ...option.characterPrompts]
    .map((prompt) => stripComments(prompt).trim())
    .find(Boolean);
  return text ? (text.length > 24 ? `${text.slice(0, 24)}…` : text) : '(빈 후보)';
}

function comboOf(options: SceneOption[]): SceneCombo {
  return {
    key: options.map((option) => option.id).join('+'),
    name: options.map(optionLabel).join(' · '),
    options,
  };
}

/** SDStudio처럼 앞 칸부터 차례로 바꾼다. 조합 칸이 없으면 빈 조합 하나. */
export function sceneCombos(emotion: Pick<Emotion, 'slots'>, limit = MAX_COMBOS): SceneCombo[] {
  let rows: SceneOption[][] = [[]];
  for (const slot of emotion.slots ?? []) {
    const options = enabledOptions(slot);
    rows = rows.flatMap((row) => options.map((option) => [...row, option])).slice(0, limit);
  }
  return rows.map(comboOf);
}

/** 기록의 `comboKey`가 가리키는 조합. 후보가 지워졌거나 꺼졌으면 없다. */
export function findCombo(emotion: Pick<Emotion, 'slots'>, key: string): SceneCombo | undefined {
  const ids = key ? key.split('+') : [];
  const slots = emotion.slots ?? [];
  if (ids.length !== slots.length) return undefined;
  const options = slots.map((slot, index) =>
    slot.find((option) => option.id === ids[index] && option.enabled),
  );
  return options.every(Boolean) ? comboOf(options as SceneOption[]) : undefined;
}

const join = (texts: Array<string | undefined>) =>
  texts
    .map((text) => (text ?? '').trim().replace(/^[,\s]+|[,\s]+$/g, ''))
    .filter(Boolean)
    .join(', ');

export type ComboPrompts = Pick<Emotion, 'prompt' | 'extraPrompts' | 'negative'> & {
  /** 첫 캐릭터 몫. 씬 위치와 관계없이 첫 캐릭터 프롬프트에 붙는다. */
  firstCharacter?: string;
};

/** 고정 프롬프트 뒤에 고른 후보를 칸 순서대로 붙인다. 후보의 `|`는 그대로 두어 자리 채우기에 쓴다. */
export function comboPrompts(emotion: Emotion, combo: SceneCombo | undefined): ComboPrompts {
  const options = combo?.options ?? [];
  if (!options.length)
    return {
      prompt: emotion.prompt,
      extraPrompts: emotion.extraPrompts,
      negative: emotion.negative,
    };
  const characterCount = Math.max(
    (emotion.extraPrompts?.length ?? 0) + 1,
    ...options.map((option) => option.characterPrompts.length),
  );
  const characterPart = (index: number) =>
    join(options.map((option) => option.characterPrompts[index]));
  return {
    prompt: join([emotion.prompt, ...options.map((option) => option.prompt)]),
    extraPrompts: Array.from({ length: characterCount - 1 }, (_, index) =>
      join([emotion.extraPrompts?.[index], characterPart(index + 1)]),
    ),
    negative: emotion.negative,
    firstCharacter: characterPart(0),
  };
}
