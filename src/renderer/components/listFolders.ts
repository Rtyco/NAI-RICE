import { useCallback, useEffect, useRef } from 'react';
import type { FolderColor } from '../../core/domain/types';
import { folderKey } from '../../core/model/folders';
import { useStore } from '../store';

export { folderKey };

export function useFolderColor(scope: string, name: string): FolderColor | undefined {
  return useStore((state) => state.library?.folderColors?.[folderKey(scope, name)]);
}

export const folderColorClass = (color: FolderColor | undefined) =>
  color ? `folder-color-${color}` : '';

export function useFoldedFolders(scope: string): (name: string) => boolean {
  const folded = useStore((state) => state.foldedFolders);
  return (name) => folded.includes(folderKey(scope, name));
}

type GroupTarget = {
  picked: () => string[];
  /** 고른 것이 없을 때 묶을 항목 */
  current: () => string | undefined;
  group: (ids: string[]) => void;
  usedAt: number;
};

const targets = new Set<GroupTarget>();

/** 두 목록에 다 고른 항목이 있으면 마지막으로 누른 목록을 묶도록, 목록을 누를 때 돌려준 함수를 부른다. */
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
