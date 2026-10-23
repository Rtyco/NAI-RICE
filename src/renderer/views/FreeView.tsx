import { useMemo, useState } from 'react';
import type { GenerationSummary } from '../../core/domain/types';
import { isActive } from '../../core/jobs/JobLifecycle';
import {
  DEFAULT_GENERATION_SETTINGS,
  effectiveGenerationSettings,
  FREE_PROJECT_ID,
  projectAid,
} from '../../core/model/defaults';
import { DEFAULT_AUGMENT_SETTINGS } from '../../core/providers/NaiAugment';
import { estimateJobAnlas, generationCostWarnings } from '../../core/providers/NaiCost';
import {
  maxCharactersFor,
  modelLabel,
  noInpaintReason,
  supportsInpaint,
} from '../../core/providers/NaiModels';
import { directorToolSize, generateFree, runFreeDirectorTool } from '../actions';
import { AccountMeter } from '../components/AccountMeter';
import { AidChip } from '../components/AidChip';
import { CharacterChip } from '../components/CharacterChip';
import { PositionChip } from '../components/CharacterPositions';
import { ChecklistChip, SizeChip } from '../components/ChainChip';
import { BgRemovalWarning, DirectorToolFields } from '../components/DirectorToolFields';
import { Filmstrip } from '../components/Filmstrip';
import { HistoryToggle } from '../components/HistoryPanel';
import { PaletteButton } from '../components/FloatingPalette';
import { SidePanelLayout, SidePanelToggle } from '../components/SidePanel';
import { TopBarToggle } from '../components/TopBarToggle';
import { PromptPanelToggle } from '../components/PromptPanel';
import { ResultBar } from '../components/ResultActions';
import { showResultMenu, type ResultAction } from '../components/resultMenu';
import { Icon } from '../components/Icon';
import { StreamPreview } from '../components/StreamPreview';
import { ImageStage } from '../components/ImageStage';
import { NumberField, Toggle } from '../components/ui';
import { useResultBrowser } from '../components/useResultBrowser';
import { fileApi, libraryApi } from '../desktop';
import {
  loadFreeImageFromFile,
  newBlankFreeImage,
  sendToFreeDirector,
  sendToFreeImg2Img,
  sourceMedia,
} from '../freeImageOps';
import {
  projectMedia,
  resolveFreeGeneration,
  run,
  toast,
  updateFreeGeneration,
  useLibrary,
  useStore,
} from '../store';
import { commonResultActions } from '../resultActions';
import { topBarShownOf, useLayout } from '../layout';
import { FreeDrawStage } from './free/FreeDrawStage';
import { FreeImagePanel } from './free/FreeImagePanel';
import { FreeMaskCanvas } from './free/FreeMaskCanvas';
import { FreeModeSwitch } from './free/FreeModeSwitch';
import { FreePromptFields } from './free/FreePromptFields';

const NO_RECORDS: GenerationSummary[] = [];

