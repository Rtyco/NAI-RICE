import { useMemo, useState } from 'react';
import type { ExportFormat } from '../../core/domain/types';
import type { ResolvedProject } from '../../core/model/defaults';
import {
  DEFAULT_EXPORT_FILENAME_TEMPLATE,
  EXPORT_FILENAME_TOKENS,
  renderExportFilename,
  validateOutputFilenameTemplate,
} from '../../core/output/OutputFilename';
import {
  coverRecord,
  emotionRecords,
  projectMedia,
  run,
  toast,
  updateLibrary,
  useLibrary,
  useStore,
} from '../store';
import { Modal } from './Dialogs';
import { NumberField, SelectField } from './ui';
import { fileApi } from '../desktop';

/** RisuAI 감정 이미지 업로드용. 감정마다 대표(또는 최신) 이미지 하나. */
export function ExportDialog({
  resolved,
  close,
}: {
  resolved: ResolvedProject;
  close: () => void;
}) {
  const { project } = resolved;
  const emotions = useMemo(() => resolved.emotionSet?.emotions ?? [], [resolved.emotionSet]);
  const settings = useLibrary().settings;
  const records = useStore((state) => state.generations[project.id]);
  const [format, setFormat] = useState<ExportFormat>(settings.export.format);
  const [quality, setQuality] = useState(settings.export.quality);
  const [target, setTarget] = useState(settings.export.target);
  const [mode, setMode] = useState<'folder' | 'zip'>('folder');
  const [filenameTemplate, setFilenameTemplate] = useState(settings.export.filenameTemplate);
  const templateError = validateOutputFilenameTemplate(
    filenameTemplate,
    Object.keys(EXPORT_FILENAME_TOKENS),
  );

  const candidates = useMemo(
    () =>
      emotions
        .map((emotion, index) => ({
          emotion,
          number: index + 1,
          record: coverRecord(
            emotionRecords(records, emotion.id),
            project.favorites[emotion.id],
            target,
          ),
        }))
        .filter((item) => item.record),
    [emotions, project.favorites, records, target],
  );
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const selected = candidates.filter((item) => !excluded.has(item.emotion.id));
  const missing = emotions.length - candidates.length;
  const fileName = (item: (typeof candidates)[number]) =>
    renderExportFilename(filenameTemplate, {
      emotion: item.emotion.name,
      number: item.number,
      total: emotions.length,
      character: item.record!.characterName,
      project: project.name,
      seed: item.record!.seed,
      model: item.record!.model,
      createdAt: item.record!.createdAt,
    });

  const submit = () =>
    void run('이미지를 내보내는 중', async () => {
      updateLibrary((current) => ({
        ...current,
        settings: { ...current.settings, export: { format, quality, target, filenameTemplate } },
      }));
      const result = await fileApi().exportImages({
        projectId: project.id,
        name: project.name,
        items: selected.map((item) => ({ generationId: item.record!.id, name: fileName(item) })),
        format,
        quality,
        mode,
      });
      if (result) {
        toast(`${result.count}개 이미지를 내보냈습니다: ${result.path}`);
        close();
      }
    });

  return (
    <Modal
      title={`씬 이미지 내보내기 · ${project.name}`}
      onClose={close}
      wide
      footer={
        <>
          <button onClick={close}>취소</button>
          <button
            className="accent"
            disabled={!selected.length || !!templateError}
            onClick={submit}
          >
            {selected.length}개 내보내기
          </button>
        </>
      }
    >
      <div className="four-column-fields">
        <SelectField
          label="형식"
          value={format}
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'webp', label: 'WebP' },
            { value: 'avif', label: 'AVIF' },
          ]}
          onChange={setFormat}
        />
        <NumberField label="품질" value={quality} min={1} max={100} integer onChange={setQuality} />
        <SelectField
          label="사용할 이미지"
          value={target}
          options={[
            { value: 'favorite', label: '대표 (없으면 최신)' },
            { value: 'latest', label: '최신 생성본' },
          ]}
          onChange={setTarget}
        />
        <SelectField
          label="저장 방식"
          value={mode}
          options={[
            { value: 'folder', label: '폴더' },
            { value: 'zip', label: 'ZIP 파일' },
          ]}
          onChange={setMode}
        />
      </div>
      <p className="hint">{format === 'png' ? '메타데이터 포함' : '메타데이터 없음'}</p>
      <label className="stack-field">
        파일 이름
        <input
          className="template-input"
          value={filenameTemplate}
          spellCheck={false}
          onChange={(event) => setFilenameTemplate(event.target.value)}
        />
      </label>
      <div className="token-picker">
        {Object.entries(EXPORT_FILENAME_TOKENS).map(([token, label]) => (
          <button
            key={token}
            type="button"
            title={label}
            onClick={() => setFilenameTemplate(`${filenameTemplate}${token}`)}
          >
            {token}
          </button>
        ))}
        <button
          type="button"
          className="link-button"
          onClick={() => setFilenameTemplate(DEFAULT_EXPORT_FILENAME_TEMPLATE)}
        >
          기본값
        </button>
      </div>
      {templateError ? (
        <p className="field-error">{templateError}</p>
      ) : (
        selected[0] && (
          <p className="hint">
            미리보기:{' '}
            <code>
              {fileName(selected[0])}.{format}
            </code>
            {selected.length > 1 && ` 외 ${selected.length - 1}개`}
          </p>
        )
      )}
      {missing > 0 && <p className="hint">결과 없는 씬 {missing}개 제외</p>}
      <div className="export-grid">
        {candidates.map(({ emotion, record }) => (
          <label
            key={emotion.id}
            className={`export-item ${excluded.has(emotion.id) ? 'off' : ''}`}
          >
            <input
              type="checkbox"
              checked={!excluded.has(emotion.id)}
              onChange={(event) =>
                setExcluded((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.delete(emotion.id);
                  else next.add(emotion.id);
                  return next;
                })
              }
            />
            <img src={projectMedia(project.id, record!.thumbFile ?? record!.file)} alt="" />
            <span>{emotion.name}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
