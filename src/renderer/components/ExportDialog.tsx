import { useMemo, useState } from 'react';
import type { ExportFormat, ExportScope } from '../../core/domain/types';
import type { ResolvedProject } from '../../core/model/defaults';
import {
  DEFAULT_EXPORT_FILENAME_TEMPLATE,
  EXPORT_FILENAME_TOKENS,
  renderExportFilename,
  validateOutputFilenameTemplate,
} from '../../core/output/OutputFilename';
import { EXPORT_SCOPES, exportPicks, type ExportPick } from '../exportPicks';
import { projectMedia, run, toast, updateLibrary, useLibrary, useStore } from '../store';
import { Modal } from './Dialogs';
import { NumberField, SelectField, TemplateField } from './ui';
import { fileApi } from '../desktop';

/** 씬마다 한 장은 RisuAI 감정 이미지 업로드용이다. */
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
  const [scope, setScope] = useState<ExportScope>(settings.export.scope);
  const [mode, setMode] = useState<'folder' | 'zip'>('folder');
  const [filenameTemplate, setFilenameTemplate] = useState(settings.export.filenameTemplate);
  const templateError = validateOutputFilenameTemplate(
    filenameTemplate,
    Object.keys(EXPORT_FILENAME_TOKENS),
  );

  const counts = useMemo(
    () =>
      Object.fromEntries(
        EXPORT_SCOPES.map((choice) => [
          choice.id,
          exportPicks(emotions, records, project.favorites, target, choice.id),
        ]),
      ) as Record<ExportScope, ExportPick[]>,
    [emotions, project.favorites, records, target],
  );
  const candidates = counts[scope];
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const selected = candidates.filter((item) => !excluded.has(item.key));
  const missing = emotions.filter(
    (emotion) => !candidates.some((item) => item.emotion.id === emotion.id),
  ).length;
  const namesCombo =
    filenameTemplate.includes('{combo}') || filenameTemplate.includes('{comboNumber}');
  // 씬 하나에서 여러 장이 나가면 이름이 겹치지 않게 조합 이름을 붙인다.
  const template =
    scope === 'scene' || namesCombo ? filenameTemplate : `${filenameTemplate}_{combo}`;
  const fileName = (item: ExportPick) =>
    renderExportFilename(template, {
      emotion: item.emotion.name,
      number: item.number,
      total: emotions.length,
      character: item.record.characterName,
      project: project.name,
      seed: item.record.seed,
      model: item.record.model,
      createdAt: item.record.createdAt,
      combo: scope === 'scene' ? undefined : item.record.comboName,
      comboNumber: scope === 'scene' ? undefined : item.comboNumber,
    });

  const submit = () =>
    void run('이미지를 내보내는 중', async () => {
      updateLibrary((current) => ({
        ...current,
        settings: {
          ...current.settings,
          export: { format, quality, target, scope, filenameTemplate },
        },
      }));
      const result = await fileApi().exportImages({
        projectId: project.id,
        name: project.name,
        items: selected.map((item) => ({ generationId: item.record.id, name: fileName(item) })),
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
      <div className="segmented full" role="group" aria-label="내보낼 이미지">
        {EXPORT_SCOPES.map((choice) => (
          <button
            key={choice.id}
            className={choice.id === scope ? 'active' : ''}
            aria-pressed={choice.id === scope}
            onClick={() => setScope(choice.id)}
          >
            {choice.label} <small>{counts[choice.id].length}</small>
          </button>
        ))}
      </div>
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
          disabled={scope === 'all'}
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
      <TemplateField
        label="파일 이름"
        value={filenameTemplate}
        tokens={Object.entries(EXPORT_FILENAME_TOKENS)}
        initial={DEFAULT_EXPORT_FILENAME_TEMPLATE}
        onChange={setFilenameTemplate}
      />
      {scope !== 'scene' && !namesCombo && (
        <p className="hint">조합 칸이 있는 씬은 파일 이름 뒤에 조합 이름을 붙입니다.</p>
      )}
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
        {candidates.map(({ key, emotion, record }) => (
          <label key={key} className={`export-item ${excluded.has(key) ? 'off' : ''}`}>
            <input
              type="checkbox"
              checked={!excluded.has(key)}
              onChange={(event) =>
                setExcluded((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
            />
            <img
              src={projectMedia(project.id, record.thumbFile ?? record.file)}
              alt=""
              loading="lazy"
            />
            <span>{emotion.name}</span>
            {scope !== 'scene' && record.comboName && <small>{record.comboName}</small>}
          </label>
        ))}
      </div>
    </Modal>
  );
}
