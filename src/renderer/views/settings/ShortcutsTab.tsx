import { Card } from '../../components/ui';

const SHORTCUTS: Array<{ title: string; keys: Array<[string, string]> }> = [
  {
    title: '화면 이동',
    keys: [
      ['1', '작업 (보던 작업 또는 마지막으로 연 작업)'],
      ['2', '생성 설정'],
      ['3', '캐릭터'],
      ['4', '씬 모음'],
      ['5', '인페인트'],
      ['6', '캐릭터 레퍼런스'],
      ['7', '바이브'],
      ['8', '프롬프트 조각'],
      ['Ctrl+Tab / Ctrl+Shift+Tab', '다음·이전 작업'],
    ],
  },
  {
    title: '전체',
    keys: [
      ['F1', '단축키 보기'],
      ['F2', '고른 작업·라이브러리 항목 이름 바꾸기'],
      ['F5', '새로 고침 (결과 목록·Anlas 다시 읽기)'],
      ['F6', '이미지 목록 접기·펴기'],
      ['F7', '왼쪽 패널 숨기기·보이기'],
      ['F8', '히스토리 접기·펴기'],
      ['F9', '설정 줄 접기·펼치기'],
      ['Ctrl+F', '찾기'],
      ['Ctrl+H', '찾아 바꾸기'],
      ['F3 / Shift+F3', '다음·이전 찾은 곳'],
      ['F11', '전체 화면 켜기·끄기'],
      ['Tab', '집중 모드 (패널 한 번에 숨기기·보이기)'],
      ['Ctrl++ / Ctrl+- / Ctrl+휠', '화면 확대·축소'],
      ['Ctrl+0', '화면 크기 되돌리기'],
      ['휠 클릭', '자동 스크롤'],
      ['Ctrl+N', '새 작업'],
      ['Ctrl+O', 'JSON 가져오기'],
      ['Ctrl+S', '지금 저장 (평소에도 자동 저장)'],
      ['Ctrl+,', '프로그램 설정'],
      ['Ctrl+B', '사이드바 펼침 → 아이콘만 → 숨김'],
      ['Ctrl+G', '고른 작업·라이브러리 항목을 새 폴더로 묶기'],
      ['Ctrl+V', '이미지 붙여 넣기 (끌어 놓기와 같음)'],
      ['Ctrl+W', '창 닫기'],
      ['Esc', '열린 창·메뉴 닫기'],
      ['Enter', '열린 창에서 적용·확인'],
    ],
  },
  {
    title: '여러 개 고르기 (갤러리·결과·라이브러리 목록)',
    keys: [
      ['Ctrl+A', '모두 고르기'],
      ['Ctrl+D / Esc', '고르기 해제'],
      ['Ctrl+클릭 / Shift+클릭', '하나씩·범위로 고르기'],
      ['Delete', '고른 것 삭제'],
    ],
  },
  {
    title: '작업',
    keys: [
      ['Ctrl+P', '최종 요청 미리보기'],
      ['Ctrl+E', '내보내기'],
      ['씬 카드 체크 Shift+클릭', '앞에 누른 체크까지 같은 상태로'],
    ],
  },
  {
    title: '프롬프트 입력',
    keys: [
      ['Ctrl+Enter', '크게 보기 창에서 적용'],
      ['↑ / ↓', '태그 후보 고르기'],
      ['Tab / Enter', '고른 태그 넣기'],
      ['Esc', '태그 후보 닫기'],
    ],
  },
  {
    title: '씬 상세',
    keys: [
      ['← / →', '이전·다음 결과'],
      ['Home / End', '첫·마지막 결과'],
      ['F', '보고 있는 결과를 대표로 지정·해제'],
      ['Ctrl+Shift+S', '보고 있는 결과를 다른 이름으로 저장'],
      ['Delete', '보고 있는 결과 삭제 (휴지통)'],
      ['PageUp / PageDown', '이전·다음 씬'],
      ['Esc', '갤러리로 돌아가기'],
    ],
  },
  {
    title: '자유 생성 결과',
    keys: [
      ['← / →', '이전·다음 결과'],
      ['Home / End', '첫·마지막 결과'],
      ['Ctrl+Shift+S', '보고 있는 결과를 다른 이름으로 저장'],
      ['Delete', '보고 있는 결과 삭제 (휴지통)'],
    ],
  },
  {
    title: '라이브러리',
    keys: [
      ['Alt+↑ / Alt+↓', '이전·다음 항목'],
      ['Ctrl+Shift+N', '이 칸에 새 항목'],
      ['Ctrl+Shift+D', '보고 있는 항목 복제'],
      ['Delete', '보고 있는 항목 삭제'],
      ['F2', '이름 바꾸기'],
    ],
  },
  {
    title: '마스크 칠하기 (인페인트·자유 생성 인페인팅)',
    keys: [
      ['B / E', '칠하기·지우기'],
      ['X', '칠하기와 지우기 바꾸기'],
      ['[ / ]', '붓 크기 줄이기·키우기'],
      ['Space+끌기', '화면 이동'],
      ['Ctrl+Z', '되돌리기'],
      ['Ctrl+Y / Ctrl+Shift+Z', '다시 실행'],
    ],
  },
  {
    title: '이미지 변형 (인페인트 자동 구성)',
    keys: [
      ['Ctrl+T', '이미지 변형 시작·확정'],
      ['Shift+모서리 끌기', '비율 무시하고 크기 바꾸기'],
      ['Alt+끌기', '가운데를 기준으로 크기 바꾸기'],
      ['Shift+바깥 끌기', '15°씩 회전'],
      ['방향키 / Shift+방향키', '1px·10px 옮기기'],
      ['Enter / Esc', '확정·취소'],
      ['Ctrl+Z', '변형 한 단계 되돌리기'],
    ],
  },
  {
    title: '그리기 (자유 생성 i2i·인페인트, 포토샵 계열)',
    keys: [
      ['B / E / G / I', '펜·지우개·채우기·스포이트'],
      ['Alt+클릭 / Ctrl+클릭', '그림에서 색 고르기'],
      ['[ / ]', '크기 줄이기·키우기'],
      ['Shift+[ / Shift+]', '부드러운 끝·둥근 끝'],
      ['1 ~ 9 / 0', '불투명도 10~90%·100% (두 번 빠르게 누르면 두 자리)'],
      ['X', '전경색·배경색 바꾸기'],
      ['D', '검정·흰색으로 되돌리기'],
      ['Shift+클릭', '앞 획 끝에서 곧게 잇기'],
      ['Alt+Backspace / Ctrl+Backspace', '그린 층을 전경색·배경색으로 채우기'],
      ['Delete / Backspace', '그린 것 모두 지우기'],
      ['Space+끌기', '화면 이동'],
      ['Ctrl+Z', '되돌리기'],
      ['Ctrl+Shift+Z / Ctrl+Y', '다시 실행'],
    ],
  },
];

/** 'A / B'는 같은 동작의 다른 키 */
export function Keys({ keys }: { keys: string }) {
  return keys.split(' / ').map((combo, index) => (
    <span key={combo}>
      {index > 0 && ' / '}
      <kbd>{combo}</kbd>
    </span>
  ));
}

export function ShortcutsTab() {
  return (
    <>
      {SHORTCUTS.map((group) => (
        <Card key={group.title} title={group.title}>
          <dl className="shortcut-list">
            {group.keys.map(([keys, action]) => (
              <div key={keys + action}>
                <dt>
                  <Keys keys={keys} />
                </dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </>
  );
}
