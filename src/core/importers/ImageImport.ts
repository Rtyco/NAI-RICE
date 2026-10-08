import type {
  Character,
  CharacterPromptSet,
  EmotionSet,
  Library,
  Preset,
  Project,
  QualityLevel,
  UcPresetId,
} from '../domain/types';
import type { ImageImportData } from '../metadata/NaiMetadata';
import {
  createCharacter,
  createEmotion,
  createEmotionSet,
  createPreset,
  createProject,
  createPromptSet,
  createReference,
} from '../model/defaults';
import { addPromptSet, mergeEmotions, patchItem, updatePromptSet } from '../model/mutations';

/** 프롬프트에서 떼어 낸 품질 태그·UC 프리셋. */
export type ImportedTags = {
  positive: string;
  negative: string;
  qualityTags: boolean;
  qualityLevel: QualityLevel;
  ucPreset: UcPresetId;
};

/** 이미지 불러오기 창에서 사용자가 고른 것. 화면 상태와 상관없이 이것만으로 결과가 정해진다. */
export type ImageImportChoices = {
  /** 새로 만드는 항목(생성 설정·캐릭터·프롬프트 세트·감정 모음·레퍼런스·작업)에 붙일 이름. 덮어쓰는 항목은 이름을 그대로 둔다. */
  name?: string;
  preset?: {
    /** 덮어쓸 프리셋. 없으면 새로 만든다. */
    overwrite?: Preset;
    positive: boolean;
    negative: boolean;
    quality: boolean;
    uc: boolean;
    settings: boolean;
    model: boolean;
    seed: boolean;
  };
  character?: {
    index: number;
    target: 'new' | 'add-set' | 'overwrite-set';
    character?: Character;
    promptSet?: CharacterPromptSet;
  };
  emotion?: { target: 'current' | 'new'; emotionSet?: EmotionSet };
  reference: boolean;
  /** 새 작업으로 묶을지. false면 지금 작업(있으면)에 연결한다. */
  newProject: boolean;
};

export type ImageImportContext = {
  /** 파일 이름에서 확장자를 뺀 것. 이름이 없을 때 쓴다. */
  stem: string;
  data: ImageImportData;
  tags: ImportedTags;
  project?: Project;
  /** 지금 작업이 쓰는 캐릭터. */
  character?: Character;
};

export type ImageImportResult = {
  library: Library;
  applied: string[];
  /** 새로 만든 작업. 열어서 보여 준다. */
  projectId?: string;
  /** 새로 만든 레퍼런스. 이미지를 넣도록 편집기를 연다. */
  referenceId?: string;
};

