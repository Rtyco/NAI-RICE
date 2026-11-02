import { useEffect, useMemo, useState } from 'react';
import { exportSDStudioProject } from '../../core/backup/SDStudioFiles';
import type { ExportScope, Project } from '../../core/domain/types';
import type { PackageImageFormat } from '../../shared/ipc';
import { fileApi } from '../desktop';
import { EXPORT_SCOPES, EXPORT_TARGETS, exportPicksByScope } from '../exportPicks';
import { loadGenerations, run, toast, useLibrary, useResolvedProject, useStore } from '../store';
import { Modal } from './Dialogs';
import { ExportPickGrid } from './ExportPickGrid';
import { NumberField, SelectField } from './ui';

type PackageScope = ExportScope | 'none';

const SCOPES: Array<{ id: PackageScope; label: string }> = [
  { id: 'none', label: '이미지 없이' },
  ...EXPORT_SCOPES,
];

export type ProjectExportFormat = 'rice' | 'sdstudio';

export function ProjectExportDialog({
  project,
  format,
  close,
}: {
  project: Project;
  format: ProjectExportFormat;
  close: () => void;
}) {
  const library = useLibrary();
  const resolved = useResolvedProject(project.id);
  const records = useStore((state) => state.generations[project.id]);
  useEffect(() => {
    if (!records) void loadGenerations(project.id);
  }, [records, project.id]);
  const [scope, setScope] = useState<PackageScope>(library.settings.export.scope);
  const [target, setTarget] = useState(library.settings.export.target);
  // SD Studio는 PNG의 NovelAI 텍스트로 생성 정보를 읽는다.
  const [imageFormat, setImageFormat] = useState<PackageImageFormat>(
    format === 'sdstudio' ? 'png' : 'original',
  );
  const [quality, setQuality] = useState(library.settings.export.quality);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const emotions = useMemo(() => resolved?.emotionSet?.emotions ?? [], [resolved?.emotionSet]);
  const picksOf = useMemo(
    () => exportPicksByScope(emotions, records, project.favorites, target),
    [emotions, project.favorites, records, target],
  );
  const candidates = scope === 'none' ? [] : picksOf[scope];
  const selected = candidates.filter((item) => !excluded.has(item.key));

  const generationIds = selected.map((item) => item.record.id);

  const save = async (): Promise<{ saved: string | null; omitted: string[] }> => {
    if (format === 'rice') {
      const saved =
        scope === 'none'
          ? await fileApi().exportProject(library, project.id)
          : await fileApi().exportProjectPackage({
              library,
              projectId: project.id,
              generationIds,
              imageFormat,
              quality,
            });
      return { saved, omitted: [] };
    }
    const { file, omitted, sceneNames } = exportSDStudioProject(project, library);
    const saved =
      scope === 'none'
        ? await fileApi().saveJsonFile(
            file,
            `${project.name} (SD Studio).json`,
            'SD Studio 프로젝트로 내보내기',
          )
        : await fileApi().exportSDStudioPackage({
            project: file,
            sceneNames,
            favorites: project.favorites,
            projectId: project.id,
            name: project.name,
            generationIds,
            imageFormat,
            quality,
          });
    return { saved, omitted };
  };

  const submit = () =>
    void run('작업을 내보내는 중', async () => {
      const { saved, omitted } = await save();
      if (!saved) return;
      toast(
        [
          scope === 'none'
            ? `저장했습니다: ${saved}`
            : `결과 ${selected.length}장을 넣어 저장했습니다: ${saved}`,
          ...omitted,
        ].join(' '),
      );
      close();
    });

  return (
    <Modal
      title={`${format === 'rice' ? '작업 내보내기' : 'SD Studio 프로젝트로 내보내기'} · ${project.name}`}
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
              options={EXPORT_TARGETS}
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
