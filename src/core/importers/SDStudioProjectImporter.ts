import { z } from 'zod';
import type { Character, EmotionSet, ImportWarning, PieceSet, Preset } from '../domain/types';
import {
  createCharacter,
  createEmotion,
  createPieceSet,
  createPreset,
  createPromptSet,
  newId,
} from '../model/defaults';
import { pieceRef } from '../prompts/PromptPieces';
import { sdStudioRootSchema } from '../validation/schemas';

export class SDStudioImportError extends Error {
  constructor(
    message: string,
    readonly details: string[],
  ) {
    super(message);
    this.name = 'SDStudioImportError';
  }
}

type PromptPiece = { prompt?: unknown; characterPrompts?: unknown; enabled?: unknown };
type CharacterPromptPiece = {
  id?: unknown;
  name?: unknown;
  prompt?: unknown;
  uc?: unknown;
  enabled?: unknown;
};

export type SDStudioImport = {
  /** 프리셋이 없는 파일(씬만 담은 파일)이면 없다. */
  character?: Character;
  emotionSet: EmotionSet;
  /** 공통 프롬프트가 있을 때만 */
  preset?: Preset;
  /** 감정 프롬프트가 부르는 multi 조각 세트 */
  variantSet?: PieceSet;
  warnings: ImportWarning[];
};

