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
      ['F11', '전체 화면 켜기·끄기'],
      ['Ctrl++ / Ctrl+- / Ctrl+휠', '화면 확대·축소'],
      ['Ctrl+0', '화면 크기 되돌리기'],
      ['Ctrl+N', '새 작업'],
      ['Ctrl+O', 'JSON 가져오기'],
      ['Ctrl+S', '지금 저장 (평소에도 자동 저장)'],
      ['Ctrl+,', '프로그램 설정'],
      ['Ctrl+B', '사이드바 접기·펴기'],
      ['Ctrl+G', '고른 작업·라이브러리 항목을 새 폴더로 묶기'],
      ['Ctrl+V', '이미지 붙여 넣기 (끌어 놓기와 같음)'],
      ['Ctrl+W', '창 닫기'],
      ['Esc', '열린 창·메뉴 닫기'],
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
      ['PageUp / PageDown / Tab', '이전·다음 씬'],
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
    title: '인페인트 마스크',
    keys: [
      ['Ctrl+Z', '되돌리기'],
      ['Ctrl+Y / Ctrl+Shift+Z', '다시 실행'],
    ],
  },
];

export function ShortcutsTab() {
  return (
    <>
      {SHORTCUTS.map((group) => (
        <Card key={group.title} title={group.title}>
          <dl className="shortcut-list">
            {group.keys.map(([keys, action]) => (
              <div key={keys + action}>
                <dt>
                  {keys.split(' / ').map((combo, index) => (
                    <span key={combo}>
                      {index > 0 && ' / '}
                      <kbd>{combo}</kbd>
                    </span>
                  ))}
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
