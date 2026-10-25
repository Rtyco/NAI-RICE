import { app, BrowserWindow, net, protocol, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { imageMime } from './services/fsUtils';
import type { Library } from './services/Library';

export const MEDIA_SCHEME = 'desk-media';

/** 약 10% */
export const ZOOM_STEP = 0.5;

function sendWindowState(window: BrowserWindow, fullScreen = window.isFullScreen()): void {
  window.webContents.send('app:window-state', {
    fullScreen,
    zoomPercent: Math.round(window.webContents.getZoomFactor() * 100),
  });
}

/** null이면 100%. 50%~200%. */
export function zoomWindow(window: BrowserWindow, step: number | null): void {
  const level = window.webContents.getZoomLevel();
  window.webContents.setZoomLevel(step === null ? 0 : Math.max(-3.8, Math.min(3.8, level + step)));
  sendWindowState(window);
}

/** app 준비 전에 불러야 한다. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** desk-media://local/<작업 폴더 기준 경로>만. 링크로 밖을 가리키면 404. */
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

/** layout.css --titlebar-height(40px)보다 1px 낮아야 아래 경계선이 창 버튼 밑까지 이어진다. */
const TITLE_BAR_HEIGHT = 39;

/** 외부 링크와 페이지 이동은 막는다. */
export function createWindow(title: string, moduleDirectory: string): void {
  const window = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 480,
    minHeight: 560,
    backgroundColor: '#0c1424',
    title,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0c1424', symbolColor: '#b9c9dc', height: TITLE_BAR_HEIGHT },
    webPreferences: {
      preload: path.join(moduleDirectory, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      // 세션의 검사기와 사전은 main.ts의 disableSpellChecker가 끈다.
      spellcheck: false,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://docs.novelai.net/')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // 메뉴 막대가 없어 Electron 기본 단축키도 없다. 전체 화면 이벤트는 늦게 올 때가 있어 F11을 누른 순간에 바로 보낸다.
  window.on('enter-full-screen', () => sendWindowState(window, true));
  window.on('leave-full-screen', () => sendWindowState(window, false));
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    const ctrl = input.control && !input.alt && !input.meta;
    let handled = true;
    if (key === 'f11' && !input.control && !input.alt) {
      const next = !window.isFullScreen();
      window.setFullScreen(next);
      sendWindowState(window, next);
    } else if (ctrl && key === 'w') window.close();
    else if (ctrl && (key === '=' || key === '+')) zoomWindow(window, ZOOM_STEP);
    else if (ctrl && key === '-') zoomWindow(window, -ZOOM_STEP);
    else if (ctrl && key === '0') zoomWindow(window, null);
    else handled = false;
    if (handled) event.preventDefault();
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
  // 배포판이 환경 변수로 다른 페이지를 불러오면 그 페이지가 preload API를 받는다.
  const developmentUrl = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) void window.loadURL(developmentUrl);
  else void window.loadFile(path.join(moduleDirectory, '..', 'dist-renderer', 'index.html'));
}
