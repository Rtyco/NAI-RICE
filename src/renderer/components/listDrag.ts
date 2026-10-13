import type { DragEvent } from 'react';

/** `folder`가 있으면 폴더째 끈 것이라 놓은 곳의 폴더로 들어가지 않고 자리만 옮긴다. */
export type DragPayload = { ids: string[]; grabbed: string; folder?: string };

/** 끌어 온 항목이 고른 것에 없으면 그 하나만 옮긴다. */
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
