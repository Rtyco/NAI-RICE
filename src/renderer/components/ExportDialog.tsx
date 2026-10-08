import { useMemo, useState } from 'react';
import type { ExportFormat } from '../../core/domain/types';
import type { ResolvedProject } from '../../core/model/defaults';
import { coverRecord, emotionRecords, projectMedia, run, toast, updateLibrary, useLibrary, useStore } from '../store';
import { Modal } from './Dialogs';
import { NumberField, SelectField } from './ui';
import { fileApi, libraryApi } from '../desktop';

/** 감정마다 대표(또는 최신) 이미지 하나를 감정 이름 파일로 내보낸다. RisuAI 감정 이미지 업로드용. */
export function ExportDialog({ resolved, close }: { resolved: ResolvedProject; close: () => void }) {
  const { project } = resolved;
  const emotions = useMemo(() => resolved.emotionSet?.emotions ?? [], [resolved.emotionSet]);
  const settings = useLibrary().settings;
  const records = useStore((state) => state.generations[project.id]);
  const [format, setFormat] = useState<ExportFormat>(settings.export.format);
  const [quality, setQuality] = useState(settings.export.quality);
  const [target, setTarget] = useState(settings.export.target);
  const [mode, setMode] = useState<'folder' | 'zip'>('folder');

  const candidates = useMemo(
    () =>
      emotions
        .map((emotion) => ({
          emotion,
          record: coverRecord(emotionRecords(records, emotion.id), project.favorites[emotion.id], target),
        }))
        .filter((item) => item.record),
    [emotions, project.favorites, records, target],
  );
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const selected = candidates.filter((item) => !excluded.has(item.emotion.id));
  const missing = emotions.length - candidates.length;

  const submit = () =>
    void run('이미지를 내보내는 중', async () => {
      updateLibrary((current) => ({ ...current, settings: { ...current.settings, export: { format, quality, target } } }));
      const result = await fileApi().exportImages({
        projectId: project.id,
        name: project.name,
        items: selected.map((item) => ({ generationId: item.record!.id, name: item.emotion.name })),
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
      title={`감정 이미지 내보내기 · ${project.name}`}
      onClose={close}
      wide
      footer={
        <>
          <span className="hint">파일 이름 = 감정 이름 (예: 기쁨.{format})</span>
          <button onClick={close}>취소</button>
          <button className="accent" disabled={!selected.length} onClick={submit}>
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
        <NumberField
          label="품질"
          value={quality}
          min={1}
          max={100}
          integer
          onChange={setQuality}
        />
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
      <p className="hint">
        {format === 'png' ? 'PNG: 프롬프트·설정 메타데이터 포함' : 'WebP·AVIF: 메타데이터 없음'} · 원본은{' '}
        <button
          className="link-button"
          onClick={() =>
            void run('폴더를 여는 중', () =>
              libraryApi().openInExplorer({ kind: 'outputs', projectId: project.id }),
            )
          }
        >
          결과 폴더
        </button>
        에 있습니다
      </p>
      {missing > 0 && <p className="hint">결과 없는 감정 {missing}개 제외</p>}
      <div className="export-grid">
        {candidates.map(({ emotion, record }) => (
          <label key={emotion.id} className={`export-item ${excluded.has(emotion.id) ? 'off' : ''}`}>
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
