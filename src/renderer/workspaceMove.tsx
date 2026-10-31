import { confirmDialog, openDialog } from './components/dialogStack';
import { storageApi } from './desktop';
import { formatBytes } from './lib/bytes';
import { flushSaves, run, toast, useStore } from './store';
import { MoveProgressDialog, PreviousWorkspaceDialog } from './views/settings/WorkspaceMoveDialogs';

export async function moveWorkspaceTo(folder: string): Promise<void> {
  const plan = await run('옮길 위치를 확인하는 중', () => storageApi().planWorkspaceMove(folder));
  if (!plan) return;
  const current = useStore.getState().root;
  const ok = await confirmDialog(
    plan.mode === 'copy'
      ? {
          title: '작업 폴더 옮기기',
          message: (
            <>
              <p>
                작업 폴더({formatBytes(plan.bytes)})를 「{plan.root}」로 복사하고 프로그램을 다시
                시작합니다.
              </p>
              <p>
                <b>다시 시작하면 이전 폴더 「{current}」는 휴지통으로 보냅니다.</b> 다시 시작한 뒤
                남겨 둘 수도 있습니다.
              </p>
            </>
          ),
          confirmLabel: '옮기고 다시 시작',
        }
      : {
          title: '작업 폴더 바꾸기',
          message: (
            <p>
              「{plan.root}」에 있는 작업 데이터로 바꾸고 프로그램을 다시 시작합니다. 지금 폴더 「
              {current}」는 그대로 남습니다.
            </p>
          ),
          confirmLabel: '바꾸고 다시 시작',
        },
  );
  if (!ok) return;
  await flushSaves();
  let closeProgress: (() => void) | undefined;
  void openDialog((close) => {
    closeProgress = close;
    return <MoveProgressDialog root={plan.root} />;
  });
  try {
    await storageApi().moveWorkspace(plan.root);
  } catch (error) {
    closeProgress?.();
    toast(
      `작업 폴더를 옮기지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
  }
}

/** 옮긴 뒤 처음 시작했을 때. 창을 그냥 닫으면 다음에 다시 묻는다. */
export async function askAboutPreviousWorkspace(): Promise<void> {
  const moved = await Promise.resolve()
    .then(() => storageApi().movedWorkspace())
    .catch(() => null);
  if (!moved) return;
  await openDialog((close) => (
    <PreviousWorkspaceDialog
      moved={moved}
      close={close}
      finish={(trash) => {
        close();
        void run(trash ? '이전 폴더를 휴지통으로 보내는 중' : '설정을 저장하는 중', async () => {
          await storageApi().finishWorkspaceMove(trash);
          if (trash) toast('이전 작업 폴더를 휴지통으로 보냈습니다.');
        });
      }}
    />
  ));
}
