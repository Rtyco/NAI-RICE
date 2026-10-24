import type { Emotion, GenerationRecord, SceneOption } from '../domain/types';
import { joinFragments, tagPieces } from '../prompts/PromptComposer';
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
    joinFragments(...options.map((option) => option.characterPrompts[index]));
  return {
    prompt: joinFragments(emotion.prompt, ...options.map((option) => option.prompt)),
    extraPrompts: Array.from({ length: characterCount - 1 }, (_, index) =>
      joinFragments(emotion.extraPrompts?.[index], characterPart(index + 1)),
    ),
    negative: emotion.negative,
    firstCharacter: characterPart(0),
  };
}

export type ScenePrompts = Pick<Emotion, 'prompt' | 'negative' | 'extraPrompts' | 'slots'>;

export type ScenePromptRecord = Pick<
  GenerationRecord,
  'emotionPrompt' | 'emotionNegative' | 'emotionExtraPrompts' | 'comboKey' | 'comboOptions'
>;

/** 기록 당시의 씬 프롬프트와 고른 후보 내용. 지운 후보와 예전 기록에 없는 값은 지금 것을 둔다. */
export function recordedScenePrompts(emotion: Emotion, record: ScenePromptRecord): ScenePrompts {
  const ids = record.comboKey ? record.comboKey.split('+') : [];
  const texts = new Map(ids.map((id, index) => [id, record.comboOptions?.[index]]));
  const extras = record.emotionExtraPrompts;
  return {
    prompt: record.emotionPrompt,
    negative: record.emotionNegative,
    extraPrompts: extras
      ? extras.some((text) => text.trim())
        ? extras
        : undefined
      : emotion.extraPrompts,
    slots: emotion.slots?.map((slot) =>
      slot.map((option) => {
        const text = texts.get(option.id);
        return text
          ? { ...option, prompt: text.prompt, characterPrompts: text.characterPrompts }
          : option;
      }),
    ),
  };
}

/** 끝의 빈 칸은 없는 것과 같다. */
const promptList = (list: string[] | undefined) => {
  const items = [...(list ?? [])];
  while (items.length && !items.at(-1)?.trim()) items.pop();
  return items;
};

const slotTexts = (slots: Emotion['slots']) =>
  JSON.stringify(
    (slots ?? []).map((slot) =>
      slot.map((option) => [option.id, option.prompt, promptList(option.characterPrompts)]),
    ),
  );

export function sameScenePrompts(emotion: Emotion, prompts: ScenePrompts): boolean {
  return (
    emotion.prompt === prompts.prompt &&
    (emotion.negative ?? '') === (prompts.negative ?? '') &&
    JSON.stringify(promptList(emotion.extraPrompts)) ===
      JSON.stringify(promptList(prompts.extraPrompts)) &&
    slotTexts(emotion.slots) === slotTexts(prompts.slots)
  );
}

const NO_TAGS: ReadonlySet<string> = new Set();

/** 후보의 캐릭터 몫이 붙는 곳. 0은 씬 프롬프트와 같은 곳, -1은 씬 프롬프트가 공통 쪽일 때의 첫 캐릭터. */
export const characterTagGroup = (index: number, firstOnCommon: boolean) =>
  index === 0 && firstOnCommon ? -1 : index;

/**
 * 한 조합에서 함께 붙는 칸끼리 두 번 이상 나오는 태그. 붙는 곳(0은 씬 프롬프트, n은 n+1번째 캐릭터)별로 센다.
 * 같은 칸의 후보끼리는 한 조합에 함께 붙지 않는다.
 */
export function sceneRepeatedTags(
  emotion: Emotion,
  firstOnCommon = false,
): (group: number) => ReadonlySet<string> {
  // 붙는 곳 → 태그 → 칸(-1은 고정 프롬프트) → 나온 수
  const groups = new Map<number, Map<string, Map<number, number>>>();
  const add = (group: number, slot: number, text: string) => {
    const tags = groups.get(group) ?? new Map<string, Map<number, number>>();
    groups.set(group, tags);
    const counts = new Map<string, number>();
    for (const { key } of tagPieces(text)) counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const [key, count] of counts) {
      const slots = tags.get(key) ?? new Map<number, number>();
      tags.set(key, slots);
      slots.set(slot, Math.max(slots.get(slot) ?? 0, count));
    }
  };
  add(0, -1, emotion.prompt);
  emotion.extraPrompts?.forEach((text, index) => add(index + 1, -1, text));
  emotion.slots?.forEach((slot, index) => {
    for (const option of slot.filter((item) => item.enabled)) {
      add(0, index, option.prompt);
      option.characterPrompts.forEach((text, character) =>
        add(characterTagGroup(character, firstOnCommon), index, text),
      );
    }
  });
  const sum = (slots: Map<number, number>) => [...slots.values()].reduce((a, b) => a + b, 0);
  const repeated = new Map(
    [...groups].map(([group, tags]) => [
      group,
      new Set([...tags].filter(([, slots]) => sum(slots) > 1).map(([key]) => key)),
    ]),
  );
  return (group) => repeated.get(group) ?? NO_TAGS;
}

export const hasFixedScenePrompt = (emotion: Emotion) =>
  Boolean(emotion.prompt.trim() || emotion.extraPrompts?.some((text) => text.trim()));

/** 고정 씬 프롬프트를 후보 하나짜리 맨 앞 칸으로 옮긴다. 만들어지는 프롬프트는 같다. */
export function moveScenePromptToSlot(
  emotion: Emotion,
  id: string,
): Pick<Emotion, 'prompt' | 'extraPrompts' | 'slots'> {
  const extras = promptList(emotion.extraPrompts);
  const option: SceneOption = {
    id,
    prompt: emotion.prompt,
    // 고정 씬 프롬프트는 첫 캐릭터 몫이 아니라 씬 자리로 간다.
    characterPrompts: extras.length ? ['', ...extras] : [],
    enabled: true,
  };
  return { prompt: '', extraPrompts: undefined, slots: [[option], ...(emotion.slots ?? [])] };
}

/** 첫 칸이 켜진 후보 하나뿐이고 첫 캐릭터 몫이 없을 때만 합쳐도 프롬프트가 같다. */
export function mergeableFirstSlot(emotion: Emotion): SceneOption | undefined {
  const first = emotion.slots?.[0];
  const option = first?.length === 1 ? first[0] : undefined;
  return option?.enabled && !option.characterPrompts[0]?.trim() ? option : undefined;
}

export function mergeFirstSlot(
  emotion: Emotion,
): Pick<Emotion, 'prompt' | 'extraPrompts' | 'slots'> | undefined {
  const option = mergeableFirstSlot(emotion);
  if (!option) return undefined;
  const count = Math.max(emotion.extraPrompts?.length ?? 0, option.characterPrompts.length - 1);
  const extras = Array.from({ length: count }, (_, index) =>
    joinFragments(emotion.extraPrompts?.[index], option.characterPrompts[index + 1]),
  );
  const rest = emotion.slots!.slice(1);
  return {
    prompt: joinFragments(emotion.prompt, option.prompt),
    extraPrompts: extras.some(Boolean) ? extras : undefined,
    slots: rest.length ? rest : undefined,
  };
}
