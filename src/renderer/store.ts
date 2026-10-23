import { useRef } from 'react';
import { create } from 'zustand';
import type {
  FocusLevel,
  FreeGeneration,
  GenerationSummary,
  Library,
  Project,
  QueueView,
} from '../core/domain/types';
import type { UpdateCheckResult } from '../core/update/UpdateCheck';
import {
  FREE_PROJECT_ID,
  resolveCharacters,
  resolveProject,
  type ResolvedCharacter,
  type ResolvedProject,
} from '../core/model/defaults';
import type { GenerationPreview, TokenStatus } from '../shared/ipc';
import { accountApi, appApi, libraryApi, queueApi } from './desktop';

export type LibrarySection =
  | 'presets'
  | 'characters'
  | 'emotionSets'
  | 'references'
  | 'characterReferences'
  | 'vibes'
  | 'pieceSets';

export type View =
  | { kind: 'home' }
  | { kind: 'project'; projectId: string }
  | { kind: 'free' }
  | { kind: 'library'; section: LibrarySection; itemId?: string };

export type Toast = { id: number; kind: 'info' | 'error'; message: string };

export type PendingReference = { referenceId: string; dataUrl: string; name: string };

export type SidebarSection = 'projects' | 'library';

export type ResultRef = { projectId: string; id: string };

type CollapsedFlag = 'filmstripCollapsed' | 'historyCollapsed' | 'sidePanelCollapsed';

/** 왼쪽 패널은 누를 때마다 펼침 → 아이콘만 → 숨김 순으로 바뀐다. */
export type PanelStage = 'open' | 'icons' | 'hidden';

type StageFlag = 'sidebarStage' | 'libraryListStage' | 'promptPanelStage';

/** 집중 모드(Tab)가 숨길 수 있는 곳. 왼쪽 패널은 프롬프트 패널과 라이브러리 목록이다. */
export type FocusPart = 'sidebar' | 'leftPanel' | 'history' | 'sidePanel' | 'queueBar';

export const FOCUS_PARTS: Record<FocusLevel, FocusPart[]> = {
  panels: ['sidebar', 'leftPanel', 'history'],
  inputs: ['sidebar', 'leftPanel', 'history', 'sidePanel'],
  all: ['sidebar', 'leftPanel', 'history', 'sidePanel', 'queueBar'],
};

export type StoreState = {
  ready: boolean;
  root: string;
  version: string;
  library: Library | null;
  view: View;
  detailEmotionId?: string;
  settingsOpen: boolean;
  settingsTab?: string;
  sidebarStage: PanelStage;
  /** 사이드바 전체 접기(Ctrl+B)와 따로 기억한다. */
  sidebarSections: Record<SidebarSection, boolean>;
  galleryColumns: number;
  galleryAspect: GalleryAspect;
  filmstripCollapsed: boolean;
  libraryListStage: PanelStage;
  /** 작업·자유 생성 화면이 함께 쓴다. */
  promptPanelStage: PanelStage;
  historyCollapsed: boolean;
  /** 씬 상세·자유 생성·인페인트 편집이 함께 쓴다. */
  sidePanelCollapsed: boolean;
  /** 집중 모드가 숨긴 곳. 비면 집중 모드가 아니다. 저장하지 않아 다시 실행하면 풀린다. */
  focusHidden: FocusPart[];
  /** 히스토리에서 고른 결과. 그 결과를 가진 결과 화면이 보여 주고 지운다. */
  resultRequest?: ResultRef;
  /** 결과 화면(씬 상세·자유 생성)이 지금 보여 주는 결과 */
  shownResult?: ResultRef;
  /** `<작업|라이브러리 칸>/<폴더 이름>` */
  foldedFolders: string[];
  /** `preset` 또는 `character:<ID>` */
  foldedPromptGroups: string[];
  generations: Record<string, GenerationSummary[] | undefined>;
  queue: QueueView;
  /** 작업 ID → 스트리밍 중간 그림 */
  previews: Record<string, GenerationPreview>;
  token: TokenStatus;
  toasts: Toast[];
  saveState: 'saved' | 'saving' | 'error';
  busy: string;
  pendingReference?: PendingReference;
  update?: UpdateCheckResult;
};

