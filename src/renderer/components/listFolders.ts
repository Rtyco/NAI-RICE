import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store';

export function folderKey(scope: string, name: string): string {
  return `${scope}/${name}`;
}

export function useFoldedFolders(scope: string): (name: string) => boolean {
  const folded = useStore((state) => state.foldedFolders);
  return (name) => folded.includes(folderKey(scope, name));
}

type GroupTarget = {
  /** 상자·Ctrl·Shift로 고른 항목. */
  picked: () => string[];
  /** 고른 것이 없을 때 묶을 지금 보고 있는 항목. */
  current: () => string | undefined;
  group: (ids: string[]) => void;
  usedAt: number;
};

const targets = new Set<GroupTarget>();

/**
 * Ctrl+G로 묶을 수 있는 목록(사이드바 작업 목록, 라이브러리 목록)을 등록한다. 돌려주는 함수는 목록을 누를 때
 * 불러, 두 목록에 다 고른 항목이 있으면 마지막으로 만진 목록을 묶게 한다.
 */
export function useGroupTarget(spec: Omit<GroupTarget, 'usedAt'>): () => void {
  const target = useRef<GroupTarget>({ ...spec, usedAt: 0 });
  Object.assign(target.current, spec);
  useEffect(() => {
    const current = target.current;
    targets.add(current);
    return () => {
      targets.delete(current);
    };
  }, []);
  return useCallback(() => {
    target.current.usedAt = Date.now();
  }, []);
}

/** 고른 항목이 있는 목록을 먼저, 없으면 지금 보고 있는 항목을 새 폴더로 묶는다. */
export function groupFromShortcut(): boolean {
  const ordered = [...targets].sort((a, b) => b.usedAt - a.usedAt);
  for (const target of ordered) {
    const ids = target.picked();
    if (ids.length) {
      target.group(ids);
      return true;
    }
  }
  for (const target of ordered) {
    const id = target.current();
    if (id) {
      target.group([id]);
      return true;
    }
  }
  return false;
}
