import { useState } from 'react';
import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Library, Project } from '../../core/domain/types';
import {
  createCharacter,
  createEmotionSet,
  createProject,
  createReference,
  DEFAULT_EMOTIONS,
} from '../../core/model/defaults';
import { isActive } from '../../core/jobs/JobLifecycle';
import {
  groupIntoFolder,
  listRows,
  moveIntoFolder,
  moveNextTo,
  newFolderName,
  renameFolder,
  setFolder,
  ungroupFolder,
} from '../../core/model/folders';
import {
  deleteProject,
  deleteProjects,
  duplicateProject,
  exportProjectFile,
  openProjectFolder,
} from '../projectOps';
import { SECTIONS } from '../sections';
import { sidebarStageOf, useLayout } from '../layout';
import {
  openFree,
  openLibrary,
  openProject,
  referenceMedia,
  toggleFolder,
  toggleSidebarSection,
  updateLibrary,
  updateProject,
  useLibrary,
  useStore,
  type SidebarSection,
} from '../store';
import { Modal } from './Dialogs';
import { openDialog } from './dialogStack';
import { Icon, type IconName } from './Icon';
import { useBoxSelection } from './useBoxSelection';
import { dragPayload } from './listDrag';
import { IconFolder, ListFolder } from './ListFolder';
import { ListRow } from './ListRow';
import { folderKey, useFoldedFolders, useGroupTarget } from './listFolders';

const NEW = '__new__';
const DRAG_TYPE = 'application/x-project';

function PartSelect(props: {
  label: string;
  value: string;
  items: Array<{ id: string; name: string }>;
  newLabel?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="stack-field">
      {props.label}
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
        {props.newLabel && <option value={NEW}>＋ {props.newLabel}</option>}
      </select>
    </label>
  );
}

export function NewProjectDialog({ close }: { close: () => void }) {
  const library = useLibrary();
  const [name, setName] = useState('');
  const [presetId, setPresetId] = useState(library.presets[0].id);
  const [characterId, setCharacterId] = useState(library.characters[0]?.id ?? NEW);
  const [emotionSetId, setEmotionSetId] = useState(library.emotionSets[0]?.id ?? NEW);
  const [referenceId, setReferenceId] = useState(library.references[0]?.id ?? NEW);

  const create = () => {
    const label = name.trim() || '새 작업';
    const character =
      characterId === NEW
        ? createCharacter(label)
        : library.characters.find((item) => item.id === characterId)!;
    const emotionSet =
      emotionSetId === NEW
        ? createEmotionSet(`${label} 씬`, DEFAULT_EMOTIONS)
        : library.emotionSets.find((item) => item.id === emotionSetId)!;
    const reference =
      referenceId === NEW
        ? createReference(label)
        : library.references.find((item) => item.id === referenceId)!;
    const project = createProject(label, {
      presetId,
      character,
      emotionSetId: emotionSet.id,
      referenceId: reference.id,
    });
    updateLibrary((current) => ({
      ...current,
      characters: characterId === NEW ? [...current.characters, character] : current.characters,
      emotionSets:
        emotionSetId === NEW ? [...current.emotionSets, emotionSet] : current.emotionSets,
      references: referenceId === NEW ? [...current.references, reference] : current.references,
      projects: [...current.projects, project],
    }));
    openProject(project.id);
    close();
  };

  return (
    <Modal
      title="새 작업"
      onClose={close}
      footer={
        <>
          <button onClick={close}>취소</button>
          <button className="accent" onClick={create}>
            만들기
          </button>
        </>
      }
    >
      <label className="stack-field">
        작업 이름
        <input
          autoFocus
          value={name}
          placeholder="예: 아리아 기본 의상"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="chain-form">
        <PartSelect
          label="① 생성 설정"
          value={presetId}
          items={library.presets}
          onChange={setPresetId}
        />
        <PartSelect
          label="② 캐릭터"
          value={characterId}
          items={library.characters}
          newLabel="새 캐릭터"
          onChange={setCharacterId}
        />
        <PartSelect
          label="③ 씬 모음"
          value={emotionSetId}
          items={library.emotionSets}
          newLabel="새 씬 모음 (기본 6종)"
          onChange={setEmotionSetId}
        />
        <PartSelect
          label="④ 인페인트"
          value={referenceId}
          items={library.references}
          newLabel="새 인페인트"
          onChange={setReferenceId}
        />
      </div>
    </Modal>
  );
}

