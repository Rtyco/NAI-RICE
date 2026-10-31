import { useEffect, useState } from 'react';
import type { MovedWorkspace, WorkspaceMoveProgress } from '../../../shared/ipc';
import { Modal } from '../../components/Dialogs';
import { storageApi } from '../../desktop';
import { formatBytes } from '../../lib/bytes';

/** 닫을 수 없다. 끝나면 앱이 다시 시작하고, 실패하면 부른 쪽이 닫는다. */
export function MoveProgressDialog({ root }: { root: string }) {
  const [progress, setProgress] = useState<WorkspaceMoveProgress>();
  useEffect(() => storageApi().onWorkspaceMoveProgress(setProgress), []);
  const ratio = progress?.total ? progress.copied / progress.total : 0;
  return (
    <Modal title="작업 폴더를 옮기는 중" onClose={() => undefined}>
      <p>{root}</p>
      <div className="quota-track">
        <span style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <p className="hint">
        {progress
          ? `${formatBytes(progress.copied)} / ${formatBytes(progress.total)}`
          : '준비하는 중…'}{' '}
        · 끝나면 프로그램을 다시 시작합니다
      </p>
    </Modal>
  );
}

export function PreviousWorkspaceDialog(props: {
  moved: MovedWorkspace;
  close: () => void;
  finish: (trash: boolean) => void;
}) {
  return (
    <Modal
      title="작업 폴더를 옮겼습니다"
      onClose={props.close}
      footer={
        <>
          <button onClick={() => props.finish(false)}>남겨 두기</button>
          <button className="accent" onClick={() => props.finish(true)}>
            휴지통으로 보내기
          </button>
        </>
      }
    >
      <p>새 위치: 「{props.moved.root}」</p>
      <p>이전 폴더 「{props.moved.previousRoot}」를 휴지통으로 보냅니다.</p>
    </Modal>
  );
}
