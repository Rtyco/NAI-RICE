import { projectsUsing } from '../../../core/model/defaults';
import { openProject, useLibrary, type LibrarySection } from '../../store';
import { sectionInfo } from '../../sections';

export function UsedBy({ section, id }: { section: LibrarySection; id: string }) {
  const library = useLibrary();
  const kind = sectionInfo(section).kind as Exclude<
    ReturnType<typeof sectionInfo>['kind'],
    'project'
  >;
  const projects = projectsUsing(library, kind, id);
  if (!projects.length) return <p className="hint">이 항목을 사용 중인 작업이 없습니다.</p>;
  return (
    <div className="used-by">
      <span>사용 중인 작업</span>
      {projects.map((project) => (
        <button key={project.id} className="chip" onClick={() => openProject(project.id)}>
          {project.name}
        </button>
      ))}
    </div>
  );
}
