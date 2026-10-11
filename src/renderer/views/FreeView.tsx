import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FreeGeneration, FreeImage, GenerationSummary, Preset } from '../../core/domain/types';
import { isActive } from '../../core/jobs/JobLifecycle';
import { effectiveGenerationSettings, FREE_PROJECT_ID } from '../../core/model/defaults';
import { estimateJobAnlas, generationCostWarnings } from '../../core/providers/NaiCost';
import { maxCharactersFor, modelLabel, supportsInpaint } from '../../core/providers/NaiModels';
import { generateFree } from '../actions';
import { PROMPT_POSITIONS } from '../promptPositions';
import { AccountMeter } from '../components/AccountMeter';
import { CharacterChips } from '../components/CharacterChips';
import { ChainChip, SizeChip } from '../components/ChainChip';
import { ResultBar, showResultMenu, type ResultAction } from '../components/ResultActions';
import { Icon } from '../components/Icon';
import { ImageStage } from '../components/ImageStage';
import { PanelResizer } from '../components/PanelResizer';
import { PresetNumberRow } from '../components/PresetNumberRow';
import { PromptTextarea } from '../components/PromptTextarea';
import { ReferenceCanvas } from '../components/ReferenceCanvas';
import { ExpandTextButton } from '../components/TextEditorDialog';
import { NumberField } from '../components/ui';
import { useBoxSelection } from '../components/useBoxSelection';
import { fileApi, libraryApi } from '../desktop';
import {
  clearFreeImage,
  loadFreeImageFromFile,
  makeReferenceFromRecord,
  saveFreeMask,
  sendToFreeImg2Img,
  setFreeMask,
  sourceDataUrl,
  sourceMedia,
} from '../freeImageOps';
import { deleteResults, deleteShownResult, openImg2ImgDialog } from '../generationOps';
import { decodeMask, loadHtmlImage } from '../lib/image';
import {
  projectMedia,
  resolveFreeGeneration,
  run,
  toast,
  updateFreeGeneration,
  useLibrary,
  useStore,
} from '../store';

const NO_RECORDS: GenerationSummary[] = [];
const NO_RECT = { x: 0, y: 0, width: 0, height: 0 };
const ignore = () => undefined;

/**
 * i2i 이미지에 인페인팅으로 다시 그릴 곳을 칠한다. 이미지가 바뀌면 `key`로 새로 만들어, 처음 불러온 마스크와
 * 실행 취소 기록이 이전 이미지와 섞이지 않게 한다.
 */
function FreeMaskCanvas({ image }: { image: FreeImage }) {
  const { file, width, height } = image;
  const [initialMaskFile] = useState(image.maskFile);
  const [loaded, setLoaded] = useState<{ image: HTMLImageElement; mask?: Uint8Array }>();
  const [failed, setFailed] = useState(false);
  const empty = useMemo(() => new Uint8Array(width * height), [width, height]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const picture = await loadHtmlImage(await sourceDataUrl(file));
        // 마스크 파일을 읽지 못하면 빈 마스크에서 다시 칠한다.
        const mask = initialMaskFile
          ? await sourceDataUrl(initialMaskFile)
              .then((url) => decodeMask(url, width, height))
              .catch(() => undefined)
          : undefined;
        if (!cancelled) setLoaded({ image: picture, mask });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, width, height, initialMaskFile]);

  useEffect(() => () => void saveFreeMask(), []);

  const onMaskChange = useCallback(
    (mask: Uint8Array) => setFreeMask(file, mask, width, height),
    [file, width, height],
  );

  if (failed)
    return (
      <div className="stage-empty">
        <p>이미지를 읽지 못했습니다.</p>
        <p className="hint">오른쪽에서 이미지를 다시 불러오십시오.</p>
      </div>
    );
  if (!loaded) return <p className="hint">이미지를 불러오는 중…</p>;
  return (
    <ReferenceCanvas
      maskOnly
      image={loaded.image}
      width={width}
      height={height}
      backgroundMask={empty}
      referenceRect={NO_RECT}
      outputRect={image.outputRect}
      expansionPx={0}
      initialMask={loaded.mask}
      detectionLabel=""
      onReferenceRectChange={ignore}
      onOutputRectChange={ignore}
      onMaskChange={onMaskChange}
    />
  );
}

