import { useState } from 'react';
import { Modal } from '../../components/Dialogs';
import type { FocusPart } from '../../layout';
import { setSettingsOpen } from '../../store';
import { FocusPreview } from './FocusPreview';
import { EdgePeekToggle, FocusLevelGrid } from './FocusSettings';
import { Keys } from './ShortcutsTab';

/** part가 없으면 미니 화면에 없는 곳 */
const PANEL_KEYS: Array<{ keys: string; action: string; part?: FocusPart }> = [
  { keys: 'Ctrl+B', action: '사이드바 펼침 → 아이콘만 → 숨김', part: 'sidebar' },
  { keys: 'F7', action: '왼쪽 패널 숨기기·보이기', part: 'leftPanel' },
  { keys: 'F9', action: '설정 줄 접기·펼치기', part: 'topBar' },
  { keys: 'F8', action: '히스토리 접기·펴기', part: 'history' },
  { keys: 'F6', action: '이미지 목록 접기·펴기' },
];

const CHANGED_KEYS: Array<[string, string]> = [
  ['Ctrl+H', '찾아 바꾸기 (히스토리 접기는 F8로 옮김)'],
  ['Ctrl+F', '찾기'],
  ['F3 / Shift+F3', '다음·이전 찾은 곳'],
  ['휠 클릭', '자동 스크롤'],
];

function KeyList(props: {
  rows: Array<{ keys: string; action: string; part?: FocusPart }>;
  onLight?: (part?: FocusPart) => void;
}) {
  return (
    <dl className="shortcut-list" onMouseLeave={() => props.onLight?.(undefined)}>
      {props.rows.map((row) => (
        <div key={row.keys} onMouseEnter={() => props.onLight?.(row.part)}>
          <dt>
            <Keys keys={row.keys} />
          </dt>
          <dd>{row.action}</dd>
        </div>
      ))}
    </dl>
  );
}

export function WhatsNewDialog({ version, close }: { version: string; close: () => void }) {
  const [lit, setLit] = useState<FocusPart>();
  return (
    <Modal
      wide
      title={`${version}에서 바뀐 점`}
      onClose={close}
      footer={
        <>
          <button
            className="link-button"
            onClick={() => {
              close();
              setSettingsOpen(true, 'keys');
            }}
          >
            단축키 전체 보기 (F1)
          </button>
          <div className="header-spacer" />
          <button className="accent" onClick={close}>
            확인
          </button>
        </>
      }
    >
      <div className="whats-new">
        <section>
          <h3>
            집중 모드 <kbd>Tab</kbd>
          </h3>
          <FocusLevelGrid />
        </section>
        <section className="whats-new-panels">
          <div>
            <h3>패널 하나씩 접기</h3>
            <KeyList rows={PANEL_KEYS} onLight={setLit} />
          </div>
          <FocusPreview hidden={[]} lit={lit} />
        </section>
        <section>
          <h3>바뀐 단축키</h3>
          <KeyList rows={CHANGED_KEYS.map(([keys, action]) => ({ keys, action }))} />
        </section>
        <section>
          <h3>숨긴 패널</h3>
          <EdgePeekToggle />
        </section>
      </div>
    </Modal>
  );
}
