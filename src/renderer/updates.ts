import { createElement } from 'react';
import type { UpdateCheckResult } from '../core/update/UpdateCheck';
import { openDialog } from './components/Dialogs';
import { UpdateDialog } from './components/UpdateDialog';
import { appApi } from './desktop';
import { errorMessage, toast, useStore } from './store';

/**
 * GitHub 최신 릴리스와 비교한다. 자동 확인은 새 버전이 있고 건너뛰지 않은 버전일 때만 창을 띄우고, 오류는
 * 조용히 넘긴다. 직접 누른 확인(manual)은 결과를 항상 알린다.
 */
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