/** 결과는 `projects/free/`에 쌓인다. */
export function FreeView() {
  const library = useLibrary();
  const { free, preset, promptSet } = resolveFreeGeneration(library);
  const director = free.mode === 'augment';
  const augment = free.augment ?? DEFAULT_AUGMENT_SETTINGS;
  const image = free.mode === 'txt2img' ? undefined : free.image;
  const [shrink, setShrink] = useState(true);
  const allRecords = useStore((state) => state.generations[FREE_PROJECT_ID]) ?? NO_RECORDS;
  const queue = useStore((state) => state.queue);
  const token = useStore((state) => state.token);
  const busy = useStore((state) => state.busy);
  const topShown = useLayout(topBarShownOf);
  const records = useMemo(
    () => [...allRecords].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [allRecords],
  );
  const [stage, setStage] = useState<'source' | 'draw' | 'result'>('source');
  const drawing = free.mode === 'img2img' && stage === 'draw';
  const showSource = Boolean(image) && stage === 'source';
  const saveAs = (record: GenerationSummary) =>
    void run('이미지를 저장하는 중', async () => {
      const saved = await fileApi().saveImageAs(
        FREE_PROJECT_ID,
        record.id,
        `자유 생성 ${record.seed}`,
        library.settings.export.quality,
      );
      if (saved) toast(`저장했습니다: ${saved}`);
    });

  const browser = useResultBrowser(FREE_PROJECT_ID, records, {
    onNewResult: () => setStage('result'),
    onRequested: () => setStage('result'),
    saveAs,
    canDeleteShown: !showSource && !drawing,
  });
  const { selected, setSelectedId } = browser;
  const pending = queue.jobs.filter(
    (job) => job.projectId === FREE_PROJECT_ID && isActive(job.status),
  ).length;
  const running = queue.jobs
    .filter((job) => job.projectId === FREE_PROJECT_ID && job.status === 'generating')
    .map((job) => job.id);

  const inpainting = free.mode === 'img2img' && free.inpaint;
  const generation = preset && effectiveGenerationSettings(preset.generation);
  const directorSize = image && directorToolSize(image.outputRect, shrink);
  const oversized = Boolean(
    image && image.outputRect.width * image.outputRect.height > 1024 * 1024,
  );
  const costJob = director
    ? directorSize && {
        kind: 'augment' as const,
        tool: augment.tool,
        settings: DEFAULT_GENERATION_SETTINGS,
        canvasWidth: directorSize.width,
        canvasHeight: directorSize.height,
      }
    : generation && {
        kind: inpainting ? ('inpaint' as const) : free.mode,
        strength: generation.img2imgStrength,
        settings: generation,
        canvasWidth: image?.width ?? generation.width,
        canvasHeight: image?.height ?? generation.height,
        aid: projectAid(library, free),
      };
  const runs = director ? augment.count : free.count;
  const sourceLabel = director ? '디렉터 툴 이미지' : 'i2i 이미지';
  const estimate = costJob ? estimateJobAnlas(costJob, token) * runs : undefined;
  const costReasons = costJob ? generationCostWarnings([costJob], token) : [];
  const inpaintModelMissing = inpainting && preset && !supportsInpaint(preset.generation.model);
  const canGenerate = director
    ? Boolean(image)
    : Boolean(preset) && (free.mode === 'txt2img' || (Boolean(image) && !inpaintModelMissing));
  const generateLabel = director ? `${runs}번 적용` : `${free.count}장 생성`;
  const generate = () => void (director ? runFreeDirectorTool(shrink) : generateFree());

  // 디렉터 툴 결과에는 프롬프트와 seed가 없다.
  const promptActions = (record: GenerationSummary): ResultAction[] =>
    record.kind === 'augment'
      ? []
      : [
          {
            label: '이 seed로 다시',
            icon: 'refresh',
            group: 'main',
            title: '현재 프롬프트와 이 결과의 seed로 다시 생성',
            onSelect: () => void generateFree({ seed: record.seed, count: 1 }),
          },
          {
            label: '프롬프트 복원',
            icon: 'undo',
            group: 'main',
            disabled:
              record.emotionPrompt === free.prompt &&
              (record.emotionNegative ?? '') === free.negative,
            onSelect: () =>
              updateFreeGeneration({
                prompt: record.emotionPrompt,
                negative: record.emotionNegative ?? '',
              }),
          },
        ];

  const resultActions = (record: GenerationSummary): ResultAction[] => {
    const common = commonResultActions(FREE_PROJECT_ID, record, {
      records,
      saveAs,
      show: setSelectedId,
    });
    return [
      ...promptActions(record),
      common.refine,
      {
        label: '이 결과로 디렉터 툴',
        icon: 'wand',
        group: 'send',
        onSelect: () =>
          void sendToFreeDirector(FREE_PROJECT_ID, record).then(() => setStage('source')),
      },
      {
        label: '이 결과로 i2i',
        icon: 'sparkle',
        group: 'send',
        onSelect: () =>
          void sendToFreeImg2Img(FREE_PROJECT_ID, record).then(() => setStage('source')),
      },
      common.makeReference,
      ...common.file,
    ];
  };

  const resultStage = (
    <ImageStage
      src={selected && projectMedia(FREE_PROJECT_ID, selected.file)}
      filmstrip={records.length > 0}
      empty={
        <div className="stage-empty">
          <p>아직 생성된 이미지가 없습니다.</p>
        </div>
      }
      overlay={
        <>
          <StreamPreview jobIds={running} className="stage-preview" />
          {image && <span className="stage-label">결과</span>}
          {pending > 0 && (
            <span className="card-status busy stage-status">생성 대기 {pending}</span>
          )}
        </>
      }
      onContextMenu={selected && ((event) => showResultMenu(event, resultActions(selected)))}
    />
  );

  const sidePanel = (
    <>
      {free.mode !== 'txt2img' && <FreeImagePanel free={free} preset={preset} />}
      {director ? (
        <section className="detail-card">
          <div className="detail-card-head">
            <b>디렉터 툴</b>
          </div>
          <DirectorToolFields
            value={augment}
            onChange={(patch) => updateFreeGeneration({ augment: { ...augment, ...patch } })}
          />
          {oversized && (
            <Toggle
              label="무료 면적(1024×1024)을 넘으니 비율을 지켜 줄여 보내기"
              checked={shrink}
              onChange={setShrink}
            />
          )}
          {augment.tool === 'bg-removal' && <BgRemovalWarning results={augment.count * 3} />}
        </section>
      ) : (
        <FreePromptFields
          free={free}
          preset={preset}
          firstCharacterPositive={promptSet?.positive}
        />
      )}

      <div className="generate-dock">
        {!director && (
          <NumberField
            label="장수"
            value={free.count}
            min={1}
            max={20}
            integer
            onChange={(count) => updateFreeGeneration({ count })}
          />
        )}
        <button
          className="generate-button"
          disabled={!canGenerate || Boolean(busy)}
          onClick={generate}
        >
          ▶ {generateLabel}
        </button>
        {estimate !== undefined && (
          <p
            className="hint"
            title={[...costReasons, '예상값이며 실제 차감량과 다를 수 있습니다.'].join('\n')}
          >
            {estimate ? `예상 약 ${estimate.toLocaleString()} Anlas` : '예상 0 Anlas'}
          </p>
        )}
      </div>
    </>
  );

  // 접으면 같은 칩들을 화면 머리줄 안에 작게 둔다.
  const chainBar = (
    <div className={`chain-bar ${topShown ? '' : 'compact'}`}>
      <ChecklistChip
        section="presets"
        itemId={preset?.id}
        missing={!preset}
        value={preset?.name ?? '(없음)'}
        items={library.presets}
        checked={preset ? [preset.id] : []}
        onPick={(presetId) => updateFreeGeneration({ presetId })}
        editSection="presets"
      />
      <CharacterChip
        slots={free.characters}
        optional
        max={maxCharactersFor(preset?.generation.model)}
        onChange={(characters) => updateFreeGeneration({ characters })}
      />
      <PositionChip target="free" />
      {preset && free.mode === 'txt2img' && <SizeChip preset={preset} />}
      <AidChip
        value={free}
        onChange={updateFreeGeneration}
        model={preset?.generation.model}
        inpaint={free.mode === 'img2img' && free.inpaint}
      />
      <TopBarToggle collapsed={!topShown} />
    </div>
  );

  return (
    <section className="project-view">
      <header className="project-header">
        <PromptPanelToggle />
        <h1 className="free-title">자유 생성</h1>
        <FreeModeSwitch mode={free.mode} />
        {!director && !topShown && chainBar}
        <div className="header-spacer" />
        <AccountMeter />
        <button
          className="with-icon"
          title="자유 생성 결과 폴더 열기"
          onClick={() =>
            void run('폴더를 여는 중', () =>
              libraryApi().openInExplorer({ kind: 'outputs', projectId: FREE_PROJECT_ID }),
            )
          }
        >
          <Icon name="folder" size={14} /> <span className="header-label">폴더</span>
        </button>
        <SidePanelToggle />
        <HistoryToggle />
      </header>
      {!director && topShown && chainBar}
      {inpaintModelMissing && (
        <div className="missing-banner">
          ⚠{' '}
          {[
            `${modelLabel(preset.generation.model)}는 인페인팅을 지원하지 않습니다.`,
            noInpaintReason(preset.generation.model),
            '생성 설정에서 모델을 바꾸거나 「전체 다시 그리기」로 바꾸십시오.',
          ]
            .filter(Boolean)
            .join(' ')}
        </div>
      )}

      <div className="project-body animate-in">
        <div className="emotion-detail">
          <SidePanelLayout
            className="detail-body"
            panelClassName="detail-side"
            panel={sidePanel}
            palette={
              <PaletteButton
                className="generate-button"
                icon={director ? 'wand' : 'play'}
                label={generateLabel}
                badge={runs}
                disabled={!canGenerate || Boolean(busy)}
                onClick={generate}
              />
            }
          >
            <section className="detail-stage">
              {(image || free.mode === 'img2img') && (
                <div className="segmented stage-tabs" role="group" aria-label="왼쪽에 보일 것">
                  {image && (
                    <button
                      className={stage === 'source' ? 'active' : ''}
                      aria-pressed={stage === 'source'}
                      onClick={() => setStage('source')}
                    >
                      <Icon
                        name={inpainting ? 'brush' : director ? 'wand' : 'reference'}
                        size={14}
                      />
                      {inpainting ? '마스크 칠하기' : sourceLabel}
                    </button>
                  )}
                  {free.mode === 'img2img' && (
                    <button
                      className={stage === 'draw' ? 'active' : ''}
                      aria-pressed={stage === 'draw'}
                      onClick={() => setStage('draw')}
                    >
                      <Icon name="pen" size={14} /> 그리기
                    </button>
                  )}
                  <button
                    className={stage === 'result' || (!image && stage === 'source') ? 'active' : ''}
                    aria-pressed={stage === 'result'}
                    onClick={() => setStage('result')}
                  >
                    <Icon name="images" size={14} /> {image ? '원본과 결과' : '결과'}
                  </button>
                </div>
              )}
              {drawing ? (
                <div className="free-mask-stage">
                  {image ? (
                    <FreeDrawStage key={image.file} image={image} />
                  ) : (
                    <div className="stage-empty">
                      <p>그릴 이미지가 없습니다.</p>
                      <div className="stage-empty-actions">
                        <button
                          className="accent"
                          onClick={() =>
                            void newBlankFreeImage(
                              preset?.generation.width ?? 832,
                              preset?.generation.height ?? 1216,
                            )
                          }
                        >
                          빈 캔버스 만들기 ({preset?.generation.width ?? 832}×
                          {preset?.generation.height ?? 1216})
                        </button>
                        <button onClick={() => void loadFreeImageFromFile()}>
                          파일에서 불러오기
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : showSource && image ? (
                inpainting ? (
                  <div className="free-mask-stage">
                    <FreeMaskCanvas key={image.file} image={image} />
                  </div>
                ) : (
                  <ImageStage src={sourceMedia(image.file)} filmstrip={records.length > 0} />
                )
              ) : image ? (
                <div className="compare-stage">
                  <ImageStage
                    src={sourceMedia(image.file)}
                    alt={sourceLabel}
                    overlay={<span className="stage-label">{sourceLabel}</span>}
                  />
                  {resultStage}
                </div>
              ) : (
                resultStage
              )}
              {!showSource && !drawing && selected && (
                <ResultBar
                  projectId={FREE_PROJECT_ID}
                  record={selected}
                  actions={resultActions(selected)}
                />
              )}
              <Filmstrip
                projectId={FREE_PROJECT_ID}
                records={records}
                browser={browser}
                menu={resultActions}
                onOpen={() => setStage('result')}
              />
            </section>
          </SidePanelLayout>
        </div>
      </div>
    </section>
  );
}
