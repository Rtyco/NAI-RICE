import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { sidePanelShownOf, toggleSidePanel, useLayout } from '../layout';
import { PaletteSlot } from './FloatingPalette';
import { Icon } from './Icon';
import { PanelResizer } from './PanelResizer';
import { useHostUser, usePaletteHost } from './paletteHost';

/**
 * 오른쪽 입력 패널과 그 왼쪽 내용. 숨기면 `palette`가 떠 있는 창에 뜨고, 패널은 그 창의 팝업에서 연다.
 * 팝업을 닫아 둔 동안은 제자리에 둬야 가장자리 보기가 겹쳐 보인다.
 */
export function SidePanelLayout(props: {
  className: string;
  panelClassName: string;
  panel: ReactNode;
  palette?: ReactNode;
  children: ReactNode;
}) {
  const shown = useLayout(sidePanelShownOf);
  const popup = usePaletteHost((state) => state.panelPopup);
  useHostUser('hiddenPanels', !shown);
  const aside = <aside className={props.panelClassName}>{props.panel}</aside>;
  return (
    <>
      <div className={`${props.className} ${shown ? '' : 'side-hidden'}`}>
        {props.children}
        {!shown && popup ? createPortal(aside, popup) : aside}
        {shown && <PanelResizer panel="side-panel" />}
      </div>
      {!shown && props.palette && <PaletteSlot>{props.palette}</PaletteSlot>}
    </>
  );
}

export function SidePanelToggle() {
  const shown = useLayout(sidePanelShownOf);
  const label = shown ? '입력 패널 숨기기' : '입력 패널 보이기';
  return (
    <button
      className={`icon-button ${shown ? 'active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={shown}
      onClick={toggleSidePanel}
    >
      <Icon name="sliders" size={18} />
    </button>
  );
}
