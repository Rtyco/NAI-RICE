import { Modal } from '../../components/Dialogs';
import { setSettingsOpen } from '../../store';

const ADDED: Array<{ title: string; lead: string; items: string[] }> = [
  {
    title: '결과',
    lead: '씬 결과를 모아 보고, 결과를 참고 이미지로 보낼 수 있게 바꿨습니다.',
    items: [
      '씬 상세 모아 보기',
      '「캐릭터 레퍼런스로 보내기」「바이브로 보내기」',
      '결과 이미지 복사',
    ],
  },
  {
    title: '키보드',
    lead: '우클릭 메뉴와 자주 쓰는 동작을 키보드로 할 수 있게 바꿨습니다.',
    items: [
      '우클릭 메뉴 키보드 조작',
      '단축키 추가: 생성, 확대, 폴더에서 보기, 마스크 반전·모두 칠하기, 항목 복제',
    ],
  },
  {
    title: '생성',
    lead: 'Anlas가 드는 생성을 확인하고, 생성이 끝나면 알림을 받을 수 있게 바꿨습니다.',
    items: ['Anlas 사용 확인', '생성 완료 알림'],
  },
  {
    title: '저장 공간',
    lead: '작업 폴더를 다른 폴더나 드라이브로 옮길 수 있게 바꿨습니다.',
    items: ['작업 폴더 위치 바꾸기'],
  },
  {
    title: '화면',
    lead: '화면 배율과 프롬프트 글자 크기를 고를 수 있게 바꿨습니다.',
    items: ['화면 배율 기억', '프롬프트 글자 크기', '라이브러리 씬 모음의 조합 모두 펼치기'],
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
