import { Modal } from '../../components/Dialogs';
import { setSettingsOpen } from '../../store';

const ADDED: Array<{ title: string; lead: string; items: string[] }> = [
  {
    title: '결과',
    lead: '씬 결과를 모아 보고, 결과를 참고 이미지로 바로 보낼 수 있게 바꿨습니다.',
    items: [
      '씬 상세 모아 보기: 그 씬의 결과 원본을 여러 장 한 화면에 (G)',
      '결과·씬 카드 메뉴의 「캐릭터 레퍼런스로 보내기」「바이브로 보내기」',
      '결과 이미지 복사 (Ctrl+C)',
    ],
  },
  {
    title: '키보드',
    lead: '우클릭 메뉴와 자주 쓰는 동작을 키보드로 할 수 있게 바꿨습니다.',
    items: [
      '우클릭 메뉴를 키보드로: 이름 뒤 글자, 방향키, Shift+F10·메뉴 키',
      '생성 (Ctrl+Enter), 맞춤·원본 크기 전환 (Z), 원본 크기 (Ctrl+1), 폴더에서 보기 (Shift+Alt+R)',
      '마스크 반전 (Ctrl+Shift+I), 모두 칠하기 (Alt+Backspace), 모두 지우기 (Delete)',
      '라이브러리 항목 복제 (Ctrl+J)',
    ],
  },
  {
    title: '생성',
    lead: 'Anlas가 드는 생성을 확인하고, 생성이 끝나면 알림을 받을 수 있게 바꿨습니다.',
    items: [
      'Anlas 사용 확인: 생성 큐에 넣기 전에 예상 Anlas 묻기',
      '생성이 끝나면 Windows 알림, 작업 표시줄 진행 막대',
      '요청 실패 시 다시 시도 횟수와 응답 기다리는 시간',
    ],
  },
  {
    title: '저장 공간',
    lead: '작업 폴더를 다른 폴더나 드라이브로 옮길 수 있게 바꿨습니다.',
    items: ['작업 폴더 위치 바꾸기', '자동 백업과 끝난 큐 기록 보관 수', '결과 삭제 확인 끄기'],
  },
  {
    title: '화면',
    lead: '화면 배율과 프롬프트 글자 크기를 고를 수 있게 바꿨습니다.',
    items: [
      '화면 배율 기억, 프로그램 설정에서 화면 배율과 프롬프트 글자 크기 고르기',
      '내보내기 기본값의 내보낼 이미지와 파일 이름',
      '라이브러리 씬 모음의 조합 모두 펼치기',
    ],
  },
];

export function WhatsNewDialog({ version, close }: { version: string; close: () => void }) {
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
