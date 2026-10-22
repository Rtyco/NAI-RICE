import { useEffect, useRef, useState } from 'react';
import type { GenerationSummary } from '../../core/domain/types';
import { deleteResults, deleteShownResult } from '../generationOps';
import { requestResult, setShownResult, useStore } from '../store';
import { useBoxSelection } from './useBoxSelection';

export function useResultBrowser(
  projectId: string,
  records: GenerationSummary[],
  options: {
    /** 고른 결과가 없을 때 보일 결과(대표 이미지). 없으면 최신. */
    preferredId?: string;
    onNewResult?: () => void;
    /** 히스토리에서 이 화면의 결과를 골랐을 때 */
    onRequested?: () => void;
    saveAs: (record: GenerationSummary) => void;
    /** 결과 막대가 보일 때만 */
    canDeleteShown?: boolean;
  },
) {
  const [selectedId, setSelectedId] = useState<string>();
  const selected =
    records.find((record) => record.id === selectedId) ??
    records.find((record) => record.id === options.preferredId) ??
    records[0];

  // 최신 결과를 지워 맨 앞이 바뀐 것은 새 결과가 아니다.
  const newest = records[0];
  const seenNewest = useRef(newest?.createdAt);
  const onNewResult = useRef(options.onNewResult);
  const onRequested = useRef(options.onRequested);
  useEffect(() => {
    onNewResult.current = options.onNewResult;
    onRequested.current = options.onRequested;
  });
  useEffect(() => {
    if (newest && (!seenNewest.current || newest.createdAt > seenNewest.current)) {
      setSelectedId(undefined);
      if (seenNewest.current) onNewResult.current?.();
    }
    seenNewest.current = newest?.createdAt;
  }, [newest]);

  const request = useStore((state) => state.resultRequest);
  useEffect(() => {
    if (request?.projectId !== projectId) return;
    if (!records.some((record) => record.id === request.id)) return;
    setSelectedId(request.id);
    requestResult(undefined);
    onRequested.current?.();
  }, [request, records, projectId]);

  const shownId = selected?.id;
  useEffect(() => {
    setShownResult(shownId ? { projectId, id: shownId } : undefined);
    return () => setShownResult(undefined);
  }, [projectId, shownId]);

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
      // 여러 장을 고른 동안의 Delete는 useBoxSelection이 처리한다.
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
