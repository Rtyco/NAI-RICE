import type { UpdateCheckResult } from '../../core/update/UpdateCheck';
import { appApi } from '../desktop';
import { run, updateLibrary } from '../store';
import { Modal } from './Dialogs';

/** 릴리스 본문에서 화면에 보여 줄 변경 내역. 내려받기·해시 안내(### 받기 이후)는 뺀다. */
function releaseNotes(notes: string | undefined): string {
  if (!notes) return '';
  const text = `\n${notes.replace(/\r\n/g, '\n')}`;
  // \b는 한글 뒤에서 경계로 보지 않으므로 공백·줄 끝으로 확인한다.
  const cut = text.search(/\n#{2,3} 받기(?=\s|$)/);
  return (cut >= 0 ? text.slice(0, cut) : text).trim();
}

/** 릴리스 노트(마크다운)를 가볍게 보여 준다. 제목은 굵게, 목록은 점으로, 강조 기호는 뺀다. */
function ReleaseNotes({ text }: { text: string }) {
  const lines = text.split('\n').filter((line) => line.trim());
  const plain = (line: string) => line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
  return (
    <div className="update-notes">
      {lines.map((line, index) => {
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        if (heading) return <b key={index}>{plain(heading[1])}</b>;
        const item = /^(\s*)[-*]\s+(.*)$/.exec(line);
        if (item)
          return (
            <p key={index} className={item[1] ? 'sub' : ''}>
              &bull; {plain(item[2])}
            </p>
          );
        return <p key={index}>{plain(line)}</p>;
      })}
    </div>
  );
}

function openRelease(url: string): void {
  void run('브라우저를 여는 중', () => appApi().openReleasePage(url));
}

function skipVersion(version: string): void {
  updateLibrary((library) => ({
    ...library,
    settings: {
      ...library.settings,
      update: { ...library.settings.update, skippedVersion: version },
    },
  }));
}

/** 새 버전이 있을 때 띄우는 작은 창. */
export function UpdateDialog({ update, close }: { update: UpdateCheckResult; close: () => void }) {
  const notes = releaseNotes(update.notes);
  const published = update.publishedAt ? new Date(update.publishedAt).toLocaleDateString() : '';
  return (
    <Modal
      title="새 버전이 있습니다"
      onClose={close}
      footer={
        <>
          <button
            className="link-button"
            onClick={() => {
              skipVersion(update.latest!);
              close();
            }}
          >
            이 버전 건너뛰기
          </button>
          <div className="header-spacer" />
          <button onClick={close}>나중에</button>
          {update.url && <button onClick={() => openRelease(update.url!)}>릴리스 페이지</button>}
          <button
            className="accent"
            disabled={!update.downloadUrl && !update.url}
            onClick={() => {
              openRelease(update.downloadUrl ?? update.url!);
              close();
            }}
          >
            새 버전 받기
          </button>
        </>
      }
    >
      <p className="update-versions">
        <span>지금 {update.current}</span>
        <b>&rarr; {update.latest}</b>
        {published && <small>{published}</small>}
      </p>
      {notes && <ReleaseNotes text={notes} />}
      <p className="hint">
        받은 설치 파일을 실행하면 덮어 설치되고, 포터블은 새 파일로 바꿔 쓰면 됩니다. 작업
        데이터(문서\NAI RICE)는 그대로 남습니다.
      </p>
    </Modal>
  );
}