/**
 * i2i로 다시 그릴 이미지, 전체를 다시 그릴지 칠한 곳만 다시 그릴지(인페인팅), 그 방식의 강도·노이즈. i2i에만
 * 쓰는 입력을 한 카드에 모은다.
 */
function FreeImagePanel({ free, preset }: { free: FreeGeneration; preset?: Preset }) {
  const { image } = free;
  return (
    <section className="detail-card free-source">
      <div className="detail-card-head">
        <b>i2i 이미지</b>
        {image && (
          <button className="link-button" onClick={clearFreeImage}>
            비우기
          </button>
        )}
      </div>
      <div className="free-source-body">
        {image ? (
          <img src={sourceMedia(image.file)} alt="" />
        ) : (
          <span className="free-source-empty" />
        )}
        <span className="hint">
          {image
            ? `${image.name} · ${image.outputRect.width}×${image.outputRect.height}`
            : '아직 고르지 않았습니다'}
          <br />
          결과의 「자유 생성 i2i」로 보내거나 파일에서 불러옵니다.
        </span>
      </div>
      <button className="with-icon" onClick={() => void loadFreeImageFromFile()}>
        <Icon name="plus" size={14} /> 파일에서 불러오기
      </button>
      <div className="segmented free-source-mode" role="group" aria-label="다시 그릴 범위">
        <button
          className={free.inpaint ? '' : 'active'}
          aria-pressed={!free.inpaint}
          title="이미지 전체를 강도만큼 다시 그립니다"
          onClick={() => updateFreeGeneration({ inpaint: false })}
        >
          <Icon name="refresh" size={14} /> 전체 다시 그리기
        </button>
        <button
          className={free.inpaint ? 'active' : ''}
          aria-pressed={free.inpaint}
          title="가운데 이미지에 마스크로 칠한 곳만 다시 그립니다"
          onClick={() => updateFreeGeneration({ inpaint: true })}
        >
          <Icon name="brush" size={14} /> 인페인팅
        </button>
      </div>
      {preset &&
        (free.inpaint ? (
          <PresetNumberRow preset={preset} field="inpaintStrength" />
        ) : (
          <>
            <PresetNumberRow preset={preset} field="img2imgStrength" />
            <PresetNumberRow preset={preset} field="img2imgNoise" />
          </>
        ))}
    </section>
  );
}

