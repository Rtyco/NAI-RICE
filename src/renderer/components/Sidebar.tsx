import { useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Project } from '../../core/domain/types';
import {
  createCharacter,
  createEmotionSet,
  createProject,
  createReference,
  DEFAULT_EMOTIONS,
} from '../../core/model/defaults';
import { moveItem } from '../../core/model/mutations';
import { importJsonFromPicker } from '../importers';
import { deleteProject, deleteProjects } from '../projectOps';
import { SECTIONS } from '../sections';
import {
  openLibrary,
  openProject,
  referenceMedia,
  run,
  setSettingsOpen,
  toggleSidebar,
  updateLibrary,
  useLibrary,
  useStore,
} from '../store';
import { showContextMenu } from './ContextMenu';
import { Modal, openDialog } from './Dialogs';
import { Icon } from './Icon';
import { focusAndSelect } from './focusAndSelect';
import { libraryApi } from '../desktop';
import { useBoxSelection } from './useBoxSelection';

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
  dragging: string | undefined;
  setDragging: (id: string | undefined) => void;
  /** 상자·Ctrl·Shift로 여러 개를 고른 상태인지. */
  picked: boolean;
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
      className={`library-item project-row ${props.active ? 'selected' : ''} ${props.picked ? 'picked' : ''} ${over ? 'drop-target' : ''} ${props.dragging === project.id ? 'dragging' : ''}`}
      data-select-id={collapsed ? undefined : project.id}
      draggable={!renaming}
      onContextMenu={(event) =>
        showContextMenu(event, [
          { label: '열기', onSelect: () => openProject(project.id) },
          { label: '이름 변경', disabled: collapsed, onSelect: () => setRenaming(true) },
          {
            label: '폴더 열기',
            onSelect: () =>
              void run('폴더를 여는 중', () =>
                libraryApi().openInExplorer({ kind: 'project', projectId: project.id }),
              ),
          },
          'divider',
          { label: '작업 삭제', danger: true, onSelect: () => void deleteProject(project) },
        ])
      }
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, project.id);
        event.dataTransfer.effectAllowed = 'move';
        props.setDragging(project.id);
      }}
      onDragEnd={() => props.setDragging(undefined)}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        const id = event.dataTransfer.getData(DRAG_TYPE);
        setOver(false);
        if (!id || id === project.id) return;
        event.preventDefault();
        event.stopPropagation();
        updateLibrary((current) => moveItem(current, 'projects', id, props.index));
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

export function Sidebar() {
  const library = useLibrary();
  const view = useStore((state) => state.view);
  const queue = useStore((state) => state.queue);
  const version = useStore((state) => state.version);
  const saveState = useStore((state) => state.saveState);
  const collapsed = useStore((state) => state.sidebarCollapsed);
  const update = useStore((state) => state.update);

  const active = new Map<string, number>();
  for (const job of queue.jobs) {
    if (['queued', 'generating', 'retry_wait'].includes(job.status)) {
      active.set(job.projectId, (active.get(job.projectId) ?? 0) + 1);
    }
  }
  const newProject = () => void openDialog((close) => <NewProjectDialog close={close} />);
  const [dragging, setDragging] = useState<string>();
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

      <section className="sidebar-card grow">
        <div className="sidebar-section-title">
          <span title="생성 결과가 쌓이는 곳 · F1 · Ctrl+Tab으로 다음 작업">
            <Icon name="project" />
            {!collapsed && <b>작업</b>}
          </span>
          {!collapsed && (
            <button className="icon-button" title="새 작업 (Ctrl+N)" onClick={newProject}>
              <Icon name="plus" />
            </button>
          )}
        </div>
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
                setDragging={setDragging}
                picked={!collapsed && selection.isSelected(project.id)}
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
      </section>

      <section className="sidebar-card">
        <div className="sidebar-section-title">
          <span title="여러 작업에서 다시 쓰는 프리셋">
            <Icon name="storage" />
            {!collapsed && <b>라이브러리</b>}
          </span>
        </div>
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
