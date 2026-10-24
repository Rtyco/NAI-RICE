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
      '생성 설정을 상위·하위 프롬프트로 나눔. 씬 프롬프트는 그 사이(중간)나 캐릭터 프롬프트 끝에',
      '예전 공통 포지티브는 상위 프롬프트로 옮겨지며 생성 결과는 같음',
      '작업마다 추가 프롬프트 (상위 프롬프트 뒤에 붙음)',
      'SD Studio 문법: ##주석##, {a|b} 후보, | 자리',
    ],
  },
  {
    title: '씬',
    items: [
      '조합 프롬프트: 칸마다 후보를 두고 모든 조합을 생성',
      '씬 seed와 씬 크기',
      '씬 상세의 「n / m」을 누르면 씬 목록',
      '추가한 캐릭터 칸 지우기',
    ],
  },
  {
    title: '갤러리',
    items: [
      '씬 이름 검색',
      '고른 카드 우클릭: 고른 씬 모두에 대한 메뉴',
      '이미지 내보내기 범위: 씬마다 한 장 · 조합마다 한 장 · 모든 생성 이미지',
      '씬 상세에서 돌아와도 스크롤 위치 유지',
      '한 줄 카드 수 8',
    ],
  },
  {
    title: 'SD Studio',
    items: [
      '프로젝트 가져오기: 조합·seed·캐릭터·상위·하위·추가 프롬프트를 SD Studio에서 생성하던 그대로',
      '씬 내보내기에 조합 칸과 씬 네거티브 포함',
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
