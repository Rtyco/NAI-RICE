import { useEffect, useMemo, useState } from 'react';
import type { Emotion, GenerationSummary } from '../../core/domain/types';
import { scenePosition } from '../../core/jobs/JobBuilder';
import { isActive } from '../../core/jobs/JobLifecycle';
import { hasScenePrompt, type ResolvedProject } from '../../core/model/defaults';
import { comboCount, findCombo } from '../../core/model/sceneCombos';
import { SceneSlotsEditor } from '../components/SceneSlotsEditor';
import { usesMedium } from '../../core/providers/NaiModels';
import { generateEmotions } from '../actions';
import { ImageStage } from '../components/ImageStage';
import { StreamPreview } from '../components/StreamPreview';
import { Filmstrip } from '../components/Filmstrip';
import { PaletteButton } from '../components/FloatingPalette';
import { SidePanelLayout } from '../components/SidePanel';
import { ResultBar } from '../components/ResultActions';
import { showResultMenu, type ResultAction } from '../components/resultMenu';
import { useResultBrowser } from '../components/useResultBrowser';
import { Menu, NumberField } from '../components/ui';
import { deleteEmotion, duplicateEmotionIn, patchEmotion } from '../emotionOps';
import { openDirectorToolDialog } from '../generationOps';
import { sendToFreeImg2Img } from '../freeImageOps';
import {
  emotionRecords,
  openEmotion,
  projectMedia,
  run,
  toast,
  updateProject,
  useStore,
} from '../store';
import { commonResultActions } from '../resultActions';
import { topBarShownOf, useLayout } from '../layout';
import { fileApi } from '../desktop';
import { ScenePromptFields } from '../components/ScenePromptFields';

