import type { MenuItem } from './contextMenuStore';

export type ListMenuActions = {
  open: () => void;
  /** 없으면 이름 변경을 막는다(사이드바를 접었을 때). */
  rename?: () => void;
  duplicate: () => void;
  exportJson?: () => void;
  /** 작업만 */
  exports?: Array<{ label: string; onSelect: () => void }>;
  /** 바이브만 */
  exportVibes?: () => void;
  folder?: () => void;
  remove: () => void;
  pickedCount: number;
  removePicked: () => void;
  /** 없으면 폴더 메뉴를 숨긴다(사이드바를 접었을 때). */
  group?: () => void;
  /** 폴더 안 항목일 때만 */
  ungroup?: () => void;
};

/** 고른 것 중 하나에서 우클릭하면 묶기·삭제는 고른 것 모두에 한다. */
export function listMenu(actions: ListMenuActions): MenuItem[] {
  return [
    { label: '열기', onSelect: actions.open },
    { label: '이름 변경', disabled: !actions.rename, onSelect: () => actions.rename?.() },
    { label: '복제', onSelect: actions.duplicate },
    ...(actions.exportJson ? [{ label: 'JSON 내보내기', onSelect: actions.exportJson }] : []),
    ...(actions.exports ?? []),
    ...(actions.exportVibes
      ? [
          {
            label:
              actions.pickedCount > 1
                ? `고른 ${actions.pickedCount}개를 바이브 묶음으로 내보내기`
                : '바이브 파일로 내보내기',
            onSelect: actions.exportVibes,
          },
        ]
      : []),
    ...(actions.folder ? [{ label: '폴더 열기', onSelect: actions.folder }] : []),
    ...(actions.group
      ? [
          'divider' as const,
          {
            label:
              actions.pickedCount > 1
                ? `고른 ${actions.pickedCount}개를 폴더로 묶기`
                : '폴더로 묶기',
            hint: 'Ctrl+G',
            onSelect: actions.group,
          },
        ]
      : []),
    ...(actions.ungroup ? [{ label: '폴더에서 빼기', onSelect: actions.ungroup }] : []),
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
