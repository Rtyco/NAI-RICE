import { useEffect, useMemo, useState } from 'react';
import type { Emotion, GenerationRecord, GenerationSummary } from '../../core/domain/types';
import type { ResolvedProject } from '../../core/model/defaults';
import { modelLabel } from '../../core/providers/NaiModels';
import { generateEmotions } from '../actions';
import { Icon } from '../components/Icon';
import { useBoxSelection } from '../components/useBoxSelection';
import { NumberField } from '../components/ui';
import { deleteEmotion, duplicateEmotionIn, patchEmotion } from '../emotionOps';
import { deleteResults } from '../generationOps';
import {
  emotionRecords,
  openEmotion,
  projectMedia,
  run,
  toast,
  updateProject,
  useLibrary,
  useStore,
} from '../store';
import { fileApi, libraryApi } from '../desktop';
import { PromptTextarea } from '../components/PromptTextarea';
import { ExpandTextButton } from '../components/TextEditorDialog';

/** 선택한 결과의 생성 정보. 목록에는 프롬프트가 없어서, 열 때 기록 하나를 통째로 받아 온다. */
function RecordInfo({ projectId, record }: { projectId: string; record: GenerationSummary }) {
  const [full, setFull] = useState<GenerationRecord | null>();
  useEffect(() => {
    let alive = true;
    setFull(undefined);
    libraryApi()
      .getGeneration(projectId, record.id)
      .then((value) => alive && setFull(value))
      .catch(() => alive && setFull(null));
    return () => {
      alive = false;
    };
  }, [projectId, record.id]);
  const prompt = (pick: (value: GenerationRecord) => string) =>
    full === undefined ? '불러오는 중…' : full === null ? '읽을 수 없습니다' : pick(full);
  return (
    <dl className="record-info">
      <dt>생성 시각</dt>
      <dd>{new Date(record.createdAt).toLocaleString()}</dd>
      <dt>Seed</dt>
      <dd>{record.seed}</dd>
      <dt>모델</dt>
      <dd>{modelLabel(record.model)}</dd>
      <dt>크기</dt>
      <dd>
        {record.width}×{record.height}
      </dd>
      {record.anlasSpent !== undefined && (
        <>
          <dt>사용 Anlas</dt>
          <dd>{record.anlasSpent}</dd>
        </>
      )}
      <dt>조합</dt>
      <dd>
        {[record.presetName, `${record.characterName} / ${record.promptSetName}`, record.emotionSetName, record.referenceName]
          .filter(Boolean)
          .join(' → ')}
      </dd>
      <dt>감정 프롬프트</dt>
      <dd className="mono">{record.emotionPrompt || '—'}</dd>
      <dt>캐릭터 프롬프트</dt>
      <dd className="mono">{prompt((value) => value.characterPrompt)}</dd>
      <dt>공통 프롬프트</dt>
      <dd className="mono">{prompt((value) => value.prompt)}</dd>
      <dt>공통 네거티브</dt>
      <dd className="mono">{prompt((value) => value.negativePrompt)}</dd>
    </dl>
  );
}

