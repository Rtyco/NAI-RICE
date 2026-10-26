import type { FolderColor, Library } from '../domain/types';
import { moveItems, uniqueName } from './mutations';

export type FolderCollection =
  | 'presets'
  | 'characters'
  | 'emotionSets'
  | 'references'
  | 'characterReferences'
  | 'vibes'
  | 'projects'
  | 'pieceSets';

type Foldered = { id: string; folder?: string };

export const FOLDER_COLORS: FolderColor[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
];

/** 접힘(화면 상태)과 색(`Library.folderColors`)이 같은 키를 쓴다. */
export function folderKey(scope: string, name: string): string {
  return `${scope}/${name}`;
}

export function setFolderColor(
  library: Library,
  key: FolderCollection,
  name: string,
  color: FolderColor | undefined,
): Library {
  const at = folderKey(key, name);
  if (library.folderColors?.[at] === color) return library;
  const colors = { ...library.folderColors };
  if (color) colors[at] = color;
  else delete colors[at];
  const next: Library = { ...library, folderColors: colors };
  if (!Object.keys(colors).length) delete next.folderColors;
  return next;
}

export type ListRow<T> = { kind: 'item'; item: T } | { kind: 'folder'; name: string; items: T[] };

/** 폴더는 따로 저장하지 않고 항목의 `folder`로만 정한다. 첫 항목 자리에 보이고, 항목이 모두 빠지면 사라진다. */
export function listRows<T extends Foldered>(items: T[]): ListRow<T>[] {
  const rows: ListRow<T>[] = [];
  const folders = new Map<string, T[]>();
  for (const item of items) {
    if (!item.folder) {
      rows.push({ kind: 'item', item });
      continue;
    }
    const members = folders.get(item.folder);
    if (members) {
      members.push(item);
      continue;
    }
    const created = [item];
    folders.set(item.folder, created);
    rows.push({ kind: 'folder', name: item.folder, items: created });
  }
  return rows;
}

export function folderNames(items: Foldered[]): string[] {
  return [...new Set(items.flatMap((item) => (item.folder ? [item.folder] : [])))];
}

export function newFolderName(items: Foldered[]): string {
  return uniqueName('새 폴더', folderNames(items));
}

function list(library: Library, key: FolderCollection): Foldered[] {
  return library[key];
}

/** `folder`가 없으면 폴더에서 뺀다. */
export function setFolder(
  library: Library,
  key: FolderCollection,
  ids: string[],
  folder: string | undefined,
): Library {
  const moving = new Set(ids);
  return {
    ...library,
    [key]: list(library, key).map((item) => {
      if (!moving.has(item.id)) return item;
      const next = { ...item };
      delete next.folder;
      return folder ? { ...next, folder } : next;
    }),
  };
}

/** 폴더가 첫 항목 자리에 보이도록 나머지를 그 뒤로 모은다. */
export function groupIntoFolder(
  library: Library,
  key: FolderCollection,
  ids: string[],
  name: string,
): Library {
  const items = list(library, key);
  const chosen = items.filter((item) => ids.includes(item.id));
  if (!chosen.length) return library;
  const [first, ...rest] = chosen;
  const grouped = setFolder(gatherAfter(library, key, first.id, rest), key, ids, name);
  // 항목이 모두 빠져 사라진 같은 이름 폴더의 색을 물려받지 않는다.
  return items.some((item) => item.folder === name)
    ? grouped
    : setFolderColor(grouped, key, name, undefined);
}

function gatherAfter(
  library: Library,
  key: FolderCollection,
  anchorId: string,
  rest: Foldered[],
): Library {
  if (!rest.length) return library;
  const moving = new Set(rest.map((item) => item.id));
  const others = list(library, key).filter((item) => !moving.has(item.id));
  const at = others.findIndex((item) => item.id === anchorId);
  others.splice(at + 1, 0, ...rest);
  return { ...library, [key]: others };
}

/** 같은 이름의 폴더가 있으면 합친다. */
export function renameFolder(
  library: Library,
  key: FolderCollection,
  from: string,
  to: string,
): Library {
  const name = to.trim();
  if (!name || name === from) return library;
  const ids = list(library, key)
    .filter((item) => item.folder === from)
    .map((item) => item.id);
  const color = library.folderColors?.[folderKey(key, from)];
  const renamed = setFolderColor(setFolder(library, key, ids, name), key, from, undefined);
  // 이미 있는 폴더와 합치면 그 폴더의 색을 남긴다.
  return renamed.folderColors?.[folderKey(key, name)]
    ? renamed
    : setFolderColor(renamed, key, name, color);
}

export function ungroupFolder(library: Library, key: FolderCollection, name: string): Library {
  const ids = list(library, key)
    .filter((item) => item.folder === name)
    .map((item) => item.id);
  return setFolderColor(setFolder(library, key, ids, undefined), key, name, undefined);
}

export function moveIntoFolder(
  library: Library,
  key: FolderCollection,
  ids: string[],
  name: string,
): Library {
  const items = list(library, key);
  const moving = new Set(ids);
  const members = items.filter((item) => item.folder === name && !moving.has(item.id));
  const placed = members.length
    ? gatherAfter(
        library,
        key,
        members[members.length - 1].id,
        items.filter((item) => moving.has(item.id)),
      )
    : library;
  return setFolder(placed, key, ids, name);
}

/** 항목과 같은 폴더에 넣는다. 폴더째 끌어 온 것(`keepFolder`)은 자리만 옮긴다. */
export function moveNextTo(
  library: Library,
  key: FolderCollection,
  ids: string[],
  grabbedId: string,
  targetId: string,
  keepFolder = false,
): Library {
  const moved = moveItems(library, key, ids, grabbedId, targetId);
  if (keepFolder || moved === library) return moved;
  const target = list(moved, key).find((item) => item.id === targetId);
  return setFolder(moved, key, ids, target?.folder);
}
