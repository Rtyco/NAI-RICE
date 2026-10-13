import { useEffect, useRef, useState } from 'react';
import type { GenerationSummary } from '../../core/domain/types';
import { deleteResults, deleteShownResult } from '../generationOps';
import { useBoxSelection } from './useBoxSelection';

/**
 * 결과 화면(씬 상세·자유 생성)에서 보고 있는 결과와 아래 목록의 여러 장 고르기. ←/→/Home/End로 넘기고,
 * Ctrl+Shift+S로 저장하고, Delete로 보고 있는 결과를 지운다.
 */
export function useResultBrowser(
  projectId: string,
  records: GenerationSummary[],
  options: {
    /** 고른 결과가 없을 때 먼저 보일 결과(대표 이미지). 없으면 최신 결과다. */
    preferredId?: string;
    /** 화면을 연 뒤에 새 결과가 왔을 때. */
    onNewResult?: () => void;
    saveAs: (record: GenerationSummary) => void;
    /** 보고 있는 결과를 Delete로 지울 수 있는지. 결과 막대가 보일 때만 지운다. */
    canDeleteShown?: boolean;
  },
) {
  const [selectedId, setSelectedId] = useState<string>();
  const selected =
    records.find((record) => record.id === selectedId) ??
    records.find((record) => record.id === options.preferredId) ??
    records[0];

  // 새 결과가 오면 그 결과를 보여 준다. 최신 결과를 지워 맨 앞이 바뀐 것은 새 결과가 아니므로 그대로 둔다.
  const newest = records[0];
  const seenNewest = useRef(newest?.createdAt);
  const onNewResult = useRef(options.onNewResult);
  useEffect(() => {
    onNewResult.current = options.onNewResult;
  });
  useEffect(() => {
    if (newest && (!seenNewest.current || newest.createdAt > seenNewest.current)) {
      setSelectedId(undefined);
      if (seenNewest.current) onNewResult.current?.();
    }
    seenNewest.current = newest?.createdAt;
  }, [newest]);

  const removeMany = (ids: string[]) =>
    void deleteResults(
      projectId,
      records.filter((record) => ids.includes(record.id)),
    );
  const picking = useBoxSelection<HTMLDivElement>(
    records.map((record) => record.id),
    removeMany,
    { selectAllKey: () => records.map((record) => record.id) },
  );
  const pickedCount = picking.selected.size;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select')) return;
      const position = records.findIndex((record) => record.id === selected?.id);
      if (event.key === 'ArrowRight' && records[position + 1])
        setSelectedId(records[position + 1].id);
      if (event.key === 'ArrowLeft' && position > 0) setSelectedId(records[position - 1].id);
      if (event.key === 'Home' && records.length) setSelectedId(records[0].id);
      if (event.key === 'End' && records.length) setSelectedId(records[records.length - 1].id);
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 's' && selected) {
        event.preventDefault();
        options.saveAs(selected);
      }
      // 여러 장을 고른 동안의 Delete는 고른 것을 지운다(useBoxSelection이 처리).
      if (
        event.key === 'Delete' &&
        !pickedCount &&
        (options.canDeleteShown ?? true) &&
        selected &&
        !document.querySelector('.modal-backdrop')
      ) {
        event.preventDefault();
        void deleteShownResult(projectId, records, selected, setSelectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return { selected, setSelectedId, picking, removeMany };
}

export type ResultBrowser = ReturnType<typeof useResultBrowser>;