function projectAvatar(library: Library, project: Project): string | undefined {
  const reference = library.references.find((item) => item.id === project.referenceId);
  return reference?.image
    ? referenceMedia(reference.id, reference.image.originalFile, reference.updatedAt)
    : undefined;
}

function projectSubtitle(library: Library, project: Project): string {
  const characterId = project.characters[0]?.characterId;
  return library.characters.find((item) => item.id === characterId)?.name ?? '캐릭터 없음';
}

/** 프롬프트를 고칠 때마다 사이드바를 다시 그리지 않도록 값이 같으면 그대로 둔다. */
function useProjectInfo<T>(describe: (library: Library, project: Project) => T): Record<string, T> {
  return useStore(
    useShallow((state) =>
      Object.fromEntries(
        state.library!.projects.map((project) => [project.id, describe(state.library!, project)]),
      ),
    ),
  );
}

function SectionTitle(props: {
  section: SidebarSection;
  icon: IconName;
  label: string;
  title: string;
  narrow: boolean;
  folded: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="sidebar-section-title">
      <button
        className={props.narrow ? 'sidebar-section-toggle narrow' : 'sidebar-section-toggle'}
        aria-expanded={!props.folded}
        aria-label={props.narrow ? props.label : undefined}
        title={`${props.title} · ${props.folded ? '펼치기' : '접기'}`}
        onClick={() => toggleSidebarSection(props.section)}
      >
        {props.narrow ? (
          <>
            <Icon name={props.icon} />
            <Icon name="chevron" size={10} className="section-chevron" />
          </>
        ) : (
          <>
            <Icon name="chevron" size={12} className="section-chevron" />
            <Icon name={props.icon} />
            <b>{props.label}</b>
          </>
        )}
      </button>
      {props.children}
    </div>
  );
}

