import { isTypingTarget } from '../useShortcut';
import { closeContextMenu, useContextMenu } from './contextMenuStore';

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

let pointer = { x: 0, y: 0 };

function menuButtons(): HTMLButtonElement[] {
  return [
    ...document.querySelectorAll<HTMLButtonElement>(
      '.context-menu > [role="menuitem"]:not(:disabled)',
    ),
  ];
}

function moveFocus(buttons: HTMLButtonElement[], step: number | 'first' | 'last'): void {
  if (!buttons.length) return;
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    step === 'first'
      ? 0
      : step === 'last'
        ? buttons.length - 1
        : at < 0
          ? step > 0
            ? 0
            : buttons.length - 1
          : (at + step + buttons.length) % buttons.length;
  buttons[next].focus();
}

/** 이름 뒤 글자가 하나뿐이면 바로 실행하고, 겹치면 Windows처럼 그 항목들 사이로 옮겨 간다. */
function pressAccessKey(letter: string): void {
  const matches = menuButtons().filter((button) => button.dataset.accessKey === letter);
  if (matches.length === 1) matches[0].click();
  else moveFocus(matches, 1);
}

function onMenuKey(event: KeyboardEvent): void {
  if (MODIFIERS.has(event.key)) return;
  if (event.ctrlKey || event.altKey || event.metaKey) {
    closeContextMenu();
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  const buttons = menuButtons();
  if (event.key === 'Escape' || event.key === 'ContextMenu' || event.key === 'F10')
    closeContextMenu();
  else if (event.key === 'ArrowDown') moveFocus(buttons, 1);
  else if (event.key === 'ArrowUp') moveFocus(buttons, -1);
  else if (event.key === 'Home') moveFocus(buttons, 'first');
  else if (event.key === 'End') moveFocus(buttons, 'last');
  else if (event.key === 'Enter' || event.key === ' ') {
    const focused = buttons.find((button) => button === document.activeElement);
    focused?.click();
  } else {
    // 한글 입력 상태에서도 글자를 찾도록 key 대신 code를 본다.
    const letter = /^(?:Key|Digit|Numpad)([A-Z0-9])$/.exec(event.code)?.[1];
    if (letter) pressAccessKey(letter);
  }
}

function isMenuKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey) return false;
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
}

/** 오른쪽 클릭과 같은 이벤트를 보내 그 자리의 메뉴를 연다. 메뉴를 연 곳이 있으면 true. */
function dispatchMenu(target: Element | null, x: number, y: number): boolean {
  if (!target) return false;
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: x,
    clientY: y,
  });
  return !target.dispatchEvent(event);
}

/** 고른 항목(포커스)의 메뉴를, 없으면 마우스가 있는 곳의 메뉴를 연다. */
function openFromKeyboard(): void {
  const focused = document.activeElement;
  if (focused && focused !== document.body) {
    const rect = focused.getBoundingClientRect();
    if (dispatchMenu(focused, rect.left + rect.width / 2, rect.top + rect.height / 2)) return;
  }
  dispatchMenu(document.elementFromPoint(pointer.x, pointer.y), pointer.x, pointer.y);
}

/**
 * 캔버스 단축키(캡처 단계)보다 먼저 받아야 해 화면을 그리기 전에 단다. 메뉴가 열린 동안의 키는 메뉴만
 * 받는다.
 */
export function installContextMenuKeys(): void {
  window.addEventListener(
    'pointermove',
    (event) => {
      pointer = { x: event.clientX, y: event.clientY };
    },
    { passive: true },
  );
  window.addEventListener(
    'keydown',
    (event) => {
      if (useContextMenu.getState()) {
        onMenuKey(event);
        return;
      }
      if (!isMenuKey(event)) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      openFromKeyboard();
    },
    true,
  );
  // Chromium은 Windows에서 메뉴 키를 뗄 때 기본 메뉴 이벤트를 따로 보낸다.
  window.addEventListener(
    'keyup',
    (event) => {
      if (isMenuKey(event)) event.preventDefault();
    },
    true,
  );
}
