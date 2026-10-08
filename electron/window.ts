import { app, BrowserWindow, dialog, net, protocol, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { imageMime } from './services/fsUtils';
import type { Library } from './services/Library';

export const MEDIA_SCHEME = 'desk-media';

/** app이 준비되기 전에 불러야 한다. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** desk-media://local/<작업 폴더 기준 경로> 만 허용한다. 링크로 작업 폴더 밖을 가리키면 404. */
export function handleMediaProtocol(library: Library): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const relative = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const absolute = await library.verifyReal(library.resolveMedia(relative));
      const response = await net.fetch(pathToFileURL(absolute).toString());
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': imageMime(absolute),
          'Cache-Control': 'max-age=31536000, immutable',
        },
      });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

export function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload);
}

export function anyWindowVisible(): boolean {
  return BrowserWindow.getAllWindows().some(
    (window) => window.isVisible() && !window.isMinimized(),
  );
}

/** Anlas가 쓰일 수 있는 생성을 계속할지 묻는다. */
export async function confirmAnlasUse(jobCount: number, warnings: string[]): Promise<boolean> {
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    title: 'Anlas 사용 확인',
    message: `${jobCount}개의 이미지가 무료 생성 기준을 넘어 Anlas가 차감될 수 있습니다.`,
    detail: warnings.join('\n'),
    buttons: ['그래도 생성', '취소'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
  const parent = BrowserWindow.getFocusedWindow();
  const confirmation = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);
  return confirmation.response === 0;
}

/** styles.css의 .titlebar(32px)보다 1px 낮게 해서 아래 경계선이 창 버튼 밑까지 이어지게 한다. */
const TITLE_BAR_HEIGHT = 31;

/** 원격 콘텐츠를 불러오지 않는 격리된 창. 외부 링크와 페이지 이동은 막는다. */
export function createWindow(title: string, moduleDirectory: string): void {
  const window = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#0c1424',
    title,
    // 기본 흰색 제목 표시줄 대신 화면 맨 위 줄을 직접 그리고, 창 버튼만 테마 색으로 얹는다.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0c1424', symbolColor: '#b9c9dc', height: TITLE_BAR_HEIGHT },
    webPreferences: {
      preload: path.join(moduleDirectory, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      // 맞춤법 검사 표시를 끈다. 세션의 검사기와 사전은 main.ts의 disableSpellChecker가 끈다.
      spellcheck: false,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://docs.novelai.net/')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // 메뉴 막대를 없애 Electron 기본 단축키도 함께 사라졌으므로 창 단위 단축키는 여기서 처리한다.
  // 전체 화면 이벤트는 늦게 올 때가 있어 F11을 누른 순간에도 바뀔 상태를 바로 보낸다.
  const sendWindowState = (fullScreen = window.isFullScreen()) =>
    window.webContents.send('app:window-state', {
      fullScreen,
      zoomPercent: Math.round(window.webContents.getZoomFactor() * 100),
    });
  const zoom = (step: number | null) => {
    const level = window.webContents.getZoomLevel();
    // 한 단계는 약 10%. 50%~200% 사이로 둔다.
    const next = step === null ? 0 : Math.max(-3.8, Math.min(3.8, level + step));
    window.webContents.setZoomLevel(next);
    sendWindowState();
  };
  window.on('enter-full-screen', () => sendWindowState(true));
  window.on('leave-full-screen', () => sendWindowState(false));
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    const ctrl = input.control && !input.alt && !input.meta;
    let handled = true;
    if (key === 'f11' && !input.control && !input.alt) {
      const next = !window.isFullScreen();
      window.setFullScreen(next);
      sendWindowState(next);
    } else if (ctrl && key === 'w') window.close();
    else if (ctrl && (key === '=' || key === '+')) zoom(0.5);
    else if (ctrl && key === '-') zoom(-0.5);
    else if (ctrl && key === '0') zoom(null);
    else handled = false;
    if (handled) event.preventDefault();
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) void window.loadURL(developmentUrl);
  else void window.loadFile(path.join(moduleDirectory, '..', 'dist-renderer', 'index.html'));
}
