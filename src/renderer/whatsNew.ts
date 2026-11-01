import { createElement } from 'react';
import { compareVersions, WHATS_NEW_VERSION } from '../core/update/UpdateCheck';
import { openDialog } from './components/dialogStack';
import { useStore } from './store';
import { patchSettings } from './views/settings/patchSettings';
import { WhatsNewDialog } from './views/settings/WhatsNewDialog';

export function openWhatsNew(): Promise<void> {
  return openDialog((close) =>
    createElement(WhatsNewDialog, { version: WHATS_NEW_VERSION, close }),
  );
}

/** 새로 설치했으면 main이 seenVersion을 채워 두어 띄우지 않는다. 끄면 본 것으로만 적는다. */
export async function showWhatsNewOnce(): Promise<void> {
  const seen = useStore.getState().library?.settings.update.seenVersion;
  if (seen === undefined || (seen && compareVersions(seen, WHATS_NEW_VERSION) >= 0)) return;
  if (useStore.getState().library?.settings.update.showWhatsNew) await openWhatsNew();
  patchSettings((current) => ({
    ...current,
    update: { ...current.update, seenVersion: WHATS_NEW_VERSION },
  }));
}
