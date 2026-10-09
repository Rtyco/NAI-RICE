import type { MenuItem } from './ContextMenu';

/**
 * 사이드바 작업 목록과 라이브러리 목록의 우클릭 메뉴. 두 곳이 같은 항목을 같은 순서로 보이게 한다.
 * 작업만 폴더 열기가, 라이브러리 항목만 JSON 내보내기가 있다. 여러 개를 고른 채 그 중 하나에서 우클릭하면
 * 삭제는 고른 것 모두에 한다.
 */
export function listMenu(actions: {
  open: () => void;
  /** 비어 있으면 이름 변경을 막는다(사이드바를 접었을 때). */
  rename?: () => void;
  duplicate: () => void;
  exportJson?: () => void;
  folder?: () => void;
  remove: () => void;
  pickedCount: number;
  removePicked: () => void;
}): MenuItem[] {
  return [
    { label: '열기', onSelect: actions.open },
    { label: '이름 변경', disabled: !actions.rename, onSelect: () => actions.rename?.() },
    { label: '복제', onSelect: actions.duplicate },
    ...(actions.exportJson ? [{ label: 'JSON 내보내기', onSelect: actions.exportJson }] : []),
    ...(actions.folder ? [{ label: '폴더 열기', onSelect: actions.folder }] : []),
    'divider',
    actions.pickedCount > 1
      ? {
          label: `고른 ${actions.pickedCount}개 삭제`,
          danger: true,
          onSelect: actions.removePicked,
        }
      : { label: '삭제', danger: true, onSelect: actions.remove },
  ];
}