export function readUiState<T>(key: string, parse: (raw: string | null) => T, fallback: T): T {
  try {
    return parse(localStorage.getItem(key));
  } catch {
    return fallback;
  }
}

export function saveUiState(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 이번 실행에서는 그대로 동작한다.
  }
}

const SIDEBAR_KEY = 'sidebar-collapsed';
const SIDEBAR_SECTIONS_KEY = 'sidebar-sections-collapsed';

export const GALLERY_COLUMN_CHOICES = [3, 4, 5, 6, 7] as const;
const GALLERY_COLUMNS_KEY = 'gallery-columns';

/** NovelAI 웹 기본 해상도의 비율(832×1216, 1216×832, 1024×1024). */
export const GALLERY_ASPECTS = [
  { id: 'portrait', icon: 'ratio-portrait', title: '세로 832×1216', ratio: '832 / 1216' },
  { id: 'landscape', icon: 'ratio-landscape', title: '가로 1216×832', ratio: '1216 / 832' },
  { id: 'square', icon: 'ratio-square', title: '정사각 1024×1024', ratio: '1 / 1' },
] as const;
export type GalleryAspect = (typeof GALLERY_ASPECTS)[number]['id'];
const GALLERY_ASPECT_KEY = 'gallery-aspect';

const readGalleryColumns = () =>
  readUiState(
    GALLERY_COLUMNS_KEY,
    (raw) => {
      const value = Number(raw);
      return (GALLERY_COLUMN_CHOICES as readonly number[]).includes(value) ? value : 6;
    },
    6,
  );

const FILMSTRIP_KEY = 'filmstrip-collapsed';
const LIBRARY_LIST_KEY = 'library-list-collapsed';
const PROMPT_PANEL_KEY = 'prompt-panel-collapsed';
const HISTORY_KEY = 'history-collapsed';
const SIDE_PANEL_KEY = 'side-panel-collapsed';
const FOLDED_FOLDERS_KEY = 'folded-folders';
const FOLDED_PROMPT_GROUPS_KEY = 'folded-prompt-groups';

const readStringList = (key: string) =>
  readUiState(
    key,
    (raw) => {
      const value: unknown = JSON.parse(raw ?? '[]');
      return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
    },
    [] as string[],
  );

const readCollapsed = (key: string) => readUiState(key, (raw) => raw === '1', false);

/** 예전에는 접힘을 '1'로 저장했다(지금의 아이콘만). */
const readStage = (key: string) =>
  readUiState<PanelStage>(
    key,
    (raw) => (raw === '1' ? 'icons' : raw === 'icons' || raw === 'hidden' ? raw : 'open'),
    'open',
  );

const readSidebarSections = (): Record<SidebarSection, boolean> =>
  readUiState(
    SIDEBAR_SECTIONS_KEY,
    (raw) => {
      const saved = JSON.parse(raw ?? '{}');
      return { projects: saved?.projects === true, library: saved?.library === true };
    },
    { projects: false, library: false },
  );

export const useStore = create<StoreState>(() => ({
  ready: false,
  root: '',
  version: '',
  library: null,
  view: { kind: 'home' },
  settingsOpen: false,
  sidebarStage: readStage(SIDEBAR_KEY),
  sidebarSections: readSidebarSections(),
  galleryColumns: readGalleryColumns(),
  galleryAspect: readUiState(
    GALLERY_ASPECT_KEY,
    (raw) => GALLERY_ASPECTS.find((item) => item.id === raw)?.id ?? 'portrait',
    'portrait' as GalleryAspect,
  ),
  filmstripCollapsed: readCollapsed(FILMSTRIP_KEY),
  libraryListStage: readStage(LIBRARY_LIST_KEY),
  promptPanelStage: readStage(PROMPT_PANEL_KEY),
  historyCollapsed: readCollapsed(HISTORY_KEY),
  sidePanelCollapsed: readCollapsed(SIDE_PANEL_KEY),
  focusHidden: [],
  foldedFolders: readStringList(FOLDED_FOLDERS_KEY),
  foldedPromptGroups: readStringList(FOLDED_PROMPT_GROUPS_KEY),
  generations: {},
  queue: { paused: false, updatedAt: new Date(0).toISOString(), jobs: [] },
  previews: {},
  token: { stored: false, secureStorageAvailable: false },
  toasts: [],
  saveState: 'saved',
  busy: '',
}));

