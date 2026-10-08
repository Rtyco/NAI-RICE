import { projectsUsing } from '../../../core/model/defaults';
import { openProject, useLibrary, type LibrarySection } from '../../store';
import { LABELS } from './itemActions';

export function UsedBy({ section, id }: { section: LibrarySection; id: string }) {
  const library = useLibrary();
  const projects = projectsUsing(library, LABELS[section].kind, id);
  if (!projects.length) return <p className="hint">아직 이 항목을 쓰는 작업이 없습니다.</p>;
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
