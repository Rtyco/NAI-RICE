import { useState } from 'react';
import type { Emotion } from '../../../core/domain/types';
import { scenePosition } from '../../../core/jobs/JobBuilder';
import { hasScenePrompt, type ResolvedProject } from '../../../core/model/defaults';
import { setEmotionsExcluded } from '../../../core/model/mutations';
import { comboCount } from '../../../core/model/sceneCombos';
import { usesMedium } from '../../../core/providers/NaiModels';
import { ScenePromptFields } from '../../components/ScenePromptFields';
import { SceneExtras, SceneSlotsEditor } from '../../components/SceneSlotsEditor';
import { NumberField } from '../../components/ui';
import { patchEmotion } from '../../emotionOps';
import { updateProject, useStore } from '../../store';

type SideView = 'scene' | 'combos';
// 씬을 넘겨도 보던 쪽을 유지한다(이번 실행 동안).
let lastSideView: SideView = 'scene';

export function DetailSidePanel({
  resolved,
  emotion,
  variants,
  setVariants,
  images,
  canGenerate,
  generate,
}: {
  resolved: ResolvedProject;
  emotion: Emotion;
  variants: number;
  setVariants: (value: number) => void;
  /** 생성 수 × 조합 수 */
  images: number;
  canGenerate: boolean;
  generate: () => void;
}) {
  const { project } = resolved;
  const set = resolved.emotionSet!;
  const sharedCount = useStore(
    (state) => state.library!.projects.filter((item) => item.emotionSetId === set.id).length,
  );
  const [sideView, setSideView] = useState(lastSideView);
  const showSide = (view: SideView) => {
    lastSideView = view;
    setSideView(view);
  };
  const onCharacter =
    resolved.preset &&
    scenePosition(resolved.preset.generation.emotionPosition, resolved.characters.length) ===
      'character-end';
  const sceneSide = !onCharacter
    ? undefined
    : resolved.characters.length > 1
      ? '첫 캐릭터'
      : '캐릭터';
  const names = resolved.characters.map((item) => item.character.name);
  const excluded = project.excludedEmotionIds.includes(emotion.id);
  const patch = (value: Partial<Omit<Emotion, 'id'>>) => patchEmotion(set.id, emotion.id, value);

  return (
    <>
      <label className="stack-field">
        씬 이름
        <input value={emotion.name} onChange={(event) => patch({ name: event.target.value })} />
      </label>
      <div className="segmented full" role="group" aria-label="편집할 프롬프트">
        <button className={sideView === 'scene' ? 'active' : ''} onClick={() => showSide('scene')}>
          씬 프롬프트
        </button>
        <button
          className={sideView === 'combos' ? 'active blue' : ''}
          onClick={() => showSide('combos')}
        >
          조합 프롬프트{emotion.slots?.length ? ` · ${comboCount(emotion)}` : ''}
        </button>
      </div>
      {sideView === 'scene' ? (
        <>
          <ScenePromptFields
            emotion={emotion}
            names={names}
            firstOnCommon={!sceneSide}
            firstPlacement={
              sceneSide
                ? `${sceneSide} 프롬프트 뒤에 붙습니다`
                : resolved.preset?.generation.emotionPosition === 'common-marker'
                  ? '공통 포지티브의 | 자리에 들어갑니다'
                  : '공통 포지티브 뒤에 붙습니다'
            }
            negativePlacement={`${sceneSide ?? '공통'} 네거티브 뒤에 붙습니다`}
            negativeHint={
              resolved.preset && usesMedium(resolved.preset.generation)
                ? 'Medium에서는 쓰이지 않음'
                : undefined
            }
            onChange={patch}
          />
          <SceneExtras emotion={emotion} txt2img={project.mode === 'txt2img'} onChange={patch} />
        </>
      ) : (
        <SceneSlotsEditor emotion={emotion} names={names} onChange={patch} />
      )}
      {sharedCount > 1 && (
        <p className="hint">다른 작업 {sharedCount - 1}개에도 함께 반영됩니다.</p>
      )}
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={!excluded}
          disabled={!hasScenePrompt(emotion)}
          onChange={(event) =>
            updateProject(project.id, (current) =>
              setEmotionsExcluded(current, [emotion.id], !event.target.checked),
            )
          }
        />
        <span>일괄 생성에 포함 (이 작업만)</span>
      </label>

      <div className="generate-dock">
        <NumberField
          label="생성 수"
          value={variants}
          min={1}
          max={20}
          integer
          onChange={setVariants}
        />
        <button className="generate-button" disabled={!canGenerate} onClick={generate}>
          ▶ {images}장 생성
        </button>
      </div>
    </>
  );
}