export function Sidebar() {
  const projects = useStore((state) => state.library!.projects);
  const avatars = useProjectInfo(projectAvatar);
  const subtitles = useProjectInfo(projectSubtitle);
  const counts = useStore(
    useShallow((state) =>
      SECTIONS.map((section) => (state.library![section.key] as unknown[]).length),
    ),
  );
  const view = useStore((state) => state.view);
  const queue = useStore((state) => state.queue);
  // 숨김 단계에서도 펼친 모습으로 그려 둬야 가장자리 보기가 그대로 보여 준다.
  const collapsed = useLayout((state) => sidebarStageOf(state) === 'icons');
  const sections = useStore((state) => state.sidebarSections);
  const projectsFolded = sections.projects;
  const libraryFolded = sections.library;

  const active = new Map<string, number>();
  for (const job of queue.jobs) {
    if (isActive(job.status)) {
      active.set(job.projectId, (active.get(job.projectId) ?? 0) + 1);
    }
  }
  const newProject = () => void openDialog((close) => <NewProjectDialog close={close} />);
  const [dragging, setDragging] = useState<string[]>([]);
  const removeMany = (ids: string[]) =>
    void deleteProjects(projects.filter((project) => ids.includes(project.id)));
  const rows = listRows(projects);
  const isFolded = useFoldedFolders('projects');
  const selection = useBoxSelection<HTMLElement>(
    rows.flatMap((row) =>
      row.kind === 'item'
        ? [row.item.id]
        : isFolded(row.name)
          ? []
          : row.items.map((item) => item.id),
    ),
    removeMany,
  );
  const [renamingFolder, setRenamingFolder] = useState<string>();
  const group = (ids: string[]) => {
    const name = newFolderName(useStore.getState().library!.projects);
    updateLibrary((current) => groupIntoFolder(current, 'projects', ids, name));
    toggleFolder(folderKey('projects', name), false);
    selection.clear();
    setRenamingFolder(name);
  };
  const touch = useGroupTarget({
    picked: () => (collapsed ? [] : [...selection.selected]),
    current: () => (!collapsed && view.kind === 'project' ? view.projectId : undefined),
    group,
  });

  const renderProject = (project: Project) => {
    const picked = !collapsed && selection.isSelected(project.id);
    const busy = active.get(project.id);
    const avatar = avatars[project.id];
    return (
      <ListRow
        key={project.id}
        project
        id={project.id}
        name={project.name}
        avatar={
          <span className="avatar">
            {avatar ? <img src={avatar} alt="" draggable={false} /> : project.name.slice(0, 1)}
          </span>
        }
        subtitle={subtitles[project.id]}
        badge={busy ? <span className="pill busy">{busy}</span> : null}
        renameLabel="작업 이름"
        deleteTitle="작업 삭제"
        collapsed={collapsed}
        active={view.kind === 'project' && view.projectId === project.id}
        dragType={DRAG_TYPE}
        dragging={dragging.includes(project.id)}
        startDrag={(id) => {
          const payload = dragPayload(
            id,
            selection.selected,
            projects.map((item) => item.id),
          );
          setDragging(payload.ids);
          return payload;
        }}
        endDrag={() => setDragging([])}
        dropHere={(payload) =>
          updateLibrary((current) =>
            moveNextTo(
              current,
              'projects',
              payload.ids,
              payload.grabbed,
              project.id,
              Boolean(payload.folder),
            ),
          )
        }
        picked={picked}
        onPick={(event) => selection.clickItem(event, project.id)}
        open={() => openProject(project.id)}
        rename={(name) => updateProject(project.id, (current) => ({ ...current, name }))}
        remove={() => void deleteProject(project)}
        menu={{
          duplicate: () => duplicateProject(project),
          exports: [
            {
              label: 'SD Studio 프로젝트로 내보내기',
              accessKey: 'S',
              onSelect: () => exportProjectFile(project, 'sdstudio'),
            },
            {
              label: 'NAI RICE 작업 파일로 내보내기',
              accessKey: 'R',
              onSelect: () => exportProjectFile(project, 'rice'),
            },
          ],
          folder: () => openProjectFolder(project.id),
          pickedCount: selection.selected.size,
          removePicked: () => removeMany([...selection.selected]),
          group: () => group(picked ? [...selection.selected] : [project.id]),
          ungroup: project.folder
            ? () =>
                updateLibrary((current) => setFolder(current, 'projects', [project.id], undefined))
            : undefined,
        }}
      />
    );
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <section className="sidebar-card free-card">
        <nav className="library-nav" aria-label="자유 생성">
          <button
            title={collapsed ? '자유 생성' : undefined}
            className={view.kind === 'free' ? 'active' : ''}
            onClick={openFree}
          >
            <Icon name="sparkle" />
            {!collapsed && (
              <span className="library-nav-text">
                <b>자유 생성</b>
              </span>
            )}
          </button>
        </nav>
      </section>

      <section className={`sidebar-card grow ${projectsFolded ? 'folded' : ''}`}>
        <SectionTitle
          section="projects"
          icon="project"
          label="작업"
          title="작업 (1) · 다음 작업 (Ctrl+Tab)"
          narrow={collapsed}
          folded={projectsFolded}
        >
          {!collapsed && (
            <button className="icon-button" title="새 작업 (Ctrl+N)" onClick={newProject}>
              <Icon name="plus" />
            </button>
          )}
        </SectionTitle>
        <div className="sidebar-card-body">
          <nav
            className={`project-list ${collapsed ? '' : 'selectable'}`}
            aria-label="작업 목록"
            {...(collapsed ? {} : selection.containerProps)}
            onPointerDownCapture={touch}
          >
            {collapsed
              ? rows.map((row) =>
                  row.kind === 'item' ? (
                    renderProject(row.item)
                  ) : (
                    <IconFolder
                      key={`folder:${row.name}`}
                      scope="projects"
                      name={row.name}
                      count={row.items.length}
                      unit="작업"
                      folded={isFolded(row.name)}
                      itemClass="project-item"
                    >
                      {row.items.map(renderProject)}
                    </IconFolder>
                  ),
                )
              : rows.map((row) =>
                  row.kind === 'item' ? (
                    renderProject(row.item)
                  ) : (
                    <ListFolder
                      key={`folder:${row.name}`}
                      scope="projects"
                      name={row.name}
                      count={row.items.length}
                      dragType={DRAG_TYPE}
                      renaming={renamingFolder === row.name}
                      setRenaming={(on) => setRenamingFolder(on ? row.name : undefined)}
                      onRename={(name) => {
                        toggleFolder(folderKey('projects', name), isFolded(row.name));
                        updateLibrary((current) =>
                          renameFolder(current, 'projects', row.name, name),
                        );
                      }}
                      onUngroup={() =>
                        updateLibrary((current) => ungroupFolder(current, 'projects', row.name))
                      }
                      onPickAll={() => selection.selectAll(row.items.map((item) => item.id))}
                      startDrag={() => {
                        const ids = row.items.map((item) => item.id);
                        setDragging(ids);
                        return { ids, grabbed: ids[0], folder: row.name };
                      }}
                      endDrag={() => setDragging([])}
                      onDrop={(payload) =>
                        updateLibrary((current) =>
                          payload.folder
                            ? moveNextTo(
                                current,
                                'projects',
                                payload.ids,
                                payload.grabbed,
                                row.items[0].id,
                                true,
                              )
                            : moveIntoFolder(current, 'projects', payload.ids, row.name),
                        )
                      }
                    >
                      {row.items.map(renderProject)}
                    </ListFolder>
                  ),
                )}
            {collapsed && (
              <button className="project-item add" title="새 작업 (Ctrl+N)" onClick={newProject}>
                <span className="avatar">
                  <Icon name="plus" />
                </span>
              </button>
            )}
            {!projects.length && !collapsed && <p className="hint pad-x">아직 작업이 없습니다.</p>}
            {!collapsed && selection.boxElement}
          </nav>
          {!collapsed && selection.selected.size > 0 && (
            <div className="selection-bar">
              <span className="selection-count">
                {selection.selected.size}개<span className="bar-label"> 선택</span>
              </span>
              <button
                className="with-icon"
                title="새 폴더로 묶기 (Ctrl+G)"
                onClick={() => group([...selection.selected])}
              >
                <Icon name="folder" size={14} />
                <span className="bar-label">묶기</span>
              </button>
              <button
                className="with-icon danger-quiet"
                title="고른 작업 삭제"
                onClick={() => removeMany([...selection.selected])}
              >
                <Icon name="trash" size={14} />
                <span className="bar-label">삭제</span>
              </button>
              <button
                className="link-button with-icon"
                title="선택 취소 (Esc)"
                onClick={selection.clear}
              >
                <Icon name="close" size={14} />
                <span className="bar-label">선택 취소</span>
              </button>
            </div>
          )}
        </div>
      </section>

      <section className={`sidebar-card ${libraryFolded ? 'folded' : ''}`}>
        <SectionTitle
          section="library"
          icon="storage"
          label="라이브러리"
          title="생성 설정·캐릭터·씬 모음·인페인트 보관함"
          narrow={collapsed}
          folded={libraryFolded}
        />
        <div className="sidebar-card-body">
          <nav className="library-nav" aria-label="라이브러리">
            {SECTIONS.map((section, index) => (
              <button
                key={section.id}
                title={(collapsed
                  ? [section.label, section.role, `단축키 ${section.shortcut}`]
                  : [`단축키 ${section.shortcut}`]
                )
                  .filter(Boolean)
                  .join(' · ')}
                className={view.kind === 'library' && view.section === section.id ? 'active' : ''}
                onClick={() => openLibrary(section.id)}
              >
                <Icon name={section.icon} />
                {!collapsed && (
                  <>
                    <span className="library-nav-text">
                      <b>{section.label}</b>
                    </span>
                    <span className="count">{counts[index]}</span>
                  </>
                )}
              </button>
            ))}
          </nav>
        </div>
      </section>
    </aside>
  );
}