function formatZodError(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`);
}

function cleanPrompt(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/^[,\s]+|[,\s]+$/g, '') : '';
}

function joinPrompts(...values: unknown[]): string {
  return values.map(cleanPrompt).filter(Boolean).join(', ');
}

function characterPromptArray(value: unknown): CharacterPromptPiece[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is CharacterPromptPiece => typeof item === 'object' && item !== null,
      )
    : [];
}

const MAX_COMBOS = 200;

/** 조각 참조에 못 쓰는 점·꺾쇠·줄바꿈을 뺀다. */
function refName(value: string): string {
  return value.replace(/[.<>\n]/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueName(name: string, taken: Array<{ name: string }>): string {
  let candidate = name;
  for (let index = 2; taken.some((item) => item.name === candidate); index += 1)
    candidate = `${name} ${index}`;
  return candidate;
}

/** `chars[j]`는 j번째 캐릭터 프롬프트 뒤에 붙는 부분(SDStudio `characterPrompts`). */
type SceneCombo = { common: string; chars: string[] };

const oneLine = (value: unknown) =>
  cleanPrompt(typeof value === 'string' ? value.replace(/[,\s]*\n[,\s]*/g, ', ') : '');

function joinCombo(head: SceneCombo, option: SceneCombo): SceneCombo {
  const length = Math.max(head.chars.length, option.chars.length);
  return {
    common: joinPrompts(head.common, option.common),
    chars: Array.from({ length }, (_, index) => joinPrompts(head.chars[index], option.chars[index])),
  };
}

/** SDStudio처럼 슬롯마다 켜진 프롬프트 하나씩의 모든 조합. 한 조합이 한 줄이라 줄바꿈은 쉼표로 바꾼다. */
function sceneCombos(slots: unknown): SceneCombo[] {
  if (!Array.isArray(slots)) return [];
  let combos: SceneCombo[] = [{ common: '', chars: [] }];
  for (const slot of slots) {
    const options = (Array.isArray(slot) ? (slot as PromptPiece[]) : [])
      .filter((piece) => piece && piece.enabled !== false)
      .map((piece) => ({
        common: oneLine(piece.prompt),
        chars: Array.isArray(piece.characterPrompts) ? piece.characterPrompts.map(oneLine) : [],
      }))
      .filter((option) => option.common || option.chars.some(Boolean));
    if (!options.length) continue;
    combos = combos.flatMap((head) => options.map((option) => joinCombo(head, option)));
    if (combos.length > MAX_COMBOS) combos = combos.slice(0, MAX_COMBOS + 1);
  }
  return combos.filter((combo) => combo.common || combo.chars.some(Boolean));
}

/** 공통 부분은 첫 캐릭터 칸에 합친다. 끝의 빈 칸은 버린다. */
function scenePrompts(combo: SceneCombo | undefined): { prompt: string; extraPrompts: string[] } {
  if (!combo) return { prompt: '', extraPrompts: [] };
  const extraPrompts = combo.chars.slice(1);
  while (extraPrompts.length && !extraPrompts[extraPrompts.length - 1]) extraPrompts.pop();
  return { prompt: joinPrompts(combo.common, combo.chars[0]), extraPrompts };
}

export function isSDStudioProject(value: unknown): boolean {
  return sdStudioRootSchema.safeParse(value).success;
}

export function importSDStudioProject(raw: string): SDStudioImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SDStudioImportError('JSON 문법을 읽을 수 없습니다.', [message]);
  }

  const validation = sdStudioRootSchema.safeParse(parsed);
  if (!validation.success) {
    throw new SDStudioImportError(
      'SDStudio 필수 구조가 누락되었습니다.',
      formatZodError(validation.error),
    );
  }

  const root = validation.data;
  const extendedRoot = root as typeof root & {
    selectedWorkflow?: { presetName?: unknown };
    presetShareds?: { SDImageGen?: { characterPrompts?: unknown } };
  };
  const selectedPresetName = cleanPrompt(extendedRoot.selectedWorkflow?.presetName);
  const sources = root.presets.SDImageGen ?? [];
  const source = sources.find((candidate) => candidate.name === selectedPresetName) ?? sources[0];
  const warnings: ImportWarning[] = [];
  const emotions: EmotionSet['emotions'] = [];

  const variantSetName = refName(`${root.name} 변형`);
  const variants: Array<{ name: string; prompt: string; multi: boolean }> = [];

  for (const [sceneName, sceneValue] of Object.entries(root.scenes)) {
    if (sceneName === 'default') continue;

    const sourcePath = `scenes.${sceneName}.slots`;
    const slots =
      typeof sceneValue === 'object' && sceneValue !== null && 'slots' in sceneValue
        ? (sceneValue as { slots?: unknown }).slots
        : undefined;
    const combos = sceneCombos(slots);
    const first = scenePrompts(combos[0]);
    let prompt = first.prompt;

    if (combos.length > 1) {
      // SDStudio는 조합마다 이미지를 만들지만, 여기서는 multi 조각으로 옮겨 이미지마다 하나를 고른다.
      // 두 번째 캐릭터부터는 조각으로 캐릭터마다 고를 수 없어 첫 조합 것을 쓴다.
      const pieceName = uniqueName(refName(sceneName) || '장면', variants);
      const lines = combos.slice(0, MAX_COMBOS).map((combo) => scenePrompts(combo).prompt);
      variants.push({ name: pieceName, prompt: lines.join('\n'), multi: true });
      prompt = pieceRef(variantSetName, pieceName);
    }
    if (combos.length > MAX_COMBOS) {
      warnings.push({
        code: 'complex-slots',
        message: `${sceneName}: 조합이 많아 앞의 ${MAX_COMBOS}개만 가져왔습니다.`,
        path: sourcePath,
      });
    }
    if (!prompt) {
      warnings.push({
        code: 'empty-prompt',
        message: `${sceneName}: 활성 프롬프트가 비어 있어 이 씬을 비활성화했습니다.`,
        path: sourcePath,
      });
    }
    emotions.push({
      ...createEmotion(sceneName, prompt),
      ...(first.extraPrompts.length ? { extraPrompts: first.extraPrompts } : {}),
    });
  }
  if (variants.length) {
    warnings.push({
      code: 'complex-slots',
      message: `변형이 여러 개인 씬 ${variants.length}개는 프롬프트 조각 "${variantSetName}"으로 가져왔습니다. 이미지마다 변형 하나를 고릅니다.`,
      path: 'scenes',
    });
  }

  const emotionSet: EmotionSet = { id: newId(), name: `${root.name} 씬`, emotions };
  const variantSet = variants.length ? createPieceSet(variantSetName, variants) : undefined;
  if (!source) return { emotionSet, variantSet, warnings };
  const presetPath = `presets.SDImageGen[${sources.indexOf(source)}]`;

  const candidateCharacterPrompts = [
    ...characterPromptArray(source.characterPrompts),
    ...characterPromptArray(extendedRoot.presetShareds?.SDImageGen?.characterPrompts),
  ].filter((candidate) => candidate.enabled !== false && cleanPrompt(candidate.prompt));
  const keyOf = (item: CharacterPromptPiece) =>
    `${cleanPrompt(item.prompt)}\u0000${cleanPrompt(item.uc)}`;
  const uniqueCharacterPrompts = candidateCharacterPrompts.filter(
    (candidate, index, items) => items.findIndex((item) => keyOf(item) === keyOf(candidate)) === index,
  );
  const promptSets = uniqueCharacterPrompts.map((item, index) =>
    createPromptSet(cleanPrompt(item.name) || (index === 0 ? '기본' : `프롬프트 ${index + 1}`), {
      positive: cleanPrompt(item.prompt),
      negative: cleanPrompt(item.uc),
    }),
  );

  const commonPositive = joinPrompts(source.frontPrompt, source.backPrompt);
  if (!commonPositive) {
    warnings.push({
      code: 'missing-common-positive',
      message: '공통 포지티브 프롬프트가 비어 있습니다.',
      path: `${presetPath}.frontPrompt`,
    });
  }
  if (!promptSets.length) {
    warnings.push({
      code: 'missing-character-positive',
      message: '캐릭터 프롬프트가 비어 있습니다. 캐릭터 외형 태그를 입력하십시오.',
      path: `${presetPath}.characterPrompts`,
    });
  }
  if (promptSets.length > 1) {
    warnings.push({
      code: 'multiple-character-prompts',
      message: `캐릭터 프롬프트 ${promptSets.length}개를 각각 프롬프트 세트로 가져왔습니다.`,
      path: `${presetPath}.characterPrompts`,
    });
  }

  const base = createPreset(`${root.name} (SDStudio)`);
  const preset: Preset | undefined =
    commonPositive || cleanPrompt(source.uc)
      ? {
          ...base,
          commonPositive,
          commonNegative: cleanPrompt(source.uc),
          generation: {
            ...base.generation,
            sampler: typeof source.sampling === 'string' ? source.sampling : base.generation.sampler,
            steps: typeof source.steps === 'number' ? source.steps : base.generation.steps,
            promptGuidance:
              typeof source.promptGuidance === 'number' ? source.promptGuidance : base.generation.promptGuidance,
            cfgRescale: typeof source.cfgRescale === 'number' ? source.cfgRescale : base.generation.cfgRescale,
            noiseSchedule:
              typeof source.noiseSchedule === 'string' ? source.noiseSchedule : base.generation.noiseSchedule,
          },
        }
      : undefined;

  return {
    character: createCharacter(root.name, promptSets),
    emotionSet,
    preset,
    variantSet,
    warnings,
  };
}
