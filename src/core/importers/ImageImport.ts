import type {
  Character,
  CharacterPromptSet,
  CharacterSlot,
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

export type ImportedTags = {
  positive: string;
  negative: string;
  qualityTags: boolean;
  qualityLevel: QualityLevel;
  ucPreset: UcPresetId;
};

/** 화면 상태와 상관없이 이것만으로 결과가 정해진다. */
export type ImageImportChoices = {
  /** 새로 만드는 항목의 이름. 덮어쓰는 항목은 이름을 그대로 둔다. */
  name?: string;
  preset?: {
    /** 없으면 새로 만든다. */
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
    /** 'all'이면 캐릭터마다 새 캐릭터를 그 순서대로 넣는다. */
    index: number | 'all';
    target: 'new' | 'add-set' | 'overwrite-set';
    character?: Character;
    promptSet?: CharacterPromptSet;
  };
  emotion?: { target: 'current' | 'new'; emotionSet?: EmotionSet };
  reference: boolean;
  /** false면 지금 작업에 연결한다. */
  newProject: boolean;
};

export type ImageImportContext = {
  /** 확장자를 뺀 파일 이름 */
  stem: string;
  data: ImageImportData;
  tags: ImportedTags;
  project?: Project;
  character?: Character;
};

export type ImageImportResult = {
  library: Library;
  applied: string[];
  projectId?: string;
  referenceId?: string;
};

/** 원래 라이브러리는 바꾸지 않는다. */
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
  let promptSetId = project?.characters[0]?.promptSetId;
  let emotionSetId = project?.emotionSetId;
  let referenceId = project?.referenceId;

  const presetChoice = choices.preset;
  if (presetChoice) {
    const overwrite = presetChoice.overwrite;
    const base: Preset = overwrite ?? createPreset(name);
    let generation = { ...base.generation };
    if (presetChoice.settings) generation = { ...generation, ...data.settings };
    if (presetChoice.model && data.model) {
      generation.model = data.model;
      if (data.effort) generation.effort = data.effort;
    }
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

  const characterChoice = choices.character;
  const characterPrompt =
    characterChoice && characterChoice.index !== 'all'
      ? data.characters[characterChoice.index]
      : undefined;
  let moreSlots: CharacterSlot[] = [];
  if (characterChoice?.index === 'all' && data.characters.length) {
    const created = data.characters.map((prompts, index) =>
      createCharacter(`${name} ${index + 1}`, [createPromptSet('기본', prompts)]),
    );
    next = { ...next, characters: [...next.characters, ...created] };
    characterForProject = created[0];
    promptSetId = created[0].promptSets[0].id;
    moreSlots = created
      .slice(1)
      .map((item) => ({ characterId: item.id, promptSetId: item.promptSets[0].id }));
    applied.push(`새 캐릭터 ${created.length}명`);
  } else if (characterChoice && characterPrompt) {
    const { character: target, promptSet: targetSet } = characterChoice;
    if (characterChoice.target === 'new' || !target || !targetSet) {
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

  if (choices.emotion && desk) {
    const targetSet = choices.emotion.emotionSet;
    if (choices.emotion.target === 'current' && targetSet) {
      next = patchItem(next, 'emotionSets', targetSet.id, (set) =>
        mergeEmotions(set, [desk.emotion]),
      );
      emotionSetId = targetSet.id;
    } else {
      const set: EmotionSet = {
        ...createEmotionSet(name, []),
        emotions: [
          {
            ...createEmotion(desk.emotion.name, desk.emotion.prompt),
            negative: desk.emotion.negative,
          },
        ],
      };
      next = { ...next, emotionSets: [...next.emotionSets, set] };
      emotionSetId = set.id;
      applied.push(`새 씬 모음 "${set.name}"`);
    }
    applied.push(`씬 "${desk.emotion.name}"`);
  }

  let newReferenceId: string | undefined;
  if (choices.reference) {
    const reference = createReference(name);
    next = { ...next, references: [...next.references, reference] };
    newReferenceId = reference.id;
    referenceId = reference.id;
    applied.push(`새 인페인트 "${reference.name}"`);
  }

  let openId: string | undefined;
  if (choices.newProject) {
    const character = characterForProject ?? createCharacter(name);
    if (!next.characters.some((item) => item.id === character.id))
      next = { ...next, characters: [...next.characters, character] };
    if (!emotionSetId || !next.emotionSets.some((set) => set.id === emotionSetId)) {
      const set = createEmotionSet(`${character.name} 씬`);
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
      created.characters[0].promptSetId = promptSetId;
    created.characters.push(...moreSlots);
    placeCharacters(created, data);
    next = { ...next, projects: [...next.projects, created] };
    openId = created.id;
    applied.push(`새 작업 "${created.name}"`);
  } else if (project) {
    next = patchItem(next, 'projects', project.id, (item) => ({
      ...item,
      presetId,
      characters: characterForProject
        ? [
            {
              ...item.characters[0],
              characterId: characterForProject.id,
              promptSetId: promptSetId ?? characterForProject.promptSets[0].id,
            },
            ...(moreSlots.length ? moreSlots : item.characters.slice(1)),
          ]
        : item.characters,
      emotionSetId: emotionSetId ?? item.emotionSetId,
      referenceId: referenceId ?? item.referenceId,
    }));
  }

  if (moreSlots.length && project && !choices.newProject)
    next = patchItem(next, 'projects', project.id, (item) => placeCharacters({ ...item }, data));
  return { library: next, applied, projectId: openId, referenceId: newReferenceId };
}

/** 위치를 직접 지정한 이미지이고 캐릭터 수가 맞을 때만. */
function placeCharacters(project: Project, data: ImageImportData): Project {
  const centers = data.characterCenters;
  if (!centers || centers.length !== project.characters.length) return project;
  project.positionMode = 'manual';
  project.characters = project.characters.map((slot, index) => ({
    ...slot,
    center: centers[index],
  }));
  return project;
}