export function EmotionDetail({ resolved, emotion }: { resolved: ResolvedProject; emotion: Emotion }) {
  const { project } = resolved;
  const set = resolved.emotionSet!;
  const library = useLibrary();
  const allRecords = useStore((state) => state.generations[project.id]);
  const queue = useStore((state) => state.queue);
  const records = useMemo(() => emotionRecords(allRecords, emotion.id), [allRecords, emotion.id]);
  const [selectedId, setSelectedId] = useState<string>();
  const [variants, setVariants] = useState(resolved.preset?.generation.variantsPerEmotion ?? 1);
  const [showInfo, setShowInfo] = useState(false);
  const favoriteId = project.favorites[emotion.id];
  const selected =
    records.find((record) => record.id === selectedId) ?? records.find((record) => record.id === favoriteId) ?? records[0];
  const index = set.emotions.findIndex((item) => item.id === emotion.id);
  const previous = set.emotions[index - 1];
  const next = set.emotions[index + 1];
  const excluded = project.excludedEmotionIds.includes(emotion.id);
  const pending = queue.jobs.filter(
    (job) =>
      job.projectId === project.id && job.emotionId === emotion.id && ['queued', 'generating', 'retry_wait'].includes(job.status),
  ).length;
  const sharedCount = library.projects.filter((item) => item.emotionSetId === set.id).length;

  const newestId = records[0]?.id;
  useEffect(() => {
    setSelectedId(undefined);
  }, [newestId, emotion.id]);

  // 결과 목록에서 Ctrl·Shift 클릭이나 상자로 여러 장을 골라 한꺼번에 지운다.
  const removeMany = (ids: string[]) =>
    void deleteResults(
      project.id,
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
      // 여러 장을 고른 동안의 Esc는 선택만 푼다(useBoxSelection이 처리).
      if (event.key === 'Escape' && !pickedCount) openEmotion(undefined);
      const position = records.findIndex((record) => record.id === selected?.id);
      if (event.key === 'ArrowRight' && records[position + 1]) setSelectedId(records[position + 1].id);
      if (event.key === 'ArrowLeft' && position > 0) setSelectedId(records[position - 1].id);
      if (event.key === 'PageDown' && next) openEmotion(next.id);
      if (event.key === 'PageUp' && previous) openEmotion(previous.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [records, selected, next, previous, pickedCount]);

  const setFavorite = (generationId?: string) =>
    updateProject(project.id, (current) => {
      const favorites = { ...current.favorites };
      if (generationId) favorites[emotion.id] = generationId;
      else delete favorites[emotion.id];
      return { ...current, favorites };
    });


  return (
    <div className="emotion-detail">
      <div className="detail-nav">
        <button onClick={() => openEmotion(undefined)}>← 갤러리</button>
        <div className="header-spacer" />
        <button disabled={!previous} onClick={() => previous && openEmotion(previous.id)} title="PageUp">
          ‹ {previous?.name ?? '이전'}
        </button>
        <span className="detail-position">
          {index + 1} / {set.emotions.length}
        </span>
        <button disabled={!next} onClick={() => next && openEmotion(next.id)} title="PageDown">
          {next?.name ?? '다음'} ›
        </button>
      </div>

      <div className="detail-body">
        <section className="detail-stage">
          <div className="stage-image">
            {selected ? (
              <img src={projectMedia(project.id, selected.file)} alt={emotion.name} />
            ) : (
              <div className="stage-empty">
                <p>아직 생성된 이미지가 없습니다.</p>
                <p className="hint">오른쪽에서 프롬프트 입력 후 생성</p>
              </div>
            )}
            {pending > 0 && <span className="card-status busy stage-status">생성 대기 {pending}</span>}
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
                  <img src={projectMedia(project.id, record.thumbFile ?? record.file)} alt="" loading="lazy" />
                  {record.id === favoriteId && <span className="card-favorite">★</span>}
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
              <div className="header-spacer" />
              <button
                className="link-button"
                onClick={() => picking.selectAll(records.filter((record) => record.id !== favoriteId).map((record) => record.id))}
              >
                대표 빼고 모두 선택
              </button>
            </div>
          )}
        </section>

        <aside className="detail-side">
          <label className="stack-field">
            감정 이름
            <input value={emotion.name} onChange={(event) => patchEmotion(set.id, emotion.id, { name: event.target.value })} />
          </label>
          <label className="prompt-field">
            <span>
              감정 프롬프트
              <span className="prompt-field-tools">
                <em>캐릭터 프롬프트 뒤에 붙습니다</em>
                <ExpandTextButton
                  title={`${emotion.name} 감정 프롬프트`}
                  value={emotion.prompt}
                  placeholder="예: smile, happy, open mouth"
                  onApply={(prompt) => patchEmotion(set.id, emotion.id, { prompt })}
                />
              </span>
            </span>
            <PromptTextarea
              rows={5}
              value={emotion.prompt}
              placeholder="예: smile, happy, open mouth"
              onChange={(prompt) => patchEmotion(set.id, emotion.id, { prompt })}
            />
          </label>
          <p className="hint">
            감정 모음 "{set.name}"에 저장됩니다{sharedCount > 1 ? ` · 이 모음을 쓰는 작업 ${sharedCount}개에 함께 반영` : ''}.
          </p>
          <label className="toggle-field">
            <input
              type="checkbox"
              checked={!excluded}
              disabled={!emotion.prompt.trim()}
              onChange={(event) =>
                updateProject(project.id, (current) => ({
                  ...current,
                  excludedEmotionIds: event.target.checked
                    ? current.excludedEmotionIds.filter((id) => id !== emotion.id)
                    : [...current.excludedEmotionIds, emotion.id],
                }))
              }
            />
            <span>"선택 감정 생성"에 포함 (이 작업만)</span>
          </label>

          <div className="generate-row">
            <NumberField label="생성 수" value={variants} min={1} max={20} integer onChange={setVariants} />
            <button
              className="generate-button"
              disabled={!emotion.prompt.trim() || resolved.missing.length > 0}
              onClick={() => void generateEmotions(project.id, [emotion.id], { variants })}
            >
              ▶ 생성
            </button>
          </div>

          {selected && (
            <section className="detail-card">
              <div className="detail-card-head">
                <b>선택한 결과</b>
                <button className="link-button" onClick={() => setShowInfo((value) => !value)}>
                  {showInfo ? '정보 접기' : '생성 정보'}
                </button>
              </div>
              {showInfo && <RecordInfo projectId={project.id} record={selected} />}
              <div className="button-grid">
                <button
                  className={favoriteId === selected.id ? 'active' : ''}
                  onClick={() => setFavorite(favoriteId === selected.id ? undefined : selected.id)}
                >
                  {favoriteId === selected.id ? '★ 대표 해제' : '☆ 대표로 지정'}
                </button>
                <button
                  onClick={() =>
                    void run('이미지를 저장하는 중', async () => {
                      const saved = await fileApi().saveImageAs(
                        project.id,
                        selected.id,
                        emotion.name,
                        library.settings.export.quality,
                      );
                      if (saved) toast(`저장했습니다: ${saved}`);
                    })
                  }
                >
                  다른 이름으로 저장
                </button>
                <button
                  onClick={() => void generateEmotions(project.id, [emotion.id], { seed: selected.seed, variants: 1 })}
                  title="현재 프롬프트와 이 결과의 seed로 다시 생성"
                >
                  이 seed로 다시
                </button>
                <button
                  disabled={selected.emotionPrompt === emotion.prompt}
                  onClick={() => patchEmotion(set.id, emotion.id, { prompt: selected.emotionPrompt })}
                  title="이 결과를 만들 때의 감정 프롬프트로 되돌립니다"
                >
                  프롬프트 복원
                </button>
                <button
                  onClick={() =>
                    void run('폴더를 여는 중', () => libraryApi().showGeneration(project.id, selected.id))
                  }
                >
                  폴더에서 보기
                </button>
                <button className="danger-quiet" onClick={() => void deleteResults(project.id, [selected])}>
                  결과 삭제
                </button>
              </div>
            </section>
          )}

          <div className="detail-footer">
            <button
              onClick={() => {
                const copy = duplicateEmotionIn(set.id, emotion.id);
                if (copy) openEmotion(copy);
              }}
            >
              감정 복제
            </button>
            <button className="danger-quiet" onClick={() => void deleteEmotion(set.id, emotion, project.id)}>
              감정 삭제
            </button>
          </div>
          <p className="hint">←/→ 결과 이동 · PageUp/PageDown 감정 이동 · Esc 갤러리</p>
        </aside>
      </div>
    </div>
  );
}
