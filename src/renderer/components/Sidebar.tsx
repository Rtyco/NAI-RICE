import { useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import type { Project } from '../../core/domain/types';
import {
  createCharacter,
  createEmotionSet,
  createProject,
  createReference,
  DEFAULT_EMOTIONS,
} from '../../core/model/defaults';
import { isActive } from '../../core/jobs/JobLifecycle';
import { moveItems } from '../../core/model/mutations';
import { importJsonFromPicker } from '../importers';
import { deleteProject, deleteProjects, duplicateProject, openProjectFolder } from '../projectOps';
import { SECTIONS } from '../sections';
import {
  openFree,
  openLibrary,
  openProject,
  referenceMedia,
  run,
  setSettingsOpen,
  toggleSidebar,
  toggleSidebarSection,
  updateLibrary,
  useLibrary,
  useStore,
  type SidebarSection,
} from '../store';
import { showContextMenu } from './ContextMenu';
import { Modal, openDialog } from './Dialogs';
import { Icon, type IconName } from './Icon';
import { focusAndSelect } from './focusAndSelect';
import { libraryApi } from '../desktop';
import { useBoxSelection } from './useBoxSelection';
import { dragPayload, readDragPayload, writeDragPayload, type DragPayload } from './listDrag';
import { listMenu } from './listMenu';

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

/** 생성 설정·캐릭터·감정 모음·레퍼런스를 골라 작업을 만든다. 없는 것은 그 자리에서 새로 만든다. */
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
        ? createEmotionSet(`${label} 감정`, DEFAULT_EMOTIONS)
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
          onKeyDown={(event) => event.key === 'Enter' && create()}
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
          label="③ 감정 모음"
          value={emotionSetId}
          items={library.emotionSets}
          newLabel="새 감정 모음 (기본 6종)"
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

/**
 * 사이드바의 작업 한 줄. 라이브러리 목록처럼 끌어서 순서를 바꾸고, 두 번 클릭(또는 우클릭 › 이름 변경)으로
 * 이름을 바꾸고, 호버하면 삭제 버튼이 뜬다. 사이드바를 접으면 열기·끌기·우클릭만 된다.
 */
function ProjectRow(props: {
  project: Project;
  index: number;
  collapsed: boolean;
  active: boolean;
  busy?: number;
  avatar?: string;
  subtitle: string;
  /** 끄는 중인 작업들. */
  dragging: string[];
  /** 끌기를 시작할 때 옮길 작업들을 정한다(고른 작업 중 하나를 끌면 고른 것 모두). */
  startDrag: (id: string) => DragPayload;
  endDrag: () => void;
  /** 상자·Ctrl·Shift로 여러 개를 고른 상태인지. */
  picked: boolean;
  /** 지금 고른 작업 수. 고른 작업에서 우클릭하면 삭제를 한꺼번에 한다. */
  pickedCount: number;
  removePicked: () => void;
  /** Ctrl·Shift 클릭이면 선택만 바꾸고 true를 돌려준다. */
  onPick: (event: MouseEvent) => boolean;
}) {
  const { project, collapsed } = props;
  const [over, setOver] = useState(false);
  const [renaming, setRenamingState] = useState(false);
  // 엔터·Esc로 끝낸 뒤 따라오는 blur가 다시 저장하지 않게 한다.
  const editing = useRef(false);
  const setRenaming = (value: boolean) => {
    editing.current = value;
    setRenamingState(value);
  };

  const commitName = (value: string) => {
    if (!editing.current) return;
    setRenaming(false);
    const name = value.trim();
    if (name && name !== project.name)
      updateLibrary((current) => ({
        ...current,
        projects: current.projects.map((item) =>
          item.id === project.id ? { ...item, name, updatedAt: new Date().toISOString() } : item,
        ),
      }));
  };

  const avatar = (
    <span className="avatar">
      {props.avatar ? (
        <img src={props.avatar} alt="" draggable={false} />
      ) : (
        project.name.slice(0, 1)
      )}
    </span>
  );

  return (
    <div
      className={`library-item project-row ${props.active ? 'selected' : ''} ${props.picked ? 'picked' : ''} ${over ? 'drop-target' : ''} ${props.dragging.includes(project.id) ? 'dragging' : ''}`}
      data-select-id={collapsed ? undefined : project.id}
      draggable={!renaming}
      onContextMenu={(event) =>
        showContextMenu(
          event,
          listMenu({
            open: () => openProject(project.id),
            rename: collapsed ? undefined : () => setRenaming(true),
            duplicate: () => duplicateProject(project),
            folder: () => openProjectFolder(project.id),
            remove: () => void deleteProject(project),
            pickedCount: props.picked ? props.pickedCount : 0,
            removePicked: props.removePicked,
          }),
        )
      }
      onDragStart={(event) => writeDragPayload(event, DRAG_TYPE, props.startDrag(project.id))}
      onDragEnd={props.endDrag}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        const payload = readDragPayload(event, DRAG_TYPE);
        setOver(false);
        if (!payload || payload.ids.includes(project.id)) return;
        event.preventDefault();
        event.stopPropagation();
        updateLibrary((current) =>
          moveItems(current, 'projects', payload.ids, payload.grabbed, project.id),
        );
      }}
    >
      {renaming ? (
        <div className="library-item-main project-item">
          {avatar}
          <span className="project-meta">
            <input
              className="library-item-rename"
              defaultValue={project.name}
              aria-label="작업 이름"
              ref={focusAndSelect}
              onBlur={(event) => commitName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitName(event.currentTarget.value);
                if (event.key === 'Escape') setRenaming(false);
              }}
            />
            <small>{props.subtitle}</small>
          </span>
        </div>
      ) : (
        <button
          className="library-item-main project-item"
          title={
            collapsed
              ? project.name
              : '두 번 클릭: 이름 변경 · 끌어서 순서 변경 · Ctrl·Shift 클릭: 여러 개 선택'
          }
          onClick={(event) => {
            if (collapsed || !props.onPick(event)) openProject(project.id);
          }}
          onDoubleClick={() => !collapsed && setRenaming(true)}
        >
          {avatar}
          {!collapsed && (
            <span className="project-meta">
              <b>{project.name || '(이름 없음)'}</b>
              <small>{props.subtitle}</small>
            </span>
          )}
          {props.busy ? <span className="pill busy">{props.busy}</span> : null}
        </button>
      )}
      {!collapsed && !renaming && (
        <button
          className="icon-button danger item-actions"
          title="작업 삭제"
          onClick={() => void deleteProject(project)}
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * 사이드바 카드의 제목 줄. 제목을 누르면 카드가 제목 줄만 남기고 접힌다.
 * 사이드바 전체를 접은 좁은 막대에서는 아이콘만 보이고 누를 수 없다.
 */
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
      {props.narrow ? (
        <span title={props.title}>
          <Icon name={props.icon} />
        </span>
      ) : (
        <button
          className="sidebar-section-toggle"
          aria-expanded={!props.folded}
          title={`${props.title} · ${props.folded ? '펼치기' : '접기'}`}
          onClick={() => toggleSidebarSection(props.section)}
        >
          <Icon name="chevron" size={12} className="section-chevron" />
          <Icon name={props.icon} />
          <b>{props.label}</b>
        </button>
      )}
      {props.children}
    </div>
  );
}

