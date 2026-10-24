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

const ADDED: Array<{ title: string; items: string[] }> = [
  {
    title: '프롬프트',
    items: [
      '생성 설정의 프롬프트를 상위·하위로 나눴습니다. 씬 프롬프트는 그 사이나 캐릭터 프롬프트 끝에 들어갑니다.',
      '기존 공통 포지티브는 상위 프롬프트가 되며, 생성 결과는 전과 같습니다.',
      '작업마다 추가 프롬프트를 쓸 수 있습니다. 상위 프롬프트 뒤에 붙습니다.',
      'SD Studio의 ##주석##, {a|b}, | 자리 문법을 지원합니다.',
    ],
  },
  {
    title: '씬',
    items: [
      '조합 프롬프트를 지원합니다. 칸마다 후보를 두면 모든 조합을 생성합니다.',
      '씬마다 seed와 크기를 따로 정할 수 있습니다.',
      '씬 상세의 「n / m」에서 씬 목록을 열 수 있습니다.',
      '추가한 캐릭터 칸을 지울 수 있습니다.',
    ],
  },
  {
    title: '갤러리',
    items: [
      '씬 이름으로 검색할 수 있습니다.',
      '여러 씬을 고른 채 우클릭하면 고른 씬 모두에 적용할 수 있습니다.',
      '이미지 내보내기에서 씬마다 한 장, 조합마다 한 장, 모든 생성 이미지 중에서 고를 수 있습니다.',
      '씬 상세에서 돌아와도 스크롤 위치가 그대로입니다.',
      '한 줄에 카드를 8장까지 놓을 수 있습니다.',
    ],
  },
  {
    title: 'SD Studio',
    items: [
      'SD Studio 프로젝트를 조합, seed, 캐릭터, 상위·하위·추가 프롬프트까지 SD Studio에서 생성하던 그대로 가져옵니다.',
      '씬을 내보낼 때 조합 칸과 씬 네거티브도 함께 내보냅니다.',
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
