import { Modal } from '../../components/Dialogs';
import { setSettingsOpen } from '../../store';

const ADDED: Array<{ title: string; lead: string; items: string[] }> = [
  {
    title: '작업과 내보내기',
    lead: '작업을 이미지와 함께 내보내고 가져오며, 선택한 이미지를 한 장으로 모아 저장할 수 있게 바꿨습니다.',
    items: [
      '「작업 내보내기 (이미지 포함)」「SD Studio 프로젝트로 내보내기 (이미지 포함)」',
      '작업 묶음·SD Studio 프로젝트 백업 가져오기',
      '이미지 내보내기의 「한 장으로 모으기」',
      '「씬 이름을 텍스트로 내보내기」',
    ],
  },
  {
    title: '생성',
    lead: '생성 큐의 남은 시간을 보고, 알림과 확인 창을 한곳에서 켜고 끌 수 있게 바꿨습니다.',
    items: ['생성 큐의 남은 예상 시간', '프로그램 설정 › 알림'],
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
