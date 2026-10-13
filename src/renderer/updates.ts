import { createElement } from 'react';
import type { UpdateCheckResult } from '../core/update/UpdateCheck';
import { openDialog } from './components/Dialogs';
import { UpdateDialog } from './components/UpdateDialog';
import { appApi } from './desktop';
import { errorMessage, toast, useStore } from './store';

/** 자동 확인은 새 버전이 있고 건너뛰지 않았을 때만 창을 띄우고 오류는 넘긴다. manual이면 결과를 항상 알린다. */
export async function checkForUpdate(manual = false): Promise<void> {
  if (manual) useStore.setState({ busy: '업데이트를 확인하는 중' });
  try {
    const update = await appApi().checkForUpdate();
    useStore.setState({ update });
    const skipped = useStore.getState().library?.settings.update.skippedVersion;
    if (update.newer && (manual || update.latest !== skipped))
      void openDialog((close) => createElement(UpdateDialog, { update, close }));
    else if (manual) toast(update.message);
  } catch (error) {
    if (manual) toast(errorMessage(error), 'error');
  } finally {
    if (manual) useStore.setState({ busy: '' });
  }
}

export function openUpdateDialog(update: UpdateCheckResult): void {
  void openDialog((close) => createElement(UpdateDialog, { update, close }));
}