const set = useStore.setState;
const get = useStore.getState;

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

let initializing: Promise<void> | undefined;

/** 개발 모드 StrictMode에서 두 번 불려도 한 번만 연다. */
export function initialize(): Promise<void> {
  initializing ??= openWorkspace();
  return initializing;
}

async function openWorkspace(): Promise<void> {
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
}

export function subscribeToMain(): () => void {
  const stops = [
    queueApi().onQueueUpdate((queue) =>
      set((state) => {
        const running = new Set(
          queue.jobs.filter((job) => job.status === 'generating').map((job) => job.id),
        );
        const previews = Object.fromEntries(
          Object.entries(state.previews).filter(([id]) => running.has(id)),
        );
        return { queue, previews };
      }),
    ),
    queueApi().onGenerationPreview((preview) =>
      set((state) => ({ previews: { ...state.previews, [preview.jobId]: preview } })),
    ),
    accountApi().onTokenStatus((token) => set({ token })),
    queueApi().onGenerationAdded((record) =>
      set((state) => {
        const current = state.generations[record.projectId];
        // 목록을 다시 읽은 직후면 이미 들어 있다.
        if (!current || current.some((item) => item.id === record.id)) return {};
        return { generations: { ...state.generations, [record.projectId]: [...current, record] } };
      }),
    ),
  ];
  return () => stops.forEach((stop) => stop());
}

export function updateLibrary(recipe: (library: Library) => Library): void {
  const current = get().library;
  if (!current) return;
  set({ library: recipe(current) });
  scheduleSave('library', () => libraryApi().saveLibrary(get().library!));
}

/** 한 글자만 고쳐도 바뀐다. 자주 그려지는 곳에서는 selector로 필요한 부분만 고른다. */
export function useLibrary(): Library {
  return useStore((state) => state.library)!;
}

/** selector가 새 값을 만들어도 `same`이면 앞 값을 돌려줘 다시 그리지 않는다. */
export function useStoreMemo<T>(
  selector: (state: StoreState) => T,
  same: (a: T, b: T) => boolean,
): T {
  const last = useRef<{ value: T }>(undefined);
  return useStore((state) => {
    const value = selector(state);
    if (last.current && same(last.current.value, value)) return last.current.value;
    last.current = { value };
    return value;
  });
}

function sameList<T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean = Object.is) {
  return a.length === b.length && a.every((item, index) => same(item, b[index]));
}

export function sameCharacters(a: ResolvedCharacter[], b: ResolvedCharacter[]): boolean {
  return sameList(
    a,
    b,
    (x, y) => x.character === y.character && x.promptSet === y.promptSet && x.center === y.center,
  );
}

function sameResolved(a: ResolvedProject | undefined, b: ResolvedProject | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.project === b.project &&
    a.preset === b.preset &&
    a.emotionSet === b.emotionSet &&
    a.reference === b.reference &&
    sameCharacters(a.characters, b.characters) &&
    sameList(a.missing, b.missing)
  );
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
  return useStoreMemo((state) => {
    const project = state.library?.projects.find((item) => item.id === projectId);
    return project && resolveProject(state.library!, project);
  }, sameResolved);
}

export function currentProject(): Project | undefined {
  const state = get();
  if (state.view.kind !== 'project' || !state.library) return undefined;
  const id = state.view.projectId;
  return state.library.projects.find((project) => project.id === id);
}

export function openProject(projectId: string): void {
  set({ view: { kind: 'project', projectId }, detailEmotionId: undefined });
  updateLibrary((library) => ({ ...library, lastProjectId: projectId }));
  if (!get().generations[projectId]) void loadGenerations(projectId);
}

