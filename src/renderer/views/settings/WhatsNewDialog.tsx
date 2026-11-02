import { Modal } from '../../components/Dialogs';
import { setSettingsOpen } from '../../store';

const ADDED: Array<{ title: string; lead: string; items: string[] }> = [
  {
    title: '작업과 내보내기',
    lead: '생성 결과까지 담아 작업을 옮기고, 씬 이미지를 한 장으로 모아 저장할 수 있게 바꿨습니다.',
    items: [
      '생성 결과를 담은 NAI RICE 작업 묶음(.tar) 내보내기·가져오기',
      '생성 결과를 담은 SD Studio 프로젝트 백업 내보내기·가져오기',
      '씬 이미지를 한 장으로 모아 내보내기',
      '씬 이름을 텍스트로 내보내기',
    ],
  },
  {
    title: '생성',
    lead: '생성 큐가 끝날 때까지 남은 시간을 보고, 알림과 확인 창을 한곳에서 고를 수 있게 바꿨습니다.',
    items: ['생성 큐의 남은 예상 시간', '프로그램 설정 「알림」 탭'],
  },
  {
    title: '화면',
    lead: '씬이 많은 작업에서도 빠르게 움직이도록 바꿨습니다.',
    items: ['씬이 많은 작업과 패널 여닫기 성능 개선'],
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
