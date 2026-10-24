import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PREFIX = 'nai-rice-fresh-';

/** `npm run dev:fresh`: 처음 설치한 상태를 보는 임시 폴더. 지난 실행이 남긴 폴더는 여기서 지운다. */
export function createFreshRoot(): string {
  const parent = os.tmpdir();
  for (const name of readdirSync(parent)) {
    if (!name.startsWith(PREFIX)) continue;
    try {
      rmSync(path.join(parent, name), { recursive: true, force: true });
    } catch {
      // 다른 dev:fresh 실행이 쓰는 중이다.
    }
  }
  return mkdtempSync(path.join(parent, PREFIX));
}

/** Chromium은 프로세스가 끝날 때까지 userData의 캐시 파일을 잡고, 큐는 종료 중에 저장된다. 앱이 끝난 뒤 지운다. */
export function removeFreshRoot(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // 잡힌 파일은 아래에서 지운다.
  }
  if (!existsSync(root) || process.platform !== 'win32') return;
  // 경로의 따옴표를 Node가 \"로 바꾸면 cmd가 읽지 못한다.
  spawn('cmd.exe', ['/d', '/s', '/c', `"ping -n 3 127.0.0.1 >nul & rmdir /s /q "${root}""`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    windowsVerbatimArguments: true,
  }).unref();
}
