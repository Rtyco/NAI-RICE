import { create } from 'zustand';
import type { Library } from '../core/domain/types';
import { findRanges, type FindQuery } from '../core/prompts/PromptFind';

export type FindScope = 'field' | 'library';

type FindState = {
  open: boolean;
  replacing: boolean;
  query: string;
  replacement: string;
  wholeTag: boolean;
  includeRecords: boolean;
  scope: FindScope;
  /** 「이 칸」의 프롬프트 입력칸 */
  target?: HTMLTextAreaElement;
  /** 「이 칸」에서 고른 찾은 곳의 순번 */
  current: number;
  /** 결과를 눌러 옮겨 갈 때, 이 글을 가진 입력칸이 화면 안으로 스크롤한다. */
  reveal?: string;
  /** 열 때마다 바뀌어 패널이 검색 칸에 포커스를 준다. */
  opened: number;
  /** 라이브러리 전체 바꾸기 한 번. 그 뒤로 라이브러리가 바뀌면 되돌리지 않는다. */
  undo?: { before: Library; after: Library; count: number };
};

export const useFind = create<FindState>(() => ({
  open: false,
  replacing: false,
  query: '',
  replacement: '',
  wholeTag: true,
  includeRecords: false,
  scope: 'library',
  current: 0,
  opened: 0,
}));

export function findQuery(state: FindState): FindQuery {
  return { text: state.query, wholeTag: state.wholeTag };
}

/** 대화상자가 열려 있으면 그 안의 입력칸에서만 쓴다(라이브러리로 옮겨 가면 창이 가려진다). */
export function openFind(replacing: boolean): boolean {
  const active = document.activeElement;
  if (active?.closest('.find-panel')) {
    useFind.setState((state) => ({
      replacing: replacing || state.replacing,
      opened: state.opened + 1,
    }));
    return true;
  }
  const target =
    active instanceof HTMLTextAreaElement && active.classList.contains('syntax-input')
      ? active
      : undefined;
  if (!target && document.querySelector('.modal-backdrop')) return false;
  const selected = target?.value.slice(target.selectionStart, target.selectionEnd) ?? '';
  useFind.setState((state) => {
    const query = selected.trim() && !selected.includes('\n') ? selected : state.query;
    const caret = target?.selectionStart ?? 0;
    const ranges = target
      ? findRanges(target.value, { text: query, wholeTag: state.wholeTag })
      : [];
    return {
      open: true,
      replacing,
      query,
      target,
      scope: target ? 'field' : 'library',
      current: Math.max(
        0,
        ranges.findIndex((range) => range.end > caret),
      ),
      opened: state.opened + 1,
    };
  });
  return true;
}

export function closeFind(): void {
  useFind.setState({ open: false, target: undefined, reveal: undefined });
}
