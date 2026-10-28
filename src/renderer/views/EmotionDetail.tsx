import { useEffect, useMemo, useState } from 'react';
import type { Emotion, GenerationRecord, GenerationSummary } from '../../core/domain/types';
import { isActive } from '../../core/jobs/JobLifecycle';
import { hasScenePrompt, img2imgMissing, type ResolvedProject } from '../../core/model/defaults';
import {
  comboCount,
  findCombo,
  recordedScenePrompts,
  sameScenePrompts,
} from '../../core/model/sceneCombos';
import { autoLineFixOn } from '../../core/model/lineFix';
import { autoRefineCount, generateCountLabel } from '../../core/model/refine';
import { supportsInpaint } from '../../core/providers/NaiModels';
import { generateEmotions, generateSceneImg2Img, type GenerateOptions } from '../actions';
import { Filmstrip } from '../components/Filmstrip';
import { PaletteButton } from '../components/FloatingPalette';
import { SidePanelLayout } from '../components/SidePanel';
import { ResultBar } from '../components/ResultActions';
import { showResultMenu, type ResultAction } from '../components/resultMenu';
import { useResultBrowser } from '../components/useResultBrowser';
import { Menu } from '../components/ui';
import { deleteEmotion, duplicateEmotionIn, patchEmotion } from '../emotionOps';
import { openDirectorToolDialog } from '../generationOps';
import { sendToFreeImg2Img, sendToSceneImg2Img, type ImageTarget } from '../freeImageOps';
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
import { fileApi, libraryApi } from '../desktop';
import { useSceneOrder } from '../useSceneOrder';
import { ScenePicker } from '../components/ScenePicker';
import { DetailSidePanel } from './detail/DetailSidePanel';
import { FreeSourceStage, InpaintModelBanner, ResultStage } from './free/FreeSourceStage';
import { FreeStageTabs, type FreeStage } from './free/FreeStageTabs';

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
  const lineFixCount = useStore((state) => state.library!.settings.lineFix.count);
  const allRecords = useStore((state) => state.generations[project.id]);
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

  const img2img = project.sceneImg2Img?.[emotion.id];
  const img2imgOn = Boolean(img2img?.on);
  const image = img2imgOn ? img2img?.image : undefined;
  const inpainting = img2imgOn && Boolean(img2img?.inpaint);
  const img2imgTarget = useMemo<ImageTarget>(
    () => ({ kind: 'scene', projectId: project.id, emotionId: emotion.id }),
    [project.id, emotion.id],
  );
  const [stage, setStage] = useState<FreeStage>('source');
  const drawing = img2imgOn && stage === 'draw';
  const showSource = Boolean(image) && stage === 'source';

  const browser = useResultBrowser(project.id, records, {
    preferredId: favoriteId,
    saveAs,
    onNewResult: () => setStage('result'),
    onRequested: () => setStage('result'),
    canDeleteShown: !showSource && !drawing,
  });
  const { selected, setSelectedId, picking } = browser;
  const { order, previous, next, title } = useSceneOrder(project.id, set.emotions, emotion.id);
  const sceneJobs = queue.jobs.filter(
    (job) => job.projectId === project.id && job.emotionId === emotion.id,
  );
  const pending = sceneJobs.filter((job) => isActive(job.status)).length;
  const running = sceneJobs.filter((job) => job.status === 'generating').map((job) => job.id);

  const pickedCount = picking.selected.size;

  const [selectedRecord, setSelectedRecord] = useState<GenerationRecord>();
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId) return;
    let current = true;
    libraryApi()
      .getGeneration(project.id, selectedId)
      .then(
        (record) => current && setSelectedRecord(record),
        () => undefined,
      );
    return () => {
      current = false;
    };
  }, [project.id, selectedId]);

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

  const inpaintModelMissing =
    inpainting && resolved.preset && !supportsInpaint(resolved.preset.generation.model);
  const canGenerate =
    hasScenePrompt(emotion) &&
    (img2imgOn
      ? !img2imgMissing(resolved.missing).length && Boolean(image) && !inpaintModelMissing
      : !resolved.missing.length);
  const generateWith = (options: GenerateOptions) =>
    void (img2imgOn
      ? generateSceneImg2Img(project.id, emotion.id, options)
      : generateEmotions(project.id, [emotion.id], options));
  const generate = () => generateWith({ variants });
  const images = variants * comboCount(emotion);
  const imagesLabel = generateCountLabel(
    images,
    autoRefineCount(images, project, resolved.preset, resolved.reference),
    autoLineFixOn(project) ? images * lineFixCount : 0,
  );

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
        onSelect: () => generateWith({ seed: record.seed, variants: 1, comboKey: record.comboKey }),
      },
      {
        label: '프롬프트 복원',
        icon: 'undo',
        group: 'main',
        keepLabel: true,
        fold: 6,
        // 고른 후보 내용은 요약에 없어, 보고 있는 결과만 미리 받아 비교한다.
        disabled:
          selectedRecord?.id === record.id &&
          sameScenePrompts(emotion, recordedScenePrompts(emotion, selectedRecord)),
        onSelect: () =>
          void run('프롬프트를 복원하는 중', async () => {
            const full = await libraryApi().getGeneration(project.id, record.id);
            patchEmotion(set.id, emotion.id, recordedScenePrompts(emotion, full));
          }),
      },
      common.refine,
      common.lineFix,
      {
        label: '디렉터 툴',
        icon: 'wand',
        group: 'send',
        keepLabel: true,
        fold: 4,
        onSelect: () => openDirectorToolDialog(project.id, [record]),
      },
      {
        label: '이 결과로 i2i',
        icon: 'i2i',
        group: 'send',
        keepLabel: true,
        fold: 7,
        onSelect: () =>
          void sendToSceneImg2Img(project.id, emotion.id, record).then(() => setStage('source')),
      },
      {
        label: '자유 생성으로 보내기',
        icon: 'sparkle',
        group: 'send',
        keepLabel: true,
        fold: 1,
        onSelect: () => void sendToFreeImg2Img(project.id, record),
      },
      common.makeReference,
      ...common.file,
    ];
  };

  const sidePanel = (
    <DetailSidePanel
      resolved={resolved}
      emotion={emotion}
      img2img={img2img}
      img2imgTarget={img2imgTarget}
      variants={variants}
      setVariants={setVariants}
      imagesLabel={imagesLabel}
      canGenerate={canGenerate}
      generate={generate}
    />
  );

  const resultStage = (
    <ResultStage
      src={selected && projectMedia(project.id, selected.file)}
      alt={emotion.name}
      filmstrip={records.length > 0}
      labelled={Boolean(image)}
      running={running}
      pending={pending}
      onContextMenu={selected && ((event) => showResultMenu(event, resultActions(selected)))}
    />
  );

  return (
    <div className="emotion-detail">
      {inpaintModelMissing && <InpaintModelBanner model={resolved.preset!.generation.model} />}
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
        <ScenePicker emotions={order} current={emotion.id} title={title} />
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
            label={`이 씬 ${imagesLabel}`}
            badge={images}
            disabled={!canGenerate}
            onClick={generate}
          />
        }
      >
        <section className="detail-stage">
          {img2imgOn && (
            <FreeStageTabs
              stage={stage}
              onStage={setStage}
              hasImage={Boolean(image)}
              source={{
                label: inpainting ? '마스크 칠하기' : 'i2i 이미지',
                icon: inpainting ? 'brush' : 'i2i',
              }}
              drawable
            />
          )}
          <FreeSourceStage
            target={img2imgTarget}
            image={image}
            drawing={drawing}
            showSource={showSource}
            inpainting={inpainting}
            sourceLabel="i2i 이미지"
            filmstrip={records.length > 0}
            preset={resolved.preset}
            result={resultStage}
          />
          {!showSource && !drawing && selected && (
            <ResultBar projectId={project.id} record={selected} actions={resultActions(selected)} />
          )}
          <Filmstrip
            projectId={project.id}
            records={records}
            browser={browser}
            menu={resultActions}
            favoriteId={favoriteId}
            onOpen={() => setStage('result')}
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
