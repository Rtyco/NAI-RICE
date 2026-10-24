import { create } from 'zustand';
import type { Library } from '../core/domain/types';
import type { FindPlace } from '../core/model/promptFields';
import { findRanges, type FindQuery, type TextRange } from '../core/prompts/PromptFind';
import { SECTIONS } from './sections';
import { useStore, type View } from './store';

export type FindScope = 'field' | 'item' | 'library';

type FindState = {
  open: boolean;
  replacing: boolean;
  query: string;
  replacement: string;
  wholeTag: boolean;
  includeRecords: boolean;
  /** 켜면 프롬프트 대신 항목·세트·씬·조각 이름에서 찾고 바꾼다. */
  names: boolean;
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
  names: false,
  scope: 'library',
  current: 0,
  opened: 0,
}));

/** 「이 항목」: 라이브러리에서 연 항목, 또는 자유 생성 화면 */
export function findPlaceOf(view: View, library: Library | null): FindPlace | undefined {
  if (view.kind === 'free') return { section: 'free', itemId: '' };
  if (view.kind !== 'library' || !library) return undefined;
  const items = library[view.section];
  const item = items.find((entry) => entry.id === view.itemId) ?? items[0];
  return item && { section: view.section, itemId: item.id };
}

export function findQuery(state: Pick<FindState, 'query' | 'wholeTag'>): FindQuery {
  return { text: state.query, wholeTag: state.wholeTag };
}

export function sectionLabel(section: FindPlace['section']): string {
  if (section === 'free') return '자유 생성';
  if (section === 'projects') return '작업';
  return SECTIONS.find((item) => item.id === section)?.label ?? '';
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
  const typing =
    target ?? (active instanceof HTMLInputElement && active.type === 'text' ? active : undefined);
  const selected = typing?.value.slice(typing.selectionStart ?? 0, typing.selectionEnd ?? 0) ?? '';
  const { view, library } = useStore.getState();
  useFind.setState((state) => {
    const query = selected.trim() && !selected.includes('\n') ? selected : state.query;
    const caret = target?.selectionStart ?? 0;
    const ranges = target ? findRanges(target.value, findQuery({ ...state, query })) : [];
    return {
      open: true,
      replacing,
      query,
      target,
      scope: target ? 'field' : findPlaceOf(view, library) ? 'item' : 'library',
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

/** execCommand여야 Ctrl+Z로 되돌릴 수 있다. */
export function insertText(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
): void {
  if (start === end && !text) return;
  textarea.focus();
  textarea.setSelectionRange(start, end);
  const done = text
    ? document.execCommand('insertText', false, text)
    : document.execCommand('delete');
  if (done) return;
  const value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
    textarea,
    value,
  );
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 옮겨 간 화면이 그려진 뒤 그 이름 칸에 커서를 두고 찾은 글자를 고른다. */
export function revealName(text: string, range: TextRange, tries = 10): void {
  requestAnimationFrame(() => {
    const input = [...document.querySelectorAll<HTMLInputElement>('.main-area input')].find(
      (item) => item.value === text,
    );
    if (!input) {
      if (tries > 1) revealName(text, range, tries - 1);
      return;
    }
    input.scrollIntoView({ block: 'center' });
    input.focus();
    input.setSelectionRange(range.start, range.end);
  });
}