export function openFree(): void {
  set({ view: { kind: 'free' }, detailEmotionId: undefined });
  if (!get().generations[FREE_PROJECT_ID]) void loadGenerations(FREE_PROJECT_ID);
}

export function updateFreeGeneration(patch: Partial<FreeGeneration>): void {
  updateLibrary((library) => ({
    ...library,
    freeGeneration: { ...library.freeGeneration, ...patch },
  }));
}

/** 지워진 항목은 첫 생성 설정·캐릭터 없음으로 본다. */
export function resolveFreeGeneration(library: Library) {
  const free = library.freeGeneration;
  const preset =
    library.presets.find((item) => item.id === free.presetId) ?? library.presets[0];
  const characters = resolveCharacters(library, free.characters);
  return {
    free,
    preset,
    characters,
    character: characters[0]?.character,
    promptSet: characters[0]?.promptSet,
  };
}

export function openLibrary(section: LibrarySection, itemId?: string): void {
  set({ view: { kind: 'library', section, itemId }, detailEmotionId: undefined });
}

export function openEmotion(emotionId?: string): void {
  set({ detailEmotionId: emotionId });
}

export function setSettingsOpen(open: boolean, tab?: string): void {
  set({ settingsOpen: open, settingsTab: tab });
}

function toggleCollapsed(flag: CollapsedFlag, key: string): void {
  const collapsed = !get()[flag];
  set({ [flag]: collapsed });
  saveUiState(key, collapsed ? '1' : '0');
}

const NEXT_STAGE: Record<PanelStage, PanelStage> = {
  open: 'icons',
  icons: 'hidden',
  hidden: 'open',
};

function setStage(flag: StageFlag, key: string, stage: PanelStage): void {
  set({ [flag]: stage });
  saveUiState(key, stage);
}

/** 버튼 설명은 누르면 바뀔 단계를 말한다. 예: 사이드바 숨기기 (Ctrl+B) */
export function stageTitle(name: string, stage: PanelStage, shortcut?: string): string {
  const action = { open: '아이콘만 남기기', icons: '숨기기', hidden: '펼치기' }[stage];
  return `${name} ${action}${shortcut ? ` (${shortcut})` : ''}`;
}

const focusHides = (state: StoreState, part: FocusPart) => state.focusHidden.includes(part);

// 화면에 실제로 보이는 모습. 저장한 단계에 집중 모드가 덮어쓴다.
export const sidebarStageOf = (state: StoreState): PanelStage =>
  focusHides(state, 'sidebar') ? 'hidden' : state.sidebarStage;
export const promptPanelStageOf = (state: StoreState): PanelStage =>
  focusHides(state, 'leftPanel') ? 'hidden' : state.promptPanelStage;
export const libraryListStageOf = (state: StoreState): PanelStage =>
  focusHides(state, 'leftPanel') ? 'hidden' : state.libraryListStage;
export const historyShownOf = (state: StoreState) =>
  !state.historyCollapsed && !focusHides(state, 'history');
export const sidePanelShownOf = (state: StoreState) =>
  !state.sidePanelCollapsed && !focusHides(state, 'sidePanel');
export const queueBarShownOf = (state: StoreState) => !focusHides(state, 'queueBar');

/** 집중 모드가 숨긴 곳을 열면 그곳만 돌아온다. 저장한 단계가 숨김이면 펼친다. */
function revealFromFocus(part: FocusPart): boolean {
  const { focusHidden } = get();
  if (!focusHidden.includes(part)) return false;
  set({ focusHidden: focusHidden.filter((item) => item !== part) });
  return true;
}

function cycleStage(flag: StageFlag, key: string, part: FocusPart): void {
  if (revealFromFocus(part)) {
    if (get()[flag] === 'hidden') setStage(flag, key, 'open');
    return;
  }
  setStage(flag, key, NEXT_STAGE[get()[flag]]);
}

