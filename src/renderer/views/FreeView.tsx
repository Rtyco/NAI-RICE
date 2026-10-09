import { useEffect, useMemo, useState } from 'react';
import type { GenerationSummary, Img2ImgSource } from '../../core/domain/types';
import { isActive } from '../../core/jobs/JobLifecycle';
import { FREE_PROJECT_ID, normalizeGenerationSettings } from '../../core/model/defaults';
import { estimateJobAnlas, generationCostWarnings } from '../../core/providers/NaiCost';
import { generateFree } from '../actions';
import { AccountMeter } from '../components/AccountMeter';
import { ChainChip, SizeChip, SourceChip, StrengthChip } from '../components/ChainChip';
import { Icon } from '../components/Icon';
import { PromptTextarea } from '../components/PromptTextarea';
import { ExpandTextButton } from '../components/TextEditorDialog';
import { NumberField } from '../components/ui';
import { useBoxSelection } from '../components/useBoxSelection';
import { fileApi, libraryApi } from '../desktop';
import { deleteResults, openImg2ImgDialog } from '../generationOps';
import { addSourceFromRecord, sourceMedia } from '../sourceOps';
import {
  openSources,
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

/** 고른 i2i 원본을 크게 보여 준다. 어떤 이미지를 다시 그리는지 바로 알 수 있게 한다. */
function SourcePanel({ source }: { source: Img2ImgSource | undefined }) {
  return (
    <section className="detail-card i2i-source">
      <div className="detail-card-head">
        <b>i2i 원본</b>
        <button className="link-button" onClick={openSources}>
          라이브러리 열기
        </button>
      </div>
      <div className="i2i-source-body">
        {source ? <img src={sourceMedia(source)} alt="" /> : <span className="i2i-source-empty" />}
        <span className="hint">
          {source ? `${source.name} · ${source.width}×${source.height}` : '아직 고르지 않았습니다'}
          <br />
          위쪽 「i2i 원본」 칩이나 결과의 「i2i 원본으로」로 고릅니다. 비율이 다르면 위쪽을 남기고
          잘라 맞춥니다.
        </span>
      </div>
    </section>
  );
}

/** 감정 없이 프롬프트만으로 여러 장을 뽑는 화면. 결과는 작업과 따로 `projects/free/`에 쌓인다. */
export function FreeView() {
  const library = useLibrary();
  const { free, preset, character, promptSet } = resolveFreeGeneration(library);
  const source = library.img2imgSources.find((item) => item.id === free.sourceId);
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
    strength: generation.img2imgStrength,
    settings: generation,
    canvasWidth: generation.width,
    canvasHeight: generation.height,
  };
  const estimate = costJob ? estimateJobAnlas(costJob, token) * free.count : undefined;
  const costReasons = costJob ? generationCostWarnings([costJob], token) : [];
  const canGenerate =
    Boolean(preset) &&
    Boolean(free.prompt.trim() || promptSet?.positive.trim()) &&
    (free.mode === 'txt2img' || Boolean(source));

  return (
    <section className="project-view">
      <header className="project-header">
        <h1 className="free-title">자유 생성</h1>
        <div className="segmented" role="group" aria-label="생성 방식">
          {(
            [
              ['txt2img', '일반 생성', '프롬프트로만 그립니다'],
              ['img2img', 'i2i', '고른 이미지를 다시 그립니다'],
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
        {preset && <SizeChip preset={preset} />}
        {preset && free.mode === 'img2img' && <StrengthChip preset={preset} />}
        {free.mode === 'img2img' && (
          <SourceChip
            sourceId={free.sourceId}
            onChange={(sourceId) => updateFreeGeneration({ sourceId })}
          />
        )}
      </div>

      <div className="project-body animate-in">
        <div className="emotion-detail">
          <div className="detail-body">
            <section className="detail-stage">
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
                        if (!picking.clickItem(event, record.id)) setSelectedId(record.id);
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
              {free.mode === 'img2img' && <SourcePanel source={source} />}
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
                        void addSourceFromRecord(FREE_PROJECT_ID, selected).then(
                          (sourceId) =>
                            sourceId && updateFreeGeneration({ mode: 'img2img', sourceId }),
                        )
                      }
                      title="이 결과를 i2i 원본 라이브러리에 넣고 원본으로 고릅니다. 프롬프트를 바꿔 여러 장 다시 그릴 때 씁니다"
                    >
                      i2i 원본으로
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
