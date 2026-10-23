import { createElement } from 'react';
import { compareVersions } from '../core/update/UpdateCheck';
import { openDialog } from './components/dialogStack';
import { useStore } from './store';
import { patchSettings } from './views/settings/patchSettings';
import { WhatsNewDialog } from './views/settings/WhatsNewDialog';

/** 안내 내용이 바뀐 버전. 다음 버전의 안내를 만들면 올린다. */
export const WHATS_NEW_VERSION = '1.1.2';

export function openWhatsNew(): Promise<void> {
  return openDialog((close) =>
    createElement(WhatsNewDialog, { version: WHATS_NEW_VERSION, close }),
  );
}

/** 새로 설치했으면 main이 seenVersion을 앱 버전으로 채워 두어 띄우지 않는다. */
export async function showWhatsNewOnce(): Promise<void> {
  const seen = useStore.getState().library?.settings.update.seenVersion;
  if (seen === undefined || (seen && compareVersions(seen, WHATS_NEW_VERSION) >= 0)) return;
  await openWhatsNew();
  patchSettings((current) => ({
    ...current,
    update: { ...current.update, seenVersion: WHATS_NEW_VERSION },
  }));
}
