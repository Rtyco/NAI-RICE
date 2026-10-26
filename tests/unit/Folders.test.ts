import { describe, expect, it } from 'vitest';
import { createCharacter, createDefaultLibrary } from '../../src/core/model/defaults';
import {
  groupIntoFolder,
  listRows,
  moveIntoFolder,
  moveNextTo,
  newFolderName,
  renameFolder,
  setFolderColor,
  ungroupFolder,
} from '../../src/core/model/folders';
import { librarySchema } from '../../src/core/validation/schemas';

function libraryWith(...names: string[]) {
  const library = createDefaultLibrary();
  return { ...library, characters: names.map((name) => ({ ...createCharacter(name), id: name })) };
}

const order = (library: ReturnType<typeof libraryWith>) =>
  library.characters.map((item) => `${item.id}${item.folder ? `@${item.folder}` : ''}`);

describe('folders', () => {
  it('폴더는 첫 항목 자리에 보이고 그 안은 목록 순서를 따른다', () => {
    const rows = listRows([
      { id: 'a' },
      { id: 'b', folder: 'F' },
      { id: 'c' },
      { id: 'd', folder: 'F' },
    ]);
    expect(rows.map((row) => (row.kind === 'item' ? row.item.id : row.name))).toEqual([
      'a',
      'F',
      'c',
    ]);
    expect(rows[1].kind === 'folder' && rows[1].items.map((item) => item.id)).toEqual(['b', 'd']);
  });

  it('묶으면 고른 항목을 첫 항목 뒤로 모은다', () => {
    const library = groupIntoFolder(libraryWith('a', 'b', 'c', 'd'), 'characters', ['d', 'b'], 'F');
    expect(order(library)).toEqual(['a', 'b@F', 'd@F', 'c']);
  });

  it('새 폴더 이름은 겹치지 않는다', () => {
    expect(newFolderName([{ id: 'a', folder: '새 폴더' }])).toBe('새 폴더 2');
  });

  it('이름을 바꾸면 같은 이름의 폴더와 합치고, 풀면 폴더 밖으로 나온다', () => {
    let library = groupIntoFolder(libraryWith('a', 'b', 'c'), 'characters', ['a'], 'F');
    library = groupIntoFolder(library, 'characters', ['c'], 'G');
    library = renameFolder(library, 'characters', 'G', 'F');
    expect(order(library)).toEqual(['a@F', 'b', 'c@F']);
    expect(order(ungroupFolder(library, 'characters', 'F'))).toEqual(['a', 'b', 'c']);
  });

  it('폴더 제목에 놓으면 그 폴더 끝으로, 항목에 놓으면 그 항목의 폴더로 들어간다', () => {
    const grouped = groupIntoFolder(libraryWith('a', 'b', 'c', 'd'), 'characters', ['a', 'b'], 'F');
    expect(order(moveIntoFolder(grouped, 'characters', ['d'], 'F'))).toEqual([
      'a@F',
      'b@F',
      'd@F',
      'c',
    ]);
    expect(order(moveNextTo(grouped, 'characters', ['a'], 'a', 'd'))).toEqual([
      'b@F',
      'c',
      'd',
      'a',
    ]);
    expect(order(moveNextTo(grouped, 'characters', ['a', 'b'], 'a', 'd', true))).toEqual([
      'c',
      'd',
      'a@F',
      'b@F',
    ]);
  });

  it('빈 폴더 이름은 폴더 밖으로 읽는다', () => {
    const library = libraryWith('a', 'b');
    const parsed = librarySchema.parse({
      ...library,
      characters: [
        { ...library.characters[0], folder: '  ' },
        { ...library.characters[1], folder: 'F' },
      ],
    });
    expect(parsed.characters.map((item) => item.folder)).toEqual([undefined, 'F']);
  });

  it('폴더 색은 이름을 바꾸면 따라가고, 풀면 지워지고, 같은 이름으로 새로 묶으면 남지 않는다', () => {
    const grouped = groupIntoFolder(libraryWith('a', 'b', 'c'), 'characters', ['a', 'b'], 'F');
    const colored = setFolderColor(grouped, 'characters', 'F', 'blue');
    expect(colored.folderColors).toEqual({ 'characters/F': 'blue' });
    const renamed = renameFolder(colored, 'characters', 'F', 'G');
    expect(renamed.folderColors).toEqual({ 'characters/G': 'blue' });
    expect(ungroupFolder(renamed, 'characters', 'G').folderColors).toBeUndefined();
    // 항목을 끌어내 폴더가 사라져도 색은 남아 있다가, 같은 이름으로 새로 묶을 때 지운다.
    const emptied = moveNextTo(renamed, 'characters', ['a', 'b'], 'a', 'c');
    expect(emptied.folderColors).toEqual({ 'characters/G': 'blue' });
    expect(groupIntoFolder(emptied, 'characters', ['c'], 'G').folderColors).toBeUndefined();
  });

  it('이미 있는 폴더로 이름을 바꿔 합치면 그 폴더의 색을 남긴다', () => {
    let library = groupIntoFolder(libraryWith('a', 'b'), 'characters', ['a'], 'F');
    library = groupIntoFolder(library, 'characters', ['b'], 'G');
    library = setFolderColor(library, 'characters', 'F', 'red');
    library = setFolderColor(library, 'characters', 'G', 'green');
    expect(renameFolder(library, 'characters', 'F', 'G').folderColors).toEqual({
      'characters/G': 'green',
    });
  });

  it('알 수 없는 폴더 색은 버린다', () => {
    const parsed = librarySchema.parse({
      ...libraryWith('a'),
      folderColors: { 'characters/F': 'gold' },
    });
    expect(parsed.folderColors).toBeUndefined();
  });
});
