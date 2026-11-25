import { Modal } from '../../components/Dialogs';
import { setSettingsOpen } from '../../store';

const ADDED: Array<{ title: string; lead: string; items: string[] }> = [
  {
    title: 'NovelAI V5 · 계정',
    lead: 'V5 정밀 레퍼런스와 Opus Usage Boost 잔량 표시, 요청 간격 무작위화를 지원하게 바꿨습니다.',
    items: [
      'V5 정밀 레퍼런스: 참조 대상 「의상」, 「동일 의상 선호」 설정',
      'Opus Usage Boost 잔량 표시 및 V5 계정 자동 전환 반영',
      '프로그램 설정 › 요청 간격의 「요청 간격 무작위화」',
    ],
  },
  {
    title: '화면 · 라이브러리',
    lead: '자유 생성에서도 결과를 모아 보고, 라이브러리에서 작업을 바로 편집할 수 있게 바꿨습니다.',
    items: ['자유 생성 모아 보기 (G)', '라이브러리의 「작업」 편집'],
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
