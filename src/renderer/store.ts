import { useRef } from 'react';
import { create } from 'zustand';
import type {
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

export type StoreState = {
  ready: boolean;
  root: string;
  version: string;
  library: Library | null;
  view: View;
  detailEmotionId?: string;
  settingsOpen: boolean;
  /** 설정 창을 열 때 처음 보일 탭. */
  settingsTab?: string;
  sidebarCollapsed: boolean;
  /** 접힌 사이드바 카드. 사이드바 전체 접기(Ctrl+B)와는 따로 기억한다. */
  sidebarSections: Record<SidebarSection, boolean>;
  galleryColumns: number;
  /** 작업 화면 씬 카드의 이미지 비율. */
  galleryAspect: GalleryAspect;
  /** 결과 화면 아래의 이미지 목록을 접었는지. */
  filmstripCollapsed: boolean;
  /** 라이브러리 화면 왼쪽의 항목 목록을 접었는지. */
  libraryListCollapsed: boolean;
  /** 작업·자유 생성 화면 왼쪽의 프롬프트 패널을 접었는지. 두 화면이 함께 쓴다. */
  promptPanelCollapsed: boolean;
  /** 접힌 목록 폴더. `작업` 또는 라이브러리 칸 이름과 폴더 이름을 `/`로 이은 값이다. */
  foldedFolders: string[];
  /** 프롬프트 패널에서 접힌 묶음. 생성 설정은 `preset`, 캐릭터는 `character:<ID>`다. */
  foldedPromptGroups: string[];
  generations: Record<string, GenerationSummary[] | undefined>;
  queue: QueueView;
  /** 스트리밍으로 받은 진행 중 작업의 중간 그림(작업 ID별). */
  previews: Record<string, GenerationPreview>;
  token: TokenStatus;
  toasts: Toast[];
  saveState: 'saved' | 'saving' | 'error';
  busy: string;
  pendingReference?: PendingReference;
  /** 마지막 업데이트 확인 결과. */
  update?: UpdateCheckResult;
};

// 다음 실행에도 기억하는 화면 상태. 저장소를 쓸 수 없으면 기본값으로 이번 실행만 동작한다.

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
    // 저장하지 못해도 이번 실행에서는 그대로 동작한다.
  }
}

const SIDEBAR_KEY = 'sidebar-collapsed';
const SIDEBAR_SECTIONS_KEY = 'sidebar-sections-collapsed';

export const GALLERY_COLUMN_CHOICES = [3, 4, 5, 6, 7] as const;
const GALLERY_COLUMNS_KEY = 'gallery-columns';

/** NovelAI 웹의 기본 해상도(세로 832×1216, 가로 1216×832, 정사각 1024×1024)와 같은 비율. */
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

const readSidebarCollapsed = () => readUiState(SIDEBAR_KEY, (raw) => raw === '1', false);

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
  sidebarCollapsed: readSidebarCollapsed(),
  sidebarSections: readSidebarSections(),
  galleryColumns: readGalleryColumns(),
  galleryAspect: readUiState(
    GALLERY_ASPECT_KEY,
    (raw) => GALLERY_ASPECTS.find((item) => item.id === raw)?.id ?? 'portrait',
    'portrait' as GalleryAspect,
  ),
  filmstripCollapsed: readUiState(FILMSTRIP_KEY, (raw) => raw === '1', false),
  libraryListCollapsed: readUiState(LIBRARY_LIST_KEY, (raw) => raw === '1', false),
  promptPanelCollapsed: readUiState(PROMPT_PANEL_KEY, (raw) => raw === '1', false),
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

/** 작업 폴더를 연다. 개발 모드의 StrictMode처럼 여러 번 불려도 한 번만 연다. */
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

/** 메인 프로세스의 알림(큐·계정·새 생성 기록)을 받는다. 돌려준 함수를 부르면 그만 받는다. */
export function subscribeToMain(): () => void {
  const stops = [
    queueApi().onQueueUpdate((queue) =>
      set((state) => {
        // 끝난 작업의 중간 그림은 버린다.
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
        // 목록을 다시 읽은 직후라 이미 들어 있을 수 있다.
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

/** 라이브러리 전체. 한 글자만 고쳐도 바뀌므로 자주 그려지는 곳에서는 필요한 부분만 고르는 selector를 쓴다. */
export function useLibrary(): Library {
  return useStore((state) => state.library)!;
}

/** selector가 매번 새 값을 만들어도 `same`이 참이면 앞의 값을 그대로 돌려줘 다시 그리지 않게 한다. */
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

/** 자유 생성에 쓸 생성 설정과 캐릭터. 지워진 항목은 첫 생성 설정·캐릭터 없음으로 본다. */
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

export function toggleSidebar(): void {
  const collapsed = !get().sidebarCollapsed;
  set({ sidebarCollapsed: collapsed });
  saveUiState(SIDEBAR_KEY, collapsed ? '1' : '0');
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
  const collapsed = !get().filmstripCollapsed;
  set({ filmstripCollapsed: collapsed });
  saveUiState(FILMSTRIP_KEY, collapsed ? '1' : '0');
}

export function toggleLibraryList(): void {
  const collapsed = !get().libraryListCollapsed;
  set({ libraryListCollapsed: collapsed });
  saveUiState(LIBRARY_LIST_KEY, collapsed ? '1' : '0');
}

export function togglePromptPanel(): void {
  const collapsed = !get().promptPanelCollapsed;
  set({ promptPanelCollapsed: collapsed });
  saveUiState(PROMPT_PANEL_KEY, collapsed ? '1' : '0');
}

function toggleIn(list: string[], value: string, folded?: boolean): string[] {
  const next = folded ?? !list.includes(value);
  return next ? [...new Set([...list, value])] : list.filter((item) => item !== value);
}

/** `folded`를 주면 그 상태로 맞춘다. */
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

/** 캐릭터 레퍼런스·바이브 그림. 내용 해시 이름이라 바뀌면 이름도 바뀐다. */
export function pictureMedia(file: string): string {
  return libraryApi().mediaUrl({ kind: 'picture' }, file);
}

export function referenceMedia(referenceId: string, relative: string, version?: string): string {
  const url = libraryApi().mediaUrl({ kind: 'reference', id: referenceId }, relative);
  return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}