export function Sidebar() {
  const library = useLibrary();
  const view = useStore((state) => state.view);
  const queue = useStore((state) => state.queue);
  const version = useStore((state) => state.version);
  const saveState = useStore((state) => state.saveState);
  const collapsed = useStore((state) => state.sidebarCollapsed);
  const sections = useStore((state) => state.sidebarSections);
  const update = useStore((state) => state.update);
  // 좁은 막대에서는 카드 접기를 무시하고 아이콘을 모두 보여 준다.
  const projectsFolded = !collapsed && sections.projects;
  const libraryFolded = !collapsed && sections.library;

  const active = new Map<string, number>();
  for (const job of queue.jobs) {
    if (isActive(job.status)) {
      active.set(job.projectId, (active.get(job.projectId) ?? 0) + 1);
    }
  }
  const newProject = () => void openDialog((close) => <NewProjectDialog close={close} />);
  const [dragging, setDragging] = useState<string[]>([]);
  const removeMany = (ids: string[]) =>
    void deleteProjects(library.projects.filter((project) => ids.includes(project.id)));
  const selection = useBoxSelection<HTMLElement>(
    library.projects.map((project) => project.id),
    removeMany,
  );

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand-block">
        <button
          className="icon-button sidebar-toggle"
          title={collapsed ? '사이드바 펼치기 (Ctrl+B)' : '사이드바 접기 (Ctrl+B)'}
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          onClick={toggleSidebar}
        >
          <Icon name="sidebar" size={18} />
        </button>
        {!collapsed && (
          <div className="brand-text">
            <strong>NAI RICE</strong>
            {saveState === 'error' && (
              <span
                className="save-indicator error"
                title="작업 폴더에 저장하지 못했습니다. 알림을 확인하십시오."
              >
                저장 실패
              </span>
            )}
          </div>
        )}
      </div>

      <section className="sidebar-card free-card">
        <nav className="library-nav" aria-label="자유 생성">
          <button
            title={
              collapsed
                ? '자유 생성 · 감정 없이 프롬프트로 여러 장'
                : '감정 없이 프롬프트로 여러 장'
            }
            className={view.kind === 'free' ? 'active' : ''}
            onClick={openFree}
          >
            <Icon name="sparkle" />
            {!collapsed && (
              <span className="library-nav-text">
                <b>자유 생성</b>
                <small>프롬프트만으로 여러 장</small>
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
          title="생성 결과가 쌓이는 곳 · F1 · Ctrl+Tab으로 다음 작업"
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
          >
            {library.projects.map((project, index) => {
              const reference = library.references.find((item) => item.id === project.referenceId);
              const character = library.characters.find((item) => item.id === project.characterId);
              return (
                <ProjectRow
                  key={project.id}
                  project={project}
                  index={index}
                  collapsed={collapsed}
                  active={view.kind === 'project' && view.projectId === project.id}
                  busy={active.get(project.id)}
                  avatar={
                    reference?.image
                      ? referenceMedia(
                          reference.id,
                          reference.image.originalFile,
                          reference.updatedAt,
                        )
                      : undefined
                  }
                  subtitle={character?.name ?? '캐릭터 없음'}
                  dragging={dragging}
                  startDrag={(id) => {
                    const payload = dragPayload(
                      id,
                      selection.selected,
                      library.projects.map((item) => item.id),
                    );
                    setDragging(payload.ids);
                    return payload;
                  }}
                  endDrag={() => setDragging([])}
                  picked={!collapsed && selection.isSelected(project.id)}
                  pickedCount={selection.selected.size}
                  removePicked={() => removeMany([...selection.selected])}
                  onPick={(event) => selection.clickItem(event, project.id)}
                />
              );
            })}
            {collapsed && (
              <button className="project-item add" title="새 작업 (Ctrl+N)" onClick={newProject}>
                <span className="avatar">
                  <Icon name="plus" />
                </span>
              </button>
            )}
            {!library.projects.length && !collapsed && (
              <p className="hint pad-x">아직 작업이 없습니다.</p>
            )}
            {!collapsed && selection.boxElement}
          </nav>
          {!collapsed && selection.selected.size > 0 && (
            <div className="selection-bar">
              <span>{selection.selected.size}개 선택</span>
              <button
                className="with-icon danger-quiet"
                onClick={() => removeMany([...selection.selected])}
              >
                <Icon name="trash" size={14} /> 삭제
              </button>
              <button className="link-button" onClick={selection.clear}>
                선택 취소
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
          title="생성 설정·캐릭터·감정 모음·인페인트 보관함"
          narrow={collapsed}
          folded={libraryFolded}
        />
        <div className="sidebar-card-body">
          <nav className="library-nav" aria-label="라이브러리">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                title={(collapsed
                  ? [section.label, section.role, section.shortcut]
                  : [section.usage, section.shortcut]
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
                      {section.role && <small>{section.role}</small>}
                    </span>
                    <span className="count">{(library[section.key] as unknown[]).length}</span>
                  </>
                )}
              </button>
            ))}
          </nav>
        </div>
      </section>

      <div className="sidebar-footer">
        <button
          onClick={() => void importJsonFromPicker()}
          title="백업, 내보낸 항목, SDStudio JSON (Ctrl+O)"
        >
          <Icon name="import" />
          {!collapsed && <span>JSON 가져오기</span>}
        </button>
        <button
          title="작업 폴더 열기"
          onClick={() =>
            void run('폴더를 여는 중', () => libraryApi().openInExplorer({ kind: 'root' }))
          }
        >
          <Icon name="folder" />
          {!collapsed && <span>작업 폴더 열기</span>}
        </button>
        <button
          className="settings-entry"
          title="프로그램 설정 (NovelAI 토큰·요청 간격·결과 파일·백업) · Ctrl+,"
          onClick={() => setSettingsOpen(true)}
        >
          <Icon name="settings" size={17} />
          {!collapsed && (
            <>
              <span>프로그램 설정</span>
              {update?.newer ? (
                <small className="update-badge">새 버전 {update.latest}</small>
              ) : (
                <small>v{version}</small>
              )}
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
