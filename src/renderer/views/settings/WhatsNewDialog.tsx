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
  ['PageUp / PageDown', '이전·다음 씬 (Tab은 집중 모드로 옮김)'],
  ['Ctrl+F', '찾기'],
  ['F3 / Shift+F3', '다음·이전 찾은 곳'],
  ['휠 클릭', '자동 스크롤'],
];

const ADDED: Array<{ title: string; lead: string; items: string[] }> = [
  {
    title: 'SD Studio 호환',
    lead: 'SD Studio 프로젝트를 가져와 SD Studio와 같은 방식으로 생성할 수 있게 바꿨습니다.',
    items: [
      'SD Studio 프로젝트 가져오기·씬 내보내기',
      '상위·하위 프롬프트, 작업마다 추가 프롬프트',
      '조합 프롬프트',
      '##주석##, {a|b}, | 자리 문법',
    ],
  },
  {
    title: '씬과 갤러리',
    lead: '씬이 많은 작업을 다루기 쉽게 바꿨습니다.',
    items: [
      '씬마다 seed와 크기',
      '씬 이름 검색',
      '고른 씬 여러 개에 한 번에 적용하는 우클릭 메뉴',
      '조합마다 한 장, 모든 생성 이미지 내보내기',
    ],
  },
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
        {ADDED.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <p className="whats-new-lead">{group.lead}</p>
            <ul className="whats-new-list">
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
