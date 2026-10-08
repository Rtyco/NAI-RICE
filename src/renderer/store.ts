import { create } from 'zustand';
import type { GenerationSummary, Library, Project, QueueView } from '../core/domain/types';
import type { UpdateCheckResult } from '../core/update/UpdateCheck';
import { resolveProject, type ResolvedProject } from '../core/model/defaults';
import type { TokenStatus } from '../shared/ipc';
import { accountApi, appApi, libraryApi, queueApi } from './desktop';

export type LibrarySection = 'presets' | 'characters' | 'emotionSets' | 'references' | 'pieceSets';

export type View =
  | { kind: 'home' }
  | { kind: 'project'; projectId: string }
  | { kind: 'library'; section: LibrarySection; itemId?: string };

export type Toast = { id: number; kind: 'info' | 'error'; message: string };

export type PendingReference = { referenceId: string; dataUrl: string; name: string };

type State = {
  ready: boolean;
  root: string;
  version: string;
  library: Library | null;
  view: View;
  detailEmotionId?: string;
  settingsOpen: boolean;
  sidebarCollapsed: boolean;
  generations: Record<string, GenerationSummary[] | undefined>;
  queue: QueueView;
  token: TokenStatus;
  toasts: Toast[];
  saveState: 'saved' | 'saving' | 'error';
  busy: string;
  pendingReference?: PendingReference;
  /** 마지막 업데이트 확인 결과. */
  update?: UpdateCheckResult;
};

const SIDEBAR_KEY = 'sidebar-collapsed';

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

export const useStore = create<State>(() => ({
  ready: false,
  root: '',
  version: '',
  library: null,
  view: { kind: 'home' },
  settingsOpen: false,
  sidebarCollapsed: readSidebarCollapsed(),
  generations: {},
  queue: { paused: false, updatedAt: new Date(0).toISOString(), jobs: [] },
  token: { stored: false, secureStorageAvailable: false },
  toasts: [],
  saveState: 'saved',
  busy: '',
}));

const set = useStore.setState;
const get = useStore.getState;

// ── 알림 ─────────────────────────────────────────────

let toastSeed = 0;

export function toast(message: string, kind: Toast['kind'] = 'info'): void {
  const id = (toastSeed += 1);
  set((state) => ({ toasts: [...state.toasts.slice(-4), { id, kind, message }] }));
  if (kind === 'info') setTimeout(() => dismissToast(id), 4_000);
}

export function dismissToast(id: number): void {
  set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
}

export function errorMessage(error: unknown): string {
  const details = (error as { details?: unknown })?.details;
  const base = error instanceof Error ? error.message : String(error);
  const cleaned = base.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  return Array.isArray(details) ? [cleaned, ...details].join('\n') : cleaned;
}

/** 공통 실행 래퍼: 진행 표시, 오류 알림. */
export async function run<T>(label: string, task: () => Promise<T>): Promise<T | undefined> {
  set({ busy: label });
  try {
    return await task();
  } catch (error) {
    toast(errorMessage(error), 'error');
    return undefined;
  } finally {
    set({ busy: '' });
  }
}

// ── 자동 저장 ─────────────────────────────────────────

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const tasks = new Map<string, () => Promise<void>>();

async function runSave(key: string): Promise<void> {
  const task = tasks.get(key);
  clearTimeout(timers.get(key));
  timers.delete(key);
  tasks.delete(key);
  if (!task) return;
  set({ saveState: 'saving' });
  try {
    await task();
    if (!tasks.size) set({ saveState: 'saved' });
  } catch (error) {
    set({ saveState: 'error' });
    toast(`자동 저장 실패: ${errorMessage(error)}`, 'error');
  }
}

export function scheduleSave(key: string, task: () => Promise<void>, delay = 400): void {
  clearTimeout(timers.get(key));
  tasks.set(key, task);
  set({ saveState: 'saving' });
  timers.set(
    key,
    setTimeout(() => void runSave(key), delay),
  );
}

export async function flushSaves(): Promise<void> {
  await Promise.all([...tasks.keys()].map((key) => runSave(key)));
}

window.addEventListener('beforeunload', () => {
  void flushSaves();
});

// ── 초기화 ───────────────────────────────────────────

export async function initialize(): Promise<void> {
  try {
    const [snapshot, token, queue, version] = await Promise.all([
      libraryApi().loadLibrary(),
      accountApi().tokenStatus(),
      queueApi().queueSnapshot(),
      appApi().appVersion(),
    ]);
    const library = snapshot.library;
    const projectId =
      library.projects.find((item) => item.id === library.lastProjectId)?.id ??
      library.projects[0]?.id;
    set({
      ready: true,
      root: snapshot.root,
      version,
      library,
      token,
      queue,
      view: projectId ? { kind: 'project', projectId } : { kind: 'home' },
    });
    for (const notice of snapshot.notices) toast(notice);
    if (projectId) void loadGenerations(projectId);
    if (token.stored) {
      accountApi()
        .validateStoredToken()
        .then((status) => set({ token: status }))
        .catch((error) =>
          set((state) => ({
            token: { ...state.token, message: `자동 계정 조회 실패: ${errorMessage(error)}` },
          })),
        );
    }
  } catch (error) {
    set({ ready: true });
    toast(`작업 폴더를 열 수 없습니다: ${errorMessage(error)}`, 'error');
  }
  queueApi().onQueueUpdate((queue) => set({ queue }));
  accountApi().onTokenStatus((token) => set({ token }));
  queueApi().onGenerationAdded((record) => {
    set((state) => {
      const current = state.generations[record.projectId];
      if (!current) return {};
      return { generations: { ...state.generations, [record.projectId]: [...current, record] } };
    });
  });
}

