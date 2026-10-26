import { Modal } from '../../components/Dialogs';
import { setSettingsOpen } from '../../store';

const ADDED: Array<{ title: string; lead: string; items: string[] }> = [
  {
    title: '다듬기',
    lead: '생성한 결과를 바로 이어서 다듬을 수 있게 바꿨습니다.',
    items: [
      '자동 다듬기: 작업과 자유 생성에서 생성할 때마다 다듬기',
      '다듬기 모델과 프롬프트(원본, 네거티브만, 비우기, 직접 입력)',
      '자유 생성 i2i에서 인페인트 불러오기',
    ],
  },
  {
    title: '작업과 내보내기',
    lead: '작업을 다른 곳으로 옮기고 조합을 다루기 쉽게 바꿨습니다.',
    items: [
      'SD Studio 프로젝트로 작업 내보내기',
      'NAI RICE 작업 파일로 작업 내보내기',
      '이미지 내보내기 파일 이름의 조합 번호 {comboNumber}',
      '씬 상세의 조합 후보 여러 개 펼치기, 모두 펴기·접기',
      '조합 후보까지 찾기·바꾸기',
    ],
  },
  {
    title: '화면',
    lead: '좁은 창과 터치 화면, UI 간소화를 지원하게 바꿨습니다.',
    items: [
      '창 폭에 맞춰 패널을 접고 겹쳐 여는 좁은 창 배치(200% 확대 포함)',
      '휴대폰 폭 배치',
      'UI 간소화: 설정 줄과 생성 큐 막대를 아이콘만으로',
      '화면 요소 설정: 칩 편집 버튼, 칩 이름, 자동 다듬기 칩 등 바뀐 화면을 하나씩 켜고 끄기',
      '캔버스 두 손가락 확대·이동',
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
