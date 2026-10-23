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
  usesMedium,
} from '../../core/providers/NaiModels';
import { directorToolSize, generateFree, runFreeDirectorTool } from '../actions';
import { PROMPT_POSITIONS } from '../promptPositions';
import { AccountMeter } from '../components/AccountMeter';
import { AidChip } from '../components/AidChip';
import { CharacterChip } from '../components/CharacterChip';
import { PositionChip } from '../components/CharacterPositions';
import { ChecklistChip, SizeChip } from '../components/ChainChip';
import { BgRemovalWarning, DirectorToolFields } from '../components/DirectorToolFields';
import { Filmstrip } from '../components/Filmstrip';
import { HistoryToggle } from '../components/HistoryPanel';
import { PaletteSlot, SidePanel } from '../components/FloatingPalette';
import { SidePanelToggle } from '../components/SidePanelToggle';
import { TopBarCollapse, TopBarSummary } from '../components/TopBarToggle';
import { PromptPanelToggle } from '../components/PromptPanel';
import { ResultBar } from '../components/ResultActions';
import { showResultMenu, type ResultAction } from '../components/resultMenu';
import { Icon } from '../components/Icon';
import { StreamPreview } from '../components/StreamPreview';
import { ImageStage } from '../components/ImageStage';
import { PanelResizer } from '../components/PanelResizer';
import { PromptTextarea } from '../components/PromptTextarea';
import { ExpandTextButton } from '../components/TextEditorDialog';
import { NumberField, Toggle } from '../components/ui';
import { useResultBrowser } from '../components/useResultBrowser';
import { fileApi, libraryApi } from '../desktop';
import {
  loadFreeImageFromFile,
  makeReferenceFromRecord,
  newBlankFreeImage,
  sendToFreeDirector,
  sendToFreeImg2Img,
  sourceMedia,
} from '../freeImageOps';
import { deleteShownResult, openImg2ImgDialog } from '../generationOps';
import {
  projectMedia,
  resolveFreeGeneration,
  run,
  sidePanelShownOf,
  toast,
  topBarShownOf,
  updateFreeGeneration,
  useLibrary,
  useStore,
} from '../store';
import { FreeDrawStage } from './free/FreeDrawStage';
import { FreeImagePanel } from './free/FreeImagePanel';
import { FreeMaskCanvas } from './free/FreeMaskCanvas';

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
  const sideShown = useStore(sidePanelShownOf);
  const topShown = useStore(topBarShownOf);
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
  // buildFreeJobs와 같은 규칙
  const hasCharacterPrompt = Boolean(promptSet?.positive.trim());
  const promptPosition =
    free.promptPosition === 'character-end' && hasCharacterPrompt ? 'character-end' : 'common-end';
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
    : Boolean(preset) &&
      (free.mode === 'txt2img' || (Boolean(image) && !inpaintModelMissing));
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
            title: '지금 프롬프트와 이 결과의 seed로 다시 생성',
            onSelect: () => void generateFree({ seed: record.seed, count: 1 }),
          },
          {
            label: '프롬프트 복원',
            icon: 'undo',
            group: 'main',
            title: '이 결과를 만들 때 입력한 프롬프트와 네거티브로 되돌립니다',
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

  const resultActions = (record: GenerationSummary): ResultAction[] => [
    ...promptActions(record),
    {
      label: '다듬기',
      icon: 'upscale',
      group: 'send',
      title:
        '이 결과를 크기·강도를 정해 다시 그려 다듬습니다(NovelAI 웹의 Enhance). 더 큰 크기로 키울 때도 씁니다.',
      onSelect: () => openImg2ImgDialog(FREE_PROJECT_ID, [record]),
    },
    {
      label: '이 결과로 디렉터 툴',
      icon: 'wand',
      group: 'send',
      title: '이 결과를 디렉터 툴 이미지로 정해 Emotion·배경 제거·Declutter 같은 툴을 적용합니다',
      onSelect: () =>
        void sendToFreeDirector(FREE_PROJECT_ID, record).then(() => setStage('source')),
    },
    {
      label: '이 결과로 i2i',
      icon: 'sparkle',
      group: 'send',
      title: '이 결과를 i2i 이미지로 정해 다시 그리거나, 인페인팅으로 일부만 고칩니다',
      onSelect: () =>
        void sendToFreeImg2Img(FREE_PROJECT_ID, record).then(() => setStage('source')),
    },
    {
      label: '인페인트 만들기',
      icon: 'reference',
      group: 'send',
      title: '이 결과를 참고 이미지로 쓰는 새 인페인트를 만듭니다',
      onSelect: () => void makeReferenceFromRecord(FREE_PROJECT_ID, record),
    },
    {
      label: '다른 이름으로 저장',
      title: '다른 이름으로 저장 (Ctrl+Shift+S)',
      icon: 'save',
      group: 'file',
      iconOnly: true,
      onSelect: () => saveAs(record),
    },
    {
      label: '폴더에서 보기',
      icon: 'folder',
      group: 'file',
      iconOnly: true,
      onSelect: () =>
        void run('폴더를 여는 중', () => libraryApi().showGeneration(FREE_PROJECT_ID, record.id)),
    },
    {
      label: '이 결과 삭제',
      icon: 'trash',
      title: '이 결과 삭제 (Del)',
      group: 'delete',
      iconOnly: true,
      onSelect: () => void deleteShownResult(FREE_PROJECT_ID, records, record, setSelectedId),
    },
  ];

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

  return (
    <section className="project-view">
      <header className="project-header">
        <PromptPanelToggle />
        <h1 className="free-title">자유 생성</h1>
        <div className="segmented" role="group" aria-label="생성 방식">
          {(
            [
              ['txt2img', '일반 생성', '프롬프트로만 그립니다'],
              ['img2img', 'i2i', '고른 이미지를 다시 그리거나, 칠한 곳만 다시 그립니다'],
              [
                'augment',
                '디렉터 툴',
                '고른 이미지에 Emotion·배경 제거 같은 NovelAI 디렉터 툴을 적용합니다',
              ],
            ] as const
          ).map(([mode, label, title]) => (
            <button
              key={mode}
              className={free.mode === mode ? 'active blue' : ''}
              aria-pressed={free.mode === mode}
              title={title}
              onClick={() => updateFreeGeneration({ mode })}
            >
              {label}
            </button>
          ))}
        </div>
        {!director && !topShown && <TopBarSummary label={preset?.name ?? '(생성 설정 없음)'} />}
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
      {!director && topShown && (
        <div className="chain-bar">
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
          <TopBarCollapse />
        </div>
      )}
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
          <div className={`detail-body ${sideShown ? '' : 'side-hidden'}`}>
            <section className="detail-stage">
              {(image || free.mode === 'img2img') && (
                <div className="segmented stage-tabs" role="group" aria-label="왼쪽에 보일 것">
                  {image && (
                    <button
                      className={stage === 'source' ? 'active' : ''}
                      aria-pressed={stage === 'source'}
                      onClick={() => setStage('source')}
                    >
                      <Icon name={inpainting ? 'brush' : director ? 'wand' : 'reference'} size={14} />
                      {inpainting ? '마스크 칠하기' : sourceLabel}
                    </button>
                  )}
                  {free.mode === 'img2img' && (
                    <button
                      className={stage === 'draw' ? 'active' : ''}
                      aria-pressed={stage === 'draw'}
                      title="NovelAI 웹의 캔버스처럼 i2i 이미지에 펜·채우기로 덧칠합니다"
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

            <SidePanel className="detail-side">
              {free.mode !== 'txt2img' && <FreeImagePanel free={free} preset={preset} />}
              {director ? (
                <section className="detail-card">
                  <div className="detail-card-head">
                    <b>디렉터 툴</b>
                  </div>
                  <DirectorToolFields
                    value={augment}
                    onChange={(patch) =>
                      updateFreeGeneration({ augment: { ...augment, ...patch } })
                    }
                  />
                  {oversized && (
                    <Toggle
                      label="무료 면적(1024×1024)을 넘으니 비율을 지켜 줄여 보내기"
                      checked={shrink}
                      onChange={setShrink}
                    />
                  )}
                  {augment.tool === 'bg-removal' && (
                    <BgRemovalWarning results={augment.count * 3} />
                  )}
                </section>
              ) : (
                <>
                  <label className="prompt-field">
                    <span>
                      프롬프트
                      <span className="prompt-field-tools">
                        <ExpandTextButton
                          title="자유 생성 프롬프트"
                          value={free.prompt}
                          placeholder="예: sitting, cafe, window, warm lighting"
                          onApply={(prompt) => updateFreeGeneration({ prompt })}
                        />
                      </span>
                    </span>
                    <PromptTextarea
                      rows={8}
                      value={free.prompt}
                      placeholder="예: sitting, cafe, window, warm lighting"
                      onChange={(prompt) => updateFreeGeneration({ prompt })}
                    />
                  </label>
                  <label
                    className="prompt-field negative-field"
                    title={
                      promptPosition === 'character-end'
                        ? '첫 캐릭터 네거티브 뒤에 붙습니다'
                        : '공통 네거티브 뒤에 붙습니다'
                    }
                  >
                    <span>
                      네거티브
                      <span className="prompt-field-tools">
                        {generation && usesMedium(generation) && <em>Medium에서는 쓰이지 않음</em>}
                        <ExpandTextButton
                          title="자유 생성 네거티브"
                          value={free.negative}
                          placeholder="이번 생성에서만 뺄 태그"
                          tone="negative"
                          onApply={(negative) => updateFreeGeneration({ negative })}
                        />
                      </span>
                    </span>
                    <PromptTextarea
                      rows={3}
                      value={free.negative}
                      placeholder="이번 생성에서만 뺄 태그"
                      onChange={(negative) => updateFreeGeneration({ negative })}
                    />
                  </label>
                  <div className="prompt-position">
                    <span>붙일 위치</span>
                    <span className="segmented" role="group" aria-label="프롬프트를 붙일 위치">
                      {(['common-end', 'character-end'] as const).map((value) => {
                        const blocked = value === 'character-end' && !hasCharacterPrompt;
                        return (
                          <button
                            key={value}
                            className={promptPosition === value ? 'active' : ''}
                            aria-pressed={promptPosition === value}
                            disabled={blocked}
                            title={
                              blocked
                                ? '캐릭터 프롬프트가 없어 고를 수 없습니다'
                                : value === 'character-end'
                                  ? 'V4 이상에서 그 캐릭터에만 적용됩니다'
                                  : undefined
                            }
                            onClick={() => updateFreeGeneration({ promptPosition: value })}
                          >
                            {PROMPT_POSITIONS[value]}
                          </button>
                        );
                      })}
                    </span>
                  </div>
                </>
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
                    title={[...costReasons, '예상값이며 실제 차감량과 다를 수 있습니다.'].join(
                      '\n',
                    )}
                  >
                    {estimate ? `예상 약 ${estimate.toLocaleString()} Anlas` : '예상 0 Anlas'}
                  </p>
                )}
              </div>
            </SidePanel>
            {sideShown && <PanelResizer panel="side-panel" />}
          </div>
        </div>
      </div>
      {!sideShown && (
        <PaletteSlot>
          <button
            className="generate-button palette-button"
            title={generateLabel}
            aria-label={generateLabel}
            disabled={!canGenerate || Boolean(busy)}
            onClick={generate}
          >
            <Icon name={director ? 'wand' : 'play'} size={16} />
            <span className="palette-badge">{runs}</span>
          </button>
        </PaletteSlot>
      )}
    </section>
  );
}
