import type { GenerationRecord, GenerationSettings } from '../domain/types';
import type { ImageImportData } from '../metadata/NaiMetadata';

/** SD Studio 백업(tar)에서 결과가 든 곳: `outs/<씬 이름>/<파일>`. 인페인트 씬(`inpaints/`)은 가져오지 않는다. */
export function sdStudioResultPath(entry: string): { scene: string; file: string } | undefined {
  const match = /^outs\/([^/]+)\/([^/]+\.(?:png|webp))$/i.exec(entry);
  return match ? { scene: match[1], file: match[2] } : undefined;
}

/** 씬 이름 → 대표 이미지 파일 이름(첫 번째만). */
export function sdStudioMains(project: unknown): Record<string, string> {
  const scenes = (project as { scenes?: Record<string, { mains?: unknown }> })?.scenes ?? {};
  return Object.fromEntries(
    Object.entries(scenes).flatMap(([name, scene]) => {
      const main = Array.isArray(scene?.mains) ? scene.mains[0] : undefined;
      return typeof main === 'string' ? [[name, main]] : [];
    }),
  );
}

export type SDStudioResultContext = Pick<
  GenerationRecord,
  | 'id'
  | 'projectId'
  | 'emotionId'
  | 'emotionName'
  | 'createdAt'
  | 'file'
  | 'thumbFile'
  | 'width'
  | 'height'
  | 'presetName'
  | 'characterName'
  | 'emotionSetName'
> & {
  /** 메타데이터에 없는 값은 이 설정을 따른다. */
  settings: GenerationSettings;
};

/** 생성 정보가 없는 그림도 결과로 들인다(프롬프트는 빈 값). SD Studio는 씬 프롬프트를 따로 남기지 않는다. */
export function sdStudioRecord(
  data: ImageImportData | null,
  context: SDStudioResultContext,
): GenerationRecord {
  const { settings, ...record } = context;
  const [first, ...rest] = data?.characters ?? [];
  return {
    ...record,
    kind: 'txt2img',
    seed: data?.seed ?? 0,
    variantIndex: 1,
    promptSetName: '',
    referenceName: '',
    prompt: data?.commonPositive ?? '',
    negativePrompt: data?.commonNegative ?? '',
    characterPrompt: first?.positive ?? '',
    characterNegativePrompt: first?.negative ?? '',
    ...(rest.length
      ? {
          extraCharacters: rest.map((character, index) => ({
            name: `캐릭터 ${index + 2}`,
            prompt: character.positive,
            negative: character.negative,
          })),
        }
      : {}),
    ...(data?.characterCenters ? { characterCenters: data.characterCenters } : {}),
    emotionPrompt: '',
    settings: {
      ...settings,
      ...data?.settings,
      width: context.width,
      height: context.height,
    },
  };
}
