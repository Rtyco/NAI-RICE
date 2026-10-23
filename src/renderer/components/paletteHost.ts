import { useEffect } from 'react';
import { create } from 'zustand';

/** 쓰는 곳이 없고 생성 큐 막대도 보이면 떠 있는 창을 그리지 않는다. */
type PaletteHost = {
  slot: HTMLElement | null;
  panelPopup: HTMLElement | null;
  slotUsers: number;
  hiddenPanels: number;
};

export const usePaletteHost = create<PaletteHost>(() => ({
  slot: null,
  panelPopup: null,
  slotUsers: 0,
  hiddenPanels: 0,
}));

export function setPaletteSlot(slot: HTMLElement | null): void {
  usePaletteHost.setState({ slot });
}

export function setPanelPopup(panelPopup: HTMLElement | null): void {
  usePaletteHost.setState({ panelPopup });
}

/** `active`인 동안 그 자리를 쓰는 수를 하나 올린다. */
export function useHostUser(counter: 'slotUsers' | 'hiddenPanels', active = true): void {
  useEffect(() => {
    if (!active) return;
    const change = (step: number) =>
      usePaletteHost.setState((state) => ({ [counter]: state[counter] + step }));
    change(1);
    return () => change(-1);
  }, [counter, active]);
}
