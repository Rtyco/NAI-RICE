import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FreeInpaint, GenerationSummary } from '../../core/domain/types';
import { isActive } from '../../core/jobs/JobLifecycle';
import { FREE_PROJECT_ID, normalizeGenerationSettings } from '../../core/model/defaults';
import { estimateJobAnlas, generationCostWarnings } from '../../core/providers/NaiCost';
import { modelLabel, supportsInpaint } from '../../core/providers/NaiModels';
import { generateFree } from '../actions';
import { AccountMeter } from '../components/AccountMeter';
import { ChainChip, SizeChip } from '../components/ChainChip';
import { Icon } from '../components/Icon';
import { PromptTextarea } from '../components/PromptTextarea';
import { ReferenceCanvas } from '../components/ReferenceCanvas';
import { ExpandTextButton } from '../components/TextEditorDialog';
import { NumberField } from '../components/ui';
import { useBoxSelection } from '../components/useBoxSelection';
import { fileApi, libraryApi } from '../desktop';
import {
  clearFreeInpaint,
  loadFreeInpaintFromFile,
  makeReferenceFromRecord,
  saveFreeInpaintMask,
  sendToFreeInpaint,
  setFreeInpaintMask,
  sourceDataUrl,
  sourceMedia,
} from '../freeInpaintOps';
import { deleteResults, openImg2ImgDialog } from '../generationOps';
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
import { RecordInfo } from './EmotionDetail';

const NO_RECORDS: GenerationSummary[] = [];
const NO_RECT = { x: 0, y: 0, width: 0, height: 0 };
const ignore = () => undefined;

/**
 * 자유 인페인팅 이미지에 다시 그릴 곳을 칠한다. 이미지가 바뀌면 `key`로 새로 만들어, 처음 불러온 마스크와
 * 실행 취소 기록이 이전 이미지와 섞이지 않게 한다.
 */
function FreeInpaintCanvas({ inpaint }: { inpaint: FreeInpaint }) {
  const { file, width, height } = inpaint;
  const [initialMaskFile] = useState(inpaint.maskFile);
  const [loaded, setLoaded] = useState<{ image: HTMLImageElement; mask?: Uint8Array }>();
  const [failed, setFailed] = useState(false);
  const empty = useMemo(() => new Uint8Array(width * height), [width, height]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const image = await loadHtmlImage(await sourceDataUrl(file));
        // 마스크 파일을 읽지 못하면 빈 마스크에서 다시 칠한다.
        const mask = initialMaskFile
          ? await sourceDataUrl(initialMaskFile)
              .then((url) => decodeMask(url, width, height))
              .catch(() => undefined)
          : undefined;
        if (!cancelled) setLoaded({ image, mask });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, width, height, initialMaskFile]);

  useEffect(() => () => void saveFreeInpaintMask(), []);

  const onMaskChange = useCallback(
    (mask: Uint8Array) => setFreeInpaintMask(file, mask, width, height),
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
      outputRect={inpaint.outputRect}
      expansionPx={0}
      initialMask={loaded.mask}
      detectionLabel=""
      onReferenceRectChange={ignore}
      onOutputRectChange={ignore}
      onMaskChange={onMaskChange}
      onRedetect={ignore}
    />
  );
}

/** 자유 인페인팅에 쓰는 이미지. 결과의 「자유 인페인팅」으로 보내거나 파일에서 불러온다. */
function InpaintSourcePanel({ inpaint }: { inpaint: FreeInpaint | undefined }) {
  return (
    <section className="detail-card free-inpaint-source">
      <div className="detail-card-head">
        <b>자유 인페인팅 이미지</b>
        {inpaint && (
          <button className="link-button" onClick={clearFreeInpaint}>
            비우기
          </button>
        )}
      </div>
      <div className="free-inpaint-source-body">
        {inpaint ? (
          <img src={sourceMedia(inpaint.file)} alt="" />
        ) : (
          <span className="free-inpaint-source-empty" />
        )}
        <span className="hint">
          {inpaint
            ? `${inpaint.name} · ${inpaint.outputRect.width}×${inpaint.outputRect.height}`
            : '아직 고르지 않았습니다'}
          <br />
          결과의 「자유 인페인팅」으로 보내거나 파일에서 불러옵니다. 왼쪽 이미지에 칠한 곳만 다시
          그립니다.
        </span>
      </div>
      <button className="with-icon" onClick={() => void loadFreeInpaintFromFile()}>
        <Icon name="plus" size={14} /> 파일에서 불러오기
      </button>
    </section>
  );
}

