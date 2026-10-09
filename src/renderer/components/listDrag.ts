import type { DragEvent } from 'react';

/** 끌어 옮기는 목록 항목. 여러 개를 고른 채 그 중 하나를 끌면 고른 것 모두를 옮긴다. */
export type DragPayload = { ids: string[]; grabbed: string };

/** `order`는 목록 순서다. 끌어 온 항목이 고른 것에 없으면 그 하나만 옮긴다. */
export function dragPayload(id: string, selected: Set<string>, order: string[]): DragPayload {
  const ids = selected.has(id) && selected.size > 1 ? order.filter((x) => selected.has(x)) : [id];
  return { ids, grabbed: id };
}

export function writeDragPayload(event: DragEvent, type: string, payload: DragPayload): void {
  event.dataTransfer.setData(type, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = 'move';
}

export function readDragPayload(event: DragEvent, type: string): DragPayload | undefined {
  try {
    const value: unknown = JSON.parse(event.dataTransfer.getData(type));
    const payload = value as DragPayload;
    return Array.isArray(payload?.ids) && typeof payload.grabbed === 'string' ? payload : undefined;
  } catch {
    return undefined;
  }
}