/** 이미지에서 읽은 설정을 고른 대로 라이브러리에 반영한다. 원래 라이브러리는 바꾸지 않는다. */
export function applyImageImport(
  library: Library,
  context: ImageImportContext,
  choices: ImageImportChoices,
): ImageImportResult {
  const { stem, data, tags, project } = context;
  const desk = data.desk;
  const name = choices.name?.trim() || desk?.characterName || stem;
  const applied: string[] = [];
  let next = library;
  let presetId = project?.presetId ?? library.presets[0].id;
  let characterForProject: Character | undefined = context.character;
  let promptSetId = project?.promptSetId;
  let emotionSetId = project?.emotionSetId;
  let referenceId = project?.referenceId;

  // ① 프리셋
  const presetChoice = choices.preset;
  if (presetChoice) {
    const overwrite = presetChoice.overwrite;
    const base: Preset = overwrite ?? createPreset(name);
    let generation = { ...base.generation };
    if (presetChoice.settings) generation = { ...generation, ...data.settings };
    if (presetChoice.model && data.model) generation.model = data.model;
    if (presetChoice.quality) {
      generation.qualityTags = tags.qualityTags;
      generation.qualityLevel = tags.qualityLevel;
    }
    if (presetChoice.uc) generation.ucPreset = tags.ucPreset;
    if (presetChoice.seed && data.seed !== undefined)
      generation = { ...generation, seedMode: 'fixed', fixedSeed: data.seed };
    const preset: Preset = {
      ...base,
      commonPositive:
        presetChoice.positive && data.commonPositive !== undefined
          ? tags.positive
          : base.commonPositive,
      commonNegative:
        presetChoice.negative && data.commonNegative !== undefined
          ? tags.negative
          : base.commonNegative,
      generation,
    };
    next = overwrite
      ? patchItem(next, 'presets', preset.id, () => preset)
      : { ...next, presets: [...next.presets, preset] };
    presetId = preset.id;
    applied.push(overwrite ? `생성 설정 "${preset.name}" 갱신` : `새 생성 설정 "${preset.name}"`);
  }

  // ② 캐릭터
  const characterChoice = choices.character;
  const characterPrompt = characterChoice ? data.characters[characterChoice.index] : undefined;
  if (characterChoice && characterPrompt) {
    const { character: target, promptSet: targetSet } = characterChoice;
    if (characterChoice.target === 'new' || !target || !targetSet) {
      // 새 캐릭터 안의 첫 세트는 원래 세트 이름(없으면 "기본")을 쓰고, 캐릭터에 이름을 붙인다.
      const character = createCharacter(name, [
        createPromptSet(desk?.promptSet.name ?? '기본', characterPrompt),
      ]);
      next = { ...next, characters: [...next.characters, character] };
      characterForProject = character;
      promptSetId = character.promptSets[0].id;
      applied.push(`새 캐릭터 "${character.name}"`);
    } else if (characterChoice.target === 'add-set') {
      const result = addPromptSet(target, name, characterPrompt);
      next = patchItem(next, 'characters', target.id, () => result.character);
      promptSetId = result.setId;
      characterForProject = result.character;
      applied.push(`프롬프트 세트 "${name}" 추가`);
    } else {
      const updated = updatePromptSet(target, targetSet.id, characterPrompt);
      next = patchItem(next, 'characters', target.id, () => updated);
      characterForProject = updated;
      promptSetId = targetSet.id;
      applied.push(`"${target.name}" 프롬프트 세트 "${targetSet.name}" 덮어쓰기`);
    }
  }

  // ③ 감정
  if (choices.emotion && desk) {
    const targetSet = choices.emotion.emotionSet;
    if (choices.emotion.target === 'current' && targetSet) {
      next = patchItem(next, 'emotionSets', targetSet.id, (set) =>
        mergeEmotions(set, [{ name: desk.emotion.name, prompt: desk.emotion.prompt }]),
      );
      emotionSetId = targetSet.id;
    } else {
      const set: EmotionSet = {
        ...createEmotionSet(name, []),
        emotions: [createEmotion(desk.emotion.name, desk.emotion.prompt)],
      };
      next = { ...next, emotionSets: [...next.emotionSets, set] };
      emotionSetId = set.id;
      applied.push(`새 감정 모음 "${set.name}"`);
    }
    applied.push(`감정 "${desk.emotion.name}"`);
  }

  // ④ 레퍼런스
  let newReferenceId: string | undefined;
  if (choices.reference) {
    const reference = createReference(name);
    next = { ...next, references: [...next.references, reference] };
    newReferenceId = reference.id;
    referenceId = reference.id;
    applied.push(`새 인페인트 "${reference.name}"`);
  }

  // 새 작업으로 묶거나 현재 작업에 연결
  let openId: string | undefined;
  if (choices.newProject) {
    const character = characterForProject ?? createCharacter(name);
    if (!next.characters.some((item) => item.id === character.id))
      next = { ...next, characters: [...next.characters, character] };
    if (!emotionSetId || !next.emotionSets.some((set) => set.id === emotionSetId)) {
      const set = createEmotionSet(`${character.name} 감정`);
      next = { ...next, emotionSets: [...next.emotionSets, set] };
      emotionSetId = set.id;
    }
    if (!referenceId) {
      const reference = createReference(character.name);
      next = { ...next, references: [...next.references, reference] };
      referenceId = reference.id;
    }
    const created: Project = createProject(name, {
      presetId,
      character,
      emotionSetId,
      referenceId,
    });
    if (promptSetId && character.promptSets.some((set) => set.id === promptSetId))
      created.promptSetId = promptSetId;
    next = { ...next, projects: [...next.projects, created] };
    openId = created.id;
    applied.push(`새 작업 "${created.name}"`);
  } else if (project) {
    next = patchItem(next, 'projects', project.id, (item) => ({
      ...item,
      presetId,
      characterId: characterForProject?.id ?? item.characterId,
      promptSetId: promptSetId ?? item.promptSetId,
      emotionSetId: emotionSetId ?? item.emotionSetId,
      referenceId: referenceId ?? item.referenceId,
    }));
  }

  return { library: next, applied, projectId: openId, referenceId: newReferenceId };
}