/** 다시 누르면 숨기기 전으로 돌아온다. */
export function toggleFocusMode(): void {
  if (get().focusHidden.length) return set({ focusHidden: [] });
  const level = get().library?.settings.layout.focusLevel ?? 'panels';
  set({ focusHidden: FOCUS_PARTS[level] });
}

export function showQueueBar(): void {
  revealFromFocus('queueBar');
}

export function cycleSidebar(): void {
  cycleStage('sidebarStage', SIDEBAR_KEY, 'sidebar');
}

export function toggleSidebarSection(section: SidebarSection): void {
  const sections = { ...get().sidebarSections, [section]: !get().sidebarSections[section] };
  set({ sidebarSections: sections });
  saveUiState(SIDEBAR_SECTIONS_KEY, JSON.stringify(sections));
}

export function setGalleryColumns(columns: number): void {
  set({ galleryColumns: columns });
  saveUiState(GALLERY_COLUMNS_KEY, String(columns));
}

export function setGalleryAspect(aspect: GalleryAspect): void {
  set({ galleryAspect: aspect });
  saveUiState(GALLERY_ASPECT_KEY, aspect);
}

export function toggleFilmstrip(): void {
  toggleCollapsed('filmstripCollapsed', FILMSTRIP_KEY);
}

export function cycleLibraryList(): void {
  cycleStage('libraryListStage', LIBRARY_LIST_KEY, 'leftPanel');
}

export function cyclePromptPanel(): void {
  cycleStage('promptPanelStage', PROMPT_PANEL_KEY, 'leftPanel');
}

export function openPromptPanel(): void {
  revealFromFocus('leftPanel');
  setStage('promptPanelStage', PROMPT_PANEL_KEY, 'open');
}

export function toggleHistory(): void {
  if (revealFromFocus('history') && !get().historyCollapsed) return;
  toggleCollapsed('historyCollapsed', HISTORY_KEY);
}

export function toggleSidePanel(): void {
  if (revealFromFocus('sidePanel') && !get().sidePanelCollapsed) return;
  toggleCollapsed('sidePanelCollapsed', SIDE_PANEL_KEY);
}

export function requestResult(request: ResultRef | undefined): void {
  set({ resultRequest: request });
}

export function setShownResult(shown: ResultRef | undefined): void {
  set({ shownResult: shown });
}

function toggleIn(list: string[], value: string, folded?: boolean): string[] {
  const next = folded ?? !list.includes(value);
  return next ? [...new Set([...list, value])] : list.filter((item) => item !== value);
}

export function toggleFolder(key: string, folded?: boolean): void {
  const foldedFolders = toggleIn(get().foldedFolders, key, folded);
  set({ foldedFolders });
  saveUiState(FOLDED_FOLDERS_KEY, JSON.stringify(foldedFolders));
}

export function togglePromptGroup(key: string, folded?: boolean): void {
  const foldedPromptGroups = toggleIn(get().foldedPromptGroups, key, folded);
  set({ foldedPromptGroups });
  saveUiState(FOLDED_PROMPT_GROUPS_KEY, JSON.stringify(foldedPromptGroups));
}

export async function refreshAccount(): Promise<void> {
  if (!get().token.stored) return;
  set({ token: await accountApi().validateStoredToken() });
}

export function setPendingReference(reference: PendingReference | undefined): void {
  set({ pendingReference: reference });
}

export async function loadGenerations(projectId: string): Promise<void> {
  try {
    const records = await libraryApi().listGenerations(projectId);
    set((state) => ({ generations: { ...state.generations, [projectId]: records } }));
  } catch (error) {
    toast(`생성 기록을 읽을 수 없습니다: ${errorMessage(error)}`, 'error');
  }
}

/** 기본은 휴지통. permanent는 저장 공간 화면에서만. */
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

/** 최신순 */
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

/** 내용 해시 이름이라 바뀌면 이름도 바뀐다. */
export function pictureMedia(file: string): string {
  return libraryApi().mediaUrl({ kind: 'picture' }, file);
}

export function referenceMedia(referenceId: string, relative: string, version?: string): string {
  const url = libraryApi().mediaUrl({ kind: 'reference', id: referenceId }, relative);
  return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}