/** 감정 없이 프롬프트만으로 여러 장을 뽑는 화면. 결과는 작업과 따로 `projects/free/`에 쌓인다. */
export function FreeView() {
  const library = useLibrary();
  const { free, preset, character, promptSet } = resolveFreeGeneration(library);
  const image = free.mode === 'img2img' ? free.image : undefined;
  const allRecords = useStore((state) => state.generations[FREE_PROJECT_ID]) ?? NO_RECORDS;
  const queue = useStore((state) => state.queue);
  const token = useStore((state) => state.token);
  const busy = useStore((state) => state.busy);
  const filmstripCollapsed = useStore((state) => state.filmstripCollapsed);
  const records = useMemo(
    () => [...allRecords].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [allRecords],
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [stage, setStage] = useState<'source' | 'result'>('source');
  const showSource = Boolean(image) && stage === 'source';
  const selected = records.find((record) => record.id === selectedId) ?? records[0];
  const pending = queue.jobs.filter(
    (job) => job.projectId === FREE_PROJECT_ID && isActive(job.status),
  ).length;

  const newest = records[0];
  // 새 결과가 생기면 그 결과를 원본과 나란히 보여 준다. 처음 열 때 이미 있던 결과나, 최신 결과를 지워 맨
  // 앞이 바뀐 것으로는 넘어가지 않는다.
  const seenNewest = useRef(newest?.createdAt);
  useEffect(() => {
    if (newest && (!seenNewest.current || newest.createdAt > seenNewest.current)) {
      setSelectedId(undefined);
      if (seenNewest.current) setStage('result');
    }
    seenNewest.current = newest?.createdAt;
  }, [newest]);

  const removeMany = (ids: string[]) =>
    void deleteResults(
      FREE_PROJECT_ID,
      records.filter((record) => ids.includes(record.id)),
    );
  const picking = useBoxSelection<HTMLDivElement>(
    records.map((record) => record.id),
    removeMany,
  );
  const pickedCount = picking.selected.size;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select')) return;
      const position = records.findIndex((record) => record.id === selected?.id);
      if (event.key === 'ArrowRight' && records[position + 1])
        setSelectedId(records[position + 1].id);
      if (event.key === 'ArrowLeft' && position > 0) setSelectedId(records[position - 1].id);
      // 여러 장을 고른 동안은 useBoxSelection이 고른 것을 지운다. 결과 막대가 보일 때만 그 결과를 지운다.
      if (
        event.key === 'Delete' &&
        !pickedCount &&
        !showSource &&
        selected &&
        !document.querySelector('.modal-backdrop')
      ) {
        event.preventDefault();
        void deleteShownResult(FREE_PROJECT_ID, records, selected, setSelectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [records, selected, pickedCount, showSource]);

  const inpainting = free.mode === 'img2img' && free.inpaint;
  // 캐릭터 프롬프트가 없으면 캐릭터 끝을 골라 두었어도 공통 끝에 붙인다(buildFreeJobs와 같은 규칙).
  const hasCharacterPrompt = Boolean(promptSet?.positive.trim());
  const promptPosition =
    free.promptPosition === 'character-end' && hasCharacterPrompt ? 'character-end' : 'common-end';
  const generation = preset && effectiveGenerationSettings(preset.generation);
  const costJob = generation && {
    kind: inpainting ? ('inpaint' as const) : free.mode,
    strength: generation.img2imgStrength,
    settings: generation,
    canvasWidth: image?.width ?? generation.width,
    canvasHeight: image?.height ?? generation.height,
  };
  const estimate = costJob ? estimateJobAnlas(costJob, token) * free.count : undefined;
  const costReasons = costJob ? generationCostWarnings([costJob], token) : [];
  const inpaintModelMissing = inpainting && preset && !supportsInpaint(preset.generation.model);
  const canGenerate =
    Boolean(preset) &&
    Boolean(free.prompt.trim() || promptSet?.positive.trim()) &&
    (free.mode === 'txt2img' || (Boolean(image) && !inpaintModelMissing));

  const resultActions = (record: GenerationSummary): ResultAction[] => [
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
      title: '이 결과를 만들 때 입력한 프롬프트로 되돌립니다',
      disabled: record.emotionPrompt === free.prompt,
      onSelect: () => updateFreeGeneration({ prompt: record.emotionPrompt }),
    },
    {
      label: 'i2i로 보내기',
      icon: 'upscale',
      group: 'send',
      title: '이 결과를 크기·강도를 정해 i2i로 다시 그립니다. 더 큰 크기로 키울 때도 씁니다.',
      onSelect: () => openImg2ImgDialog(FREE_PROJECT_ID, [record]),
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
      icon: 'save',
      group: 'file',
      iconOnly: true,
      onSelect: () =>
        void run('이미지를 저장하는 중', async () => {
          const saved = await fileApi().saveImageAs(
            FREE_PROJECT_ID,
            record.id,
            `자유 생성 ${record.seed}`,
            library.settings.export.quality,
          );
          if (saved) toast(`저장했습니다: ${saved}`);
        }),
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
          <p className="hint">오른쪽에서 프롬프트 입력 후 생성</p>
        </div>
      }
      overlay={
        <>
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
        <h1 className="free-title">자유 생성</h1>
        <div className="segmented" role="group" aria-label="생성 방식">
          {(
            [
              ['txt2img', '일반 생성', '프롬프트로만 그립니다'],
              ['img2img', 'i2i', '고른 이미지를 다시 그리거나, 칠한 곳만 다시 그립니다'],
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
          <Icon name="folder" size={14} /> 폴더
        </button>
      </header>
      <div className="chain-bar">
        <ChainChip section="presets" itemId={preset?.id} missing={!preset}>
          <select
            value={preset?.id ?? ''}
            onChange={(event) => updateFreeGeneration({ presetId: event.target.value })}
          >
            {!preset && <option value="">(없음)</option>}
            {library.presets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </ChainChip>
        <CharacterChips
          slots={free.characters}
          optional
          max={maxCharactersFor(preset?.generation.model)}
          onChange={(characters) => updateFreeGeneration({ characters })}
        />
        {preset && free.mode === 'txt2img' && <SizeChip preset={preset} />}
      </div>
      {inpaintModelMissing && (
        <div className="missing-banner">
          ⚠ {modelLabel(preset.generation.model)}은(는) 인페인팅을 지원하지 않습니다. 생성 설정에서
          모델을 바꾸거나 「전체 다시 그리기」로 바꾸십시오.
        </div>
      )}

      <div className="project-body animate-in">
        <div className="emotion-detail">
          <div className="detail-body">
            <section className="detail-stage">
              {image && (
                <div className="segmented stage-tabs" role="group" aria-label="왼쪽에 보일 것">
                  <button
                    className={stage === 'source' ? 'active' : ''}
                    aria-pressed={stage === 'source'}
                    onClick={() => setStage('source')}
                  >
                    <Icon name={free.inpaint ? 'brush' : 'reference'} size={14} />
                    {free.inpaint ? '마스크 칠하기' : 'i2i 이미지'}
                  </button>
                  <button
                    className={stage === 'result' ? 'active' : ''}
                    aria-pressed={stage === 'result'}
                    onClick={() => setStage('result')}
                  >
                    <Icon name="images" size={14} /> 원본과 결과
                  </button>
                </div>
              )}
              {showSource && image ? (
                free.inpaint ? (
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
                    alt="i2i 이미지"
                    overlay={<span className="stage-label">i2i 이미지</span>}
                  />
                  {resultStage}
                </div>
              ) : (
                resultStage
              )}
              {!showSource && selected && (
                <ResultBar
                  projectId={FREE_PROJECT_ID}
                  record={selected}
                  actions={resultActions(selected)}
                />
              )}
              {records.length > 0 && !filmstripCollapsed && (
                <div
                  className="filmstrip selectable"
                  role="listbox"
                  aria-label="생성 기록"
                  aria-multiselectable
                  {...picking.containerProps}
                >
                  {records.map((record) => (
                    <button
                      key={record.id}
                      role="option"
                      data-select-id={record.id}
                      aria-selected={record.id === selected?.id}
                      className={`${record.id === selected?.id ? 'selected' : ''} ${picking.isSelected(record.id) ? 'picked' : ''}`}
                      onClick={(event) => {
                        if (picking.clickItem(event, record.id)) return;
                        setSelectedId(record.id);
                        setStage('result');
                      }}
                      onContextMenu={(event) => {
                        setSelectedId(record.id);
                        showResultMenu(event, resultActions(record));
                      }}
                      title={`seed ${record.seed} · ${new Date(record.createdAt).toLocaleString()} · Ctrl·Shift 클릭: 여러 장 선택`}
                    >
                      <img
                        src={projectMedia(FREE_PROJECT_ID, record.thumbFile ?? record.file)}
                        alt=""
                        loading="lazy"
                      />
                    </button>
                  ))}
                  {picking.boxElement}
                </div>
              )}
              {records.length > 0 && !filmstripCollapsed && (
                <div className="filmstrip-bar">
                  {picking.selected.size > 0 ? (
                    <>
                      <span>{picking.selected.size}장 선택</span>
                      <button
                        className="with-icon danger-quiet"
                        onClick={() => removeMany([...picking.selected])}
                      >
                        <Icon name="trash" size={14} /> 삭제
                      </button>
                      <button className="link-button" onClick={picking.clear}>
                        선택 취소
                      </button>
                    </>
                  ) : (
                    <span className="hint">
                      결과 {records.length}장 · Ctrl·Shift 클릭이나 빈 곳을 끌어 여러 장 선택
                    </span>
                  )}
                </div>
              )}
            </section>

            <aside className="detail-side">
              {free.mode === 'img2img' && <FreeImagePanel free={free} preset={preset} />}
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
              <p className="hint">
                생성 설정의 공통 프롬프트{character ? `와 ${character.name}의 캐릭터 프롬프트` : ''}
                에 더해 보냅니다.
              </p>

              <div className="generate-dock">
                <NumberField
                  label="장수"
                  value={free.count}
                  min={1}
                  max={20}
                  integer
                  onChange={(count) => updateFreeGeneration({ count })}
                />
                <button
                  className="generate-button"
                  disabled={!canGenerate || Boolean(busy)}
                  onClick={() => void generateFree()}
                >
                  ▶ {free.count}장 생성
                </button>
                {estimate !== undefined && (
                  <p
                    className="hint"
                    title={[...costReasons, '예상값이며 실제 차감량과 다를 수 있습니다.'].join(
                      '\n',
                    )}
                  >
                    {estimate
                      ? `예상 약 ${estimate.toLocaleString()} Anlas`
                      : '예상 0 Anlas (무료)'}
                  </p>
                )}
              </div>
            </aside>
            <PanelResizer panel="side-panel" />
          </div>
        </div>
      </div>
    </section>
  );
}
