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

type PromptPiece = { prompt?: unknown; enabled?: unknown };
type CharacterPromptPiece = {
  id?: unknown;
  name?: unknown;
  prompt?: unknown;
  uc?: unknown;
  enabled?: unknown;
};

export type SDStudioImport = {
  character: Character;
  emotionSet: EmotionSet;
  /** 공통 프롬프트가 있으면 새 프리셋으로 만든다. */
  preset?: Preset;
  /** 변형이 여러 개인 장면을 담은 multi 조각 세트. 감정 프롬프트가 이것을 부른다. */
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

/** 조각 참조에 쓸 수 없는 문자(점, 꺾쇠, 줄바꿈)를 뺀다. */
function refName(value: string): string {
  return value.replace(/[.<>\n]/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueName(name: string, taken: Array<{ name: string }>): string {
  let candidate = name;
  for (let index = 2; taken.some((item) => item.name === candidate); index += 1)
    candidate = `${name} ${index}`;
  return candidate;
}

/**
 * 장면의 슬롯 조합. SDStudio처럼 슬롯마다 켜진 프롬프트 하나씩을 골라 이은 모든 조합이다.
 * 한 조합은 한 줄이 되므로 프롬프트 안의 줄바꿈은 쉼표로 바꾼다.
 */
function sceneCombos(slots: unknown): string[] {
  if (!Array.isArray(slots)) return [];
  let combos = [''];
  for (const slot of slots) {
    const options = (Array.isArray(slot) ? (slot as PromptPiece[]) : [])
      .filter((piece) => piece && piece.enabled !== false)
      .map((piece) =>
        cleanPrompt(typeof piece.prompt === 'string' ? piece.prompt.replace(/[,\s]*\n[,\s]*/g, ', ') : ''),
      )
      .filter(Boolean);
    if (!options.length) continue;
    combos = combos.flatMap((head) => options.map((option) => joinPrompts(head, option)));
    if (combos.length > MAX_COMBOS) combos = combos.slice(0, MAX_COMBOS + 1);
  }
  return combos.filter(Boolean);
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
  const source =
    root.presets.SDImageGen.find((candidate) => candidate.name === selectedPresetName) ??
    root.presets.SDImageGen[0];
  const presetPath = `presets.SDImageGen[${root.presets.SDImageGen.indexOf(source)}]`;
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
    let prompt = combos[0] ?? '';

    if (combos.length > 1) {
      // SDStudio는 조합마다 이미지를 만든다. 여기서는 한 줄에 조합 하나인 multi 조각으로 옮겨
      // 이미지마다 하나를 고른다.
      const pieceName = uniqueName(refName(sceneName) || '장면', variants);
      variants.push({ name: pieceName, prompt: combos.slice(0, MAX_COMBOS).join('\n'), multi: true });
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
        message: `${sceneName}: 활성 프롬프트가 비어 있어 이 감정을 비활성화했습니다.`,
        path: sourcePath,
      });
    }
    emotions.push(createEmotion(sceneName, prompt));
  }
  if (variants.length) {
    warnings.push({
      code: 'complex-slots',
      message: `변형이 여러 개인 감정 ${variants.length}개는 프롬프트 조각 "${variantSetName}"으로 가져왔습니다. 이미지마다 변형 하나를 고릅니다.`,
      path: 'scenes',
    });
  }

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
    emotionSet: { id: newId(), name: `${root.name} 감정`, emotions },
    preset,
    variantSet: variants.length ? createPieceSet(variantSetName, variants) : undefined,
    warnings,
  };
}
