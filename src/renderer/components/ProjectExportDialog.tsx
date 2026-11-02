import { useEffect, useMemo, useState } from 'react';
import type { ExportScope, Project } from '../../core/domain/types';
import type { PackageImageFormat } from '../../shared/ipc';
import { fileApi } from '../desktop';
import { EXPORT_SCOPES, exportPicks } from '../exportPicks';
import { loadGenerations, run, toast, useLibrary, useResolvedProject, useStore } from '../store';
import { Modal } from './Dialogs';
import { ExportPickGrid } from './ExportPickGrid';
import { NumberField, SelectField } from './ui';

type PackageScope = ExportScope | 'none';

const SCOPES: Array<{ id: PackageScope; label: string }> = [
  { id: 'none', label: '이미지 없이' },
  ...EXPORT_SCOPES,
];

export function ProjectExportDialog({ project, close }: { project: Project; close: () => void }) {
  const library = useLibrary();
  const resolved = useResolvedProject(project.id);
  const records = useStore((state) => state.generations[project.id]);
  useEffect(() => {
    if (!records) void loadGenerations(project.id);
  }, [records, project.id]);
  const [scope, setScope] = useState<PackageScope>(library.settings.export.scope);
  const [target, setTarget] = useState(library.settings.export.target);
  const [imageFormat, setImageFormat] = useState<PackageImageFormat>('original');
  const [quality, setQuality] = useState(library.settings.export.quality);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const emotions = useMemo(() => resolved?.emotionSet?.emotions ?? [], [resolved?.emotionSet]);
  const picksOf = useMemo(
    () =>
      Object.fromEntries(
        EXPORT_SCOPES.map((choice) => [
          choice.id,
          exportPicks(emotions, records, project.favorites, target, choice.id),
        ]),
      ),
    [emotions, project.favorites, records, target],
  );
  const candidates = scope === 'none' ? [] : picksOf[scope];
  const selected = candidates.filter((item) => !excluded.has(item.key));

  const submit = () =>
    void run('작업을 내보내는 중', async () => {
      const saved =
        scope === 'none'
          ? await fileApi().exportProject(library, project.id)
          : await fileApi().exportProjectPackage({
              library,
              projectId: project.id,
              generationIds: selected.map((item) => item.record.id),
              imageFormat,
              quality,
            });
      if (!saved) return;
      toast(
        scope === 'none'
          ? `저장했습니다: ${saved}`
          : `결과 ${selected.length}장을 넣어 저장했습니다: ${saved}`,
      );
      close();
    });

  return (
    <Modal
      title={`작업 내보내기 · ${project.name}`}
      onClose={close}
      wide
      footer={
        <>
          <button onClick={close}>취소</button>
          <button
            className="accent"
            disabled={scope !== 'none' && !selected.length}
            onClick={submit}
          >
            {scope === 'none' ? '내보내기' : `${selected.length}장 넣어 내보내기`}
          </button>
        </>
      }
    >
      <div className="segmented full" role="group" aria-label="넣을 이미지">
        {SCOPES.map((choice) => (
          <button
            key={choice.id}
            className={choice.id === scope ? 'active' : ''}
            aria-pressed={choice.id === scope}
            onClick={() => setScope(choice.id)}
          >
            {choice.label}
            {choice.id !== 'none' && <small> {picksOf[choice.id].length}</small>}
          </button>
        ))}
      </div>
      {scope !== 'none' && (
        <>
          <div className="four-column-fields">
            <SelectField
              label="이미지 형식"
              value={imageFormat}
              options={[
                { value: 'original', label: '저장된 형식 그대로' },
                { value: 'png', label: 'PNG' },
                { value: 'webp', label: 'WebP' },
              ]}
              onChange={setImageFormat}
            />
            {imageFormat === 'webp' && (
              <NumberField
                label="품질"
                value={quality}
                min={1}
                max={100}
                integer
                onChange={setQuality}
              />
            )}
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
          </div>
          {!records && <p className="hint">생성 기록을 불러오는 중…</p>}
          <ExportPickGrid
            projectId={project.id}
            picks={candidates}
            excluded={excluded}
            onExcludedChange={setExcluded}
            showCombo={scope !== 'scene'}
          />
        </>
      )}
    </Modal>
  );
}
