import type { Emotion, SceneImg2Img } from '../../../core/domain/types';
import { scenePosition } from '../../../core/jobs/JobBuilder';
import { hasScenePrompt, type ResolvedProject } from '../../../core/model/defaults';
import { setEmotionsExcluded } from '../../../core/model/mutations';
import { comboCount } from '../../../core/model/sceneCombos';
import { hasMarker } from '../../../core/prompts/PromptComposer';
import { usesMedium } from '../../../core/providers/NaiModels';
import { Icon } from '../../components/Icon';
import { AutoRefineToggle } from '../../components/RefineChip';
import { ScenePromptFields } from '../../components/ScenePromptFields';
import { SceneExtras } from '../../components/SceneExtras';
import { SceneSlotsEditor } from '../../components/SceneSlotsEditor';
import { NumberField } from '../../components/ui';
import { patchEmotion } from '../../emotionOps';
import { updateImageTarget, type ImageTarget } from '../../freeImageOps';
import { projectRefineTarget } from '../../refineTargets';
import { setDetailSideView, updateProject, useStore } from '../../store';
import { FreeImagePanel } from '../free/FreeImagePanel';

export function DetailSidePanel({
  resolved,
  emotion,
  img2img,
  img2imgTarget,
  variants,
  setVariants,
  imagesLabel,
  canGenerate,
  generate,
}: {
  resolved: ResolvedProject;
  emotion: Emotion;
  img2img?: SceneImg2Img;
  img2imgTarget: ImageTarget;
  variants: number;
  setVariants: (value: number) => void;
  /** 생성 수 × 조합 수, 자동 다듬기 장수 */
  imagesLabel: string;
  canGenerate: boolean;
  generate: () => void;
}) {
  const { project } = resolved;
  const set = resolved.emotionSet!;
  const sharedCount = useStore(
    (state) => state.library!.projects.filter((item) => item.emotionSetId === set.id).length,
  );
  const sideView = useStore((state) => state.detailSideView);
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

  const img2imgOn = Boolean(img2img?.on);
  const txt2img = project.mode === 'txt2img';

  return (
    <>
      <div className="segmented full free-source-mode" role="group" aria-label="생성 방식">
        <button
          className={img2imgOn ? '' : 'active'}
          aria-pressed={!img2imgOn}
          onClick={() => updateImageTarget(img2imgTarget, { on: false })}
        >
          <Icon name={txt2img ? 'sparkle' : 'reference'} size={14} />
          {txt2img ? '일반 생성' : '인페인트'}
        </button>
        <button
          className={img2imgOn ? 'active' : ''}
          aria-pressed={img2imgOn}
          onClick={() => updateImageTarget(img2imgTarget, { on: true })}
        >
          <Icon name="i2i" size={14} /> i2i
        </button>
      </div>
      {img2img?.on && (
        <FreeImagePanel
          target={img2imgTarget}
          image={img2img.image}
          inpaint={img2img.inpaint}
          preset={resolved.preset}
        />
      )}
      <label className="stack-field">
        씬 이름
        <input value={emotion.name} onChange={(event) => patch({ name: event.target.value })} />
      </label>
      <div className="segmented full" role="group" aria-label="편집할 프롬프트">
        <button
          className={sideView === 'scene' ? 'active' : ''}
          onClick={() => setDetailSideView('scene')}
        >
          씬 프롬프트
        </button>
        <button
          className={sideView === 'combos' ? 'active blue' : ''}
          onClick={() => setDetailSideView('combos')}
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
                : hasMarker(
                      `${resolved.preset?.commonPositive ?? ''}, ${project.extraPrompt ?? ''}`,
                    )
                  ? '상위 프롬프트의 | 자리에 들어갑니다'
                  : '상위와 하위 프롬프트 사이에 들어갑니다'
            }
            negativePlacement={`${sceneSide ?? '공통'} 네거티브 뒤에 붙습니다`}
            negativeHint={
              resolved.preset && usesMedium(resolved.preset.generation)
                ? 'Medium에서는 쓰이지 않음'
                : undefined
            }
            onChange={patch}
          />
          <SceneExtras emotion={emotion} txt2img={txt2img && !img2imgOn} onChange={patch} />
        </>
      ) : (
        <SceneSlotsEditor
          emotion={emotion}
          names={names}
          firstOnCommon={!sceneSide}
          onChange={patch}
        />
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
        <AutoRefineToggle target={projectRefineTarget(resolved)} />
        <NumberField
          label="생성 수"
          value={variants}
          min={1}
          max={20}
          integer
          onChange={setVariants}
        />
        <button className="generate-button" disabled={!canGenerate} onClick={generate}>
          ▶ {imagesLabel}
        </button>
      </div>
    </>
  );
}
