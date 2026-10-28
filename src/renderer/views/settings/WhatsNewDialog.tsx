import { Modal } from '../../components/Dialogs';
import { setSettingsOpen } from '../../store';

const ADDED: Array<{ title: string; lead: string; items: string[] }> = [
  {
    title: '씬 i2i',
    lead: '씬 상세에서 씬 이미지를 i2i할 수 있게 바꿨습니다.',
    items: [
      '씬 상세의 생성 방식 전환: 프롬프트 생성 | i2i',
      '씬 이미지를 씬 프롬프트로 i2i하고 결과를 그 씬에 쌓기',
      '결과 막대·이미지 메뉴의 「이 결과로 i2i」, 씬 카드 메뉴의 「이 이미지로 i2i」',
    ],
  },
  {
    title: '구분선 지우기',
    lead: '인페인트 결과 가장자리에 남는 검은 선을 지울 수 있게 바꿨습니다.',
    items: [
      '구분선 지우기: 인페인트 결과 가장자리에 남은 검은 선 지우기',
      '자동 후처리: 생성할 때마다 구분선 지우기와 다듬기',
      'i2i로 보낸 이미지의 구분선 자동 마스크, i2i 이미지 칸의 「구분선 찾기」',
    ],
  },
  {
    title: 'NovelAI 계정',
    lead: 'NovelAI 계정을 여러 개 쓸 수 있게 바꿨습니다.',
    items: ['NovelAI 계정 여러 개', 'V5 무료 할당량을 다 쓰면 다음 계정으로 바꾸기'],
  },
  {
    title: '화면',
    lead: '도구 막대를 좁은 창에서도 한 줄로 쓸 수 있게 바꿨습니다.',
    items: [
      '결과 막대와 마스크·그리기 도구 막대를 창 폭에 맞춰 한 줄로 줄이기',
      '히스토리·찾기에서 다른 씬 모음의 결과 열기',
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