// ── 라이브러리 ─────────────────────────────────────────

export function updateLibrary(recipe: (library: Library) => Library): void {
  const current = get().library;
  if (!current) return;
  set({ library: recipe(current) });
  scheduleSave('library', () => libraryApi().saveLibrary(get().library!));
}

export function useLibrary(): Library {
  return useStore((state) => state.library)!;
}

export function updateProject(id: string, recipe: (project: Project) => Project): void {
  updateLibrary((library) => ({
    ...library,
    projects: library.projects.map((project) =>
      project.id === id ? { ...recipe(project), updatedAt: new Date().toISOString() } : project,
    ),
  }));
}

export function useResolvedProject(projectId: string): ResolvedProject | undefined {
  const library = useLibrary();
  const project = library.projects.find((item) => item.id === projectId);
  return project ? resolveProject(library, project) : undefined;
}

export function currentProject(): Project | undefined {
  const state = get();
  if (state.view.kind !== 'project' || !state.library) return undefined;
  const id = state.view.projectId;
  return state.library.projects.find((project) => project.id === id);
}

// ── 화면 이동 ─────────────────────────────────────────

export function openProject(projectId: string): void {
  set({ view: { kind: 'project', projectId }, detailEmotionId: undefined });
  updateLibrary((library) => ({ ...library, lastProjectId: projectId }));
  if (!get().generations[projectId]) void loadGenerations(projectId);
}

export function openLibrary(section: LibrarySection, itemId?: string): void {
  set({ view: { kind: 'library', section, itemId }, detailEmotionId: undefined });
}

export function openEmotion(emotionId?: string): void {
  set({ detailEmotionId: emotionId });
}

export function setSettingsOpen(open: boolean): void {
  set({ settingsOpen: open });
}

/** 사이드바를 아이콘만 남긴 좁은 막대로 접거나 편다. 다음 실행에도 기억한다. */
export function toggleSidebar(): void {
  const collapsed = !get().sidebarCollapsed;
  set({ sidebarCollapsed: collapsed });
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  } catch {
    // 저장하지 못해도 이번 실행에서는 그대로 동작한다.
  }
}

/** 계정 상태(Anlas·V5 할당량)를 지금 다시 조회한다. */
export async function refreshAccount(): Promise<void> {
  if (!get().token.stored) return;
  set({ token: await accountApi().validateStoredToken() });
}

export function setPendingReference(reference: PendingReference | undefined): void {
  set({ pendingReference: reference });
}

// ── 생성 기록 ─────────────────────────────────────────

export async function loadGenerations(projectId: string): Promise<void> {
  try {
    const records = await libraryApi().listGenerations(projectId);
    set((state) => ({ generations: { ...state.generations, [projectId]: records } }));
  } catch (error) {
    toast(`생성 기록을 읽을 수 없습니다: ${errorMessage(error)}`, 'error');
  }
}

/** 기본은 휴지통으로 보낸다. 저장 공간 화면에서만 permanent로 바로 지운다. */
export async function deleteGenerations(
  projectId: string,
  ids: string[],
  options?: { permanent?: boolean },
): Promise<void> {
  await libraryApi().deleteGenerations(projectId, ids, options);
  const removed = new Set(ids);
  set((state) => ({
    generations: {
      ...state.generations,
      [projectId]: state.generations[projectId]?.filter((record) => !removed.has(record.id)),
    },
  }));
  updateProject(projectId, (project) => ({
    ...project,
    favorites: Object.fromEntries(
      Object.entries(project.favorites).filter(([, value]) => !removed.has(value)),
    ),
  }));
}

/** 감정별 생성 기록(최신순). */
export function emotionRecords(
  records: GenerationSummary[] | undefined,
  emotionId: string,
): GenerationSummary[] {
  return (records ?? [])
    .filter((record) => record.emotionId === emotionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function coverRecord(
  records: GenerationSummary[],
  favoriteId: string | undefined,
  prefer: 'favorite' | 'latest' = 'favorite',
): GenerationSummary | undefined {
  if (prefer === 'favorite' && favoriteId) {
    const favorite = records.find((record) => record.id === favoriteId);
    if (favorite) return favorite;
  }
  return records[0];
}

export function projectMedia(projectId: string, relative: string): string {
  return libraryApi().mediaUrl({ kind: 'project', id: projectId }, relative);
}

export function referenceMedia(referenceId: string, relative: string, version?: string): string {
  const url = libraryApi().mediaUrl({ kind: 'reference', id: referenceId }, relative);
  return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}