export function EmotionDetail({
  resolved,
  emotion,
}: {
  resolved: ResolvedProject;
  emotion: Emotion;
}) {
  const { project } = resolved;
  const set = resolved.emotionSet!;
  const exportQuality = useStore((state) => state.library!.settings.export.quality);
  const sharedCount = useStore(
    (state) => state.library!.projects.filter((item) => item.emotionSetId === set.id).length,
  );
  const allRecords = useStore((state) => state.generations[project.id]);
  const onCharacter =
    resolved.preset &&
    scenePosition(resolved.preset.generation.emotionPosition, resolved.characters.length) ===
      'character-end';
  const sceneSide = !onCharacter
    ? undefined
    : resolved.characters.length > 1
      ? '첫 캐릭터'
      : '캐릭터';
  const queue = useStore((state) => state.queue);
  const records = useMemo(() => emotionRecords(allRecords, emotion.id), [allRecords, emotion.id]);
  const [variants, setVariants] = useState(resolved.preset?.generation.variantsPerEmotion ?? 1);
  const topShown = useLayout(topBarShownOf);
  const favoriteId = project.favorites[emotion.id];
  const saveAs = (record: GenerationSummary) =>
    void run('이미지를 저장하는 중', async () => {
      const saved = await fileApi().saveImageAs(project.id, record.id, emotion.name, exportQuality);
      if (saved) toast(`저장했습니다: ${saved}`);
    });

  const browser = useResultBrowser(project.id, records, { preferredId: favoriteId, saveAs });
  const { selected, setSelectedId, picking } = browser;
  const index = set.emotions.findIndex((item) => item.id === emotion.id);
  const previous = set.emotions[index - 1];
  const next = set.emotions[index + 1];
  const excluded = project.excludedEmotionIds.includes(emotion.id);
  const sceneJobs = queue.jobs.filter(
    (job) => job.projectId === project.id && job.emotionId === emotion.id,
  );
  const pending = sceneJobs.filter((job) => isActive(job.status)).length;
  const running = sceneJobs.filter((job) => job.status === 'generating').map((job) => job.id);

  const pickedCount = picking.selected.size;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select')) return;
      // 여러 장을 고른 동안의 Esc는 useBoxSelection이 처리한다.
      if (event.key === 'Escape' && !pickedCount) openEmotion(undefined);
      const plain = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
      const dialogOpen = Boolean(document.querySelector('.modal-backdrop'));
      if (plain && event.key.toLowerCase() === 'f' && selected && !dialogOpen)
        setFavorite(favoriteId === selected.id ? undefined : selected.id);
      if (event.key === 'PageDown' && next) openEmotion(next.id);
      if (event.key === 'PageUp' && previous) openEmotion(previous.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const canGenerate = hasScenePrompt(emotion) && !resolved.missing.length;
  const generate = () => void generateEmotions(project.id, [emotion.id], { variants });

  const setFavorite = (generationId?: string) =>
    updateProject(project.id, (current) => {
      const favorites = { ...current.favorites };
      if (generationId) favorites[emotion.id] = generationId;
      else delete favorites[emotion.id];
      return { ...current, favorites };
    });

  const resultActions = (record: GenerationSummary): ResultAction[] => {
    const common = commonResultActions(project.id, record, {
      records,
      saveAs,
      show: setSelectedId,
    });
    return [
      {
        label: favoriteId === record.id ? '대표 해제' : '대표로 지정',
        title: `${favoriteId === record.id ? '대표 해제' : '대표로 지정'} (F)`,
        icon: 'star',
        group: 'main',
        active: favoriteId === record.id,
        onSelect: () => setFavorite(favoriteId === record.id ? undefined : record.id),
      },
      {
        label: '이 seed로 다시',
        icon: 'refresh',
        group: 'main',
        title: '현재 프롬프트와 이 결과의 seed로 다시 생성',
        disabled: record.comboKey !== undefined && !findCombo(emotion, record.comboKey),
        onSelect: () =>
          void generateEmotions(project.id, [emotion.id], {
            seed: record.seed,
            variants: 1,
            comboKey: record.comboKey,
          }),
      },
      {
        label: '프롬프트 복원',
        icon: 'undo',
        group: 'main',
        disabled:
          record.emotionPrompt === emotion.prompt &&
          (record.emotionNegative ?? '') === (emotion.negative ?? ''),
        onSelect: () =>
          patchEmotion(set.id, emotion.id, {
            prompt: record.emotionPrompt,
            negative: record.emotionNegative,
          }),
      },
      common.refine,
      {
        label: '디렉터 툴',
        icon: 'wand',
        group: 'send',
        onSelect: () => openDirectorToolDialog(project.id, [record]),
      },
      {
        label: '자유 생성으로 보내기',
        icon: 'sparkle',
        group: 'send',
        onSelect: () => void sendToFreeImg2Img(project.id, record),
      },
      common.makeReference,
      ...common.file,
    ];
  };

  const sidePanel = (
    <>
      <label className="stack-field">
        씬 이름
        <input
          value={emotion.name}
          onChange={(event) => patchEmotion(set.id, emotion.id, { name: event.target.value })}
        />
      </label>
      <ScenePromptFields
        emotion={emotion}
        names={resolved.characters.map((item) => item.character.name)}
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
        onChange={(patch) => patchEmotion(set.id, emotion.id, patch)}
      />
      <SceneSlotsEditor
        emotion={emotion}
        names={resolved.characters.map((item) => item.character.name)}
        onChange={(patch) => patchEmotion(set.id, emotion.id, patch)}
      />
      {sharedCount > 1 && (
        <p className="hint">다른 작업 {sharedCount - 1}개에도 함께 반영됩니다.</p>
      )}
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={!excluded}
          disabled={!hasScenePrompt(emotion)}
          onChange={(event) =>
            updateProject(project.id, (current) => ({
              ...current,
              excludedEmotionIds: event.target.checked
                ? current.excludedEmotionIds.filter((id) => id !== emotion.id)
                : [...current.excludedEmotionIds, emotion.id],
            }))
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
          ▶ {variants * comboCount(emotion)}장 생성
        </button>
      </div>
    </>
  );

  return (
    <div className="emotion-detail">
      <div className={`detail-nav ${topShown ? '' : 'top-hidden'}`}>
        <button onClick={() => openEmotion(undefined)}>← 갤러리</button>
        {/* 결과 막대의 결과 삭제와 헷갈리지 않게 메뉴 안에 둔다. */}
        <Menu
          label="씬 ⋯"
          align="left"
          items={[
            {
              label: '씬 복제',
              onSelect: () => {
                const copy = duplicateEmotionIn(set.id, emotion.id);
                if (copy) openEmotion(copy);
              },
            },
            'divider',
            {
              label: '씬 삭제',
              danger: true,
              onSelect: () => void deleteEmotion(set.id, emotion, project.id),
            },
          ]}
        />
        <div className="header-spacer" />
        <button
          disabled={!previous}
          onClick={() => previous && openEmotion(previous.id)}
          title="PageUp"
        >
          ‹ {previous?.name ?? '이전'}
        </button>
        <span className="detail-position">
          {index + 1} / {set.emotions.length}
        </span>
        <button disabled={!next} onClick={() => next && openEmotion(next.id)} title="PageDown">
          {next?.name ?? '다음'} ›
        </button>
      </div>

      <SidePanelLayout
        className="detail-body"
        panelClassName="detail-side"
        panel={sidePanel}
        palette={
          <PaletteButton
            className="generate-button"
            icon="play"
            label={`이 씬 ${variants}장 생성`}
            badge={variants}
            disabled={!canGenerate}
            onClick={generate}
          />
        }
      >
        <section className="detail-stage">
          <ImageStage
            src={selected && projectMedia(project.id, selected.file)}
            alt={emotion.name}
            filmstrip={records.length > 0}
            empty={
              <div className="stage-empty">
                <p>아직 생성된 이미지가 없습니다.</p>
              </div>
            }
            overlay={
              <>
                <StreamPreview jobIds={running} className="stage-preview" />
                {pending > 0 && (
                  <span className="card-status busy stage-status">생성 대기 {pending}</span>
                )}
              </>
            }
            onContextMenu={selected && ((event) => showResultMenu(event, resultActions(selected)))}
          />
          {selected && (
            <ResultBar projectId={project.id} record={selected} actions={resultActions(selected)} />
          )}
          <Filmstrip
            projectId={project.id}
            records={records}
            browser={browser}
            menu={resultActions}
            favoriteId={favoriteId}
            tools={
              <>
                <div className="header-spacer" />
                <button
                  className="link-button"
                  onClick={() =>
                    picking.selectAll(
                      records
                        .filter((record) => record.id !== favoriteId)
                        .map((record) => record.id),
                    )
                  }
                >
                  대표 빼고 모두 선택
                </button>
              </>
            }
          />
        </section>
      </SidePanelLayout>
    </div>
  );
}