/** 감정 없이 프롬프트만으로 여러 장을 뽑는 화면. 결과는 작업과 따로 `projects/free/`에 쌓인다. */
export function FreeView() {
  const library = useLibrary();
  const { free, preset, character, promptSet } = resolveFreeGeneration(library);
  const inpaint = free.mode === 'inpaint' ? free.inpaint : undefined;
  const allRecords = useStore((state) => state.generations[FREE_PROJECT_ID]) ?? NO_RECORDS;
  const queue = useStore((state) => state.queue);
  const token = useStore((state) => state.token);
  const busy = useStore((state) => state.busy);
  const records = useMemo(
    () => [...allRecords].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [allRecords],
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [showInfo, setShowInfo] = useState(false);
  const [stage, setStage] = useState<'mask' | 'result'>('mask');
  const showMask = Boolean(inpaint) && stage === 'mask';
  const selected = records.find((record) => record.id === selectedId) ?? records[0];
  const pending = queue.jobs.filter(
    (job) => job.projectId === FREE_PROJECT_ID && isActive(job.status),
  ).length;

  const newestId = records[0]?.id;
  useEffect(() => {
    setSelectedId(undefined);
  }, [newestId]);

  const removeMany = (ids: string[]) =>
    void deleteResults(
      FREE_PROJECT_ID,
      records.filter((record) => ids.includes(record.id)),
    );
  const picking = useBoxSelection<HTMLDivElement>(
    records.map((record) => record.id),
    removeMany,
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select')) return;
      const position = records.findIndex((record) => record.id === selected?.id);
      if (event.key === 'ArrowRight' && records[position + 1])
        setSelectedId(records[position + 1].id);
      if (event.key === 'ArrowLeft' && position > 0) setSelectedId(records[position - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [records, selected]);

  const generation = preset && normalizeGenerationSettings(preset.generation);
  const costJob = generation && {
    kind: free.mode,
    settings: generation,
    canvasWidth: inpaint?.width ?? generation.width,
    canvasHeight: inpaint?.height ?? generation.height,
  };
  const estimate = costJob ? estimateJobAnlas(costJob, token) * free.count : undefined;
  const costReasons = costJob ? generationCostWarnings([costJob], token) : [];
  const inpaintModelMissing =
    free.mode === 'inpaint' && preset && !supportsInpaint(preset.generation.model);
  const canGenerate =
    Boolean(preset) &&
    Boolean(free.prompt.trim() || promptSet?.positive.trim()) &&
    (free.mode === 'txt2img' || (Boolean(inpaint) && !inpaintModelMissing));

  return (
    <section className="project-view">
      <header className="project-header">
        <h1 className="free-title">자유 생성</h1>
        <div className="segmented" role="group" aria-label="생성 방식">
          {(
            [
              ['txt2img', '일반 생성', '프롬프트로만 그립니다'],
              ['inpaint', '자유 인페인팅', '이미지에서 칠한 곳만 다시 그립니다'],
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
        <ChainChip section="characters" itemId={character?.id}>
          <select
            value={character?.id ?? ''}
            onChange={(event) => {
              const next = library.characters.find((item) => item.id === event.target.value);
              updateFreeGeneration({
                characterId: next?.id ?? '',
                promptSetId: next?.promptSets[0].id ?? '',
              });
            }}
          >
            <option value="">캐릭터 없음</option>
            {library.characters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {character && character.promptSets.length > 1 && (
            <>
              <span className="chain-chip-sep">/</span>
              <select
                title="캐릭터 프롬프트 세트"
                aria-label="캐릭터 프롬프트 세트"
                value={promptSet?.id}
                onChange={(event) => updateFreeGeneration({ promptSetId: event.target.value })}
              >
                {character.promptSets.map((set) => (
                  <option key={set.id} value={set.id}>
                    세트: {set.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </ChainChip>
        {preset && free.mode === 'txt2img' && <SizeChip preset={preset} />}
      </div>
      {inpaintModelMissing && (
        <div className="missing-banner">
          ⚠ {modelLabel(preset.generation.model)}은(는) 일반 생성 전용입니다. 자유 인페인팅을 하려면
          생성 설정에서 인페인트를 지원하는 모델로 바꾸십시오.
        </div>
      )}

      <div className="project-body animate-in">
        <div className="emotion-detail">
          <div className="detail-body">
            <section className="detail-stage">
              {inpaint && (
                <div className="segmented stage-tabs" role="group" aria-label="왼쪽에 보일 것">
                  <button
                    className={stage === 'mask' ? 'active' : ''}
                    aria-pressed={stage === 'mask'}
                    onClick={() => setStage('mask')}
                  >
                    🖌 마스크 칠하기
                  </button>
                  <button
                    className={stage === 'result' ? 'active' : ''}
                    aria-pressed={stage === 'result'}
                    onClick={() => setStage('result')}
                  >
                    🖼 결과 보기
                  </button>
                </div>
              )}
              {showMask && inpaint ? (
                <div className="free-inpaint-stage">
                  <FreeInpaintCanvas key={inpaint.file} inpaint={inpaint} />
                </div>
              ) : (
                <div className="stage-image">
                  {selected ? (
                    <img src={projectMedia(FREE_PROJECT_ID, selected.file)} alt="" />
                  ) : (
                    <div className="stage-empty">
                      <p>아직 생성된 이미지가 없습니다.</p>
                      <p className="hint">오른쪽에서 프롬프트 입력 후 생성</p>
                    </div>
                  )}
                  {pending > 0 && (
                    <span className="card-status busy stage-status">생성 대기 {pending}</span>
                  )}
                </div>
              )}
              {records.length > 0 && (
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
              {records.length > 0 && (
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
              {free.mode === 'inpaint' && <InpaintSourcePanel inpaint={inpaint} />}
              <label className="prompt-field">
                <span>
                  프롬프트
                  <span className="prompt-field-tools">
                    <em>공통 포지티브 끝에 붙습니다</em>
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
              <p className="hint">
                생성 설정의 공통 프롬프트{character ? `와 ${character.name}의 캐릭터 프롬프트` : ''}
                에 더해 보냅니다.
              </p>

              <div className="generate-row">
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
              </div>
              {estimate !== undefined && (
                <p
                  className="hint"
                  title={[...costReasons, '예상값이며 실제 차감량과 다를 수 있습니다.'].join('\n')}
                >
                  {estimate ? `예상 약 ${estimate.toLocaleString()} Anlas` : '예상 0 Anlas (무료)'}
                </p>
              )}

              {selected && (
                <section className="detail-card">
                  <div className="detail-card-head">
                    <b>선택한 결과</b>
                    <button className="link-button" onClick={() => setShowInfo((value) => !value)}>
                      {showInfo ? '정보 접기' : '생성 정보'}
                    </button>
                  </div>
                  {showInfo && <RecordInfo projectId={FREE_PROJECT_ID} record={selected} />}
                  <div className="button-grid">
                    <button
                      onClick={() => void generateFree({ seed: selected.seed, count: 1 })}
                      title="지금 프롬프트와 이 결과의 seed로 다시 생성"
                    >
                      이 seed로 다시
                    </button>
                    <button
                      disabled={selected.emotionPrompt === free.prompt}
                      onClick={() => updateFreeGeneration({ prompt: selected.emotionPrompt })}
                      title="이 결과를 만들 때 입력한 프롬프트로 되돌립니다"
                    >
                      프롬프트 복원
                    </button>
                    <button
                      onClick={() =>
                        void run('이미지를 저장하는 중', async () => {
                          const saved = await fileApi().saveImageAs(
                            FREE_PROJECT_ID,
                            selected.id,
                            `자유 생성 ${selected.seed}`,
                            library.settings.export.quality,
                          );
                          if (saved) toast(`저장했습니다: ${saved}`);
                        })
                      }
                    >
                      다른 이름으로 저장
                    </button>
                    <button
                      onClick={() =>
                        void run('폴더를 여는 중', () =>
                          libraryApi().showGeneration(FREE_PROJECT_ID, selected.id),
                        )
                      }
                    >
                      폴더에서 보기
                    </button>
                    <button
                      onClick={() => openImg2ImgDialog(FREE_PROJECT_ID, [selected])}
                      title="이 결과를 더 큰 크기로 다시 그립니다(업스케일 우회)"
                    >
                      i2i로 보내기
                    </button>
                    <button
                      onClick={() =>
                        void sendToFreeInpaint(FREE_PROJECT_ID, selected).then(() =>
                          setStage('mask'),
                        )
                      }
                      title="이 결과의 일부를 마스크로 칠해 다시 그립니다"
                    >
                      자유 인페인팅
                    </button>
                    <button
                      onClick={() => void makeReferenceFromRecord(FREE_PROJECT_ID, selected)}
                      title="이 결과를 참고 이미지로 쓰는 새 인페인트를 만듭니다"
                    >
                      인페인트 만들기
                    </button>
                    <button
                      className="danger-quiet"
                      onClick={() => void deleteResults(FREE_PROJECT_ID, [selected])}
                    >
                      결과 삭제
                    </button>
                  </div>
                </section>
              )}
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
