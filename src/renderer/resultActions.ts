import type { GenerationSummary } from '../core/domain/types';
import type { ResultAction } from './components/resultMenu';
import { libraryApi } from './desktop';
import { makeReferenceFromRecord } from './freeImageOps';
import { deleteShownResult, openImg2ImgDialog, openLineFixDialog } from './generationOps';
import { run } from './store';

/** 씬 상세와 자유 생성 결과에 똑같이 있는 동작 */
export function commonResultActions(
  projectId: string,
  record: GenerationSummary,
  options: {
    records: GenerationSummary[];
    saveAs: (record: GenerationSummary) => void;
    show: (id: string) => void;
  },
): {
  refine: ResultAction;
  lineFix: ResultAction;
  makeReference: ResultAction;
  file: ResultAction[];
} {
  return {
    refine: {
      label: '다듬기',
      icon: 'upscale',
      group: 'send',
      keepLabel: true,
      fold: 8,
      onSelect: () => openImg2ImgDialog(projectId, [record]),
    },
    lineFix: {
      label: '구분선 지우기',
      icon: 'border-line',
      group: 'send',
      keepLabel: true,
      fold: 2,
      onSelect: () => openLineFixDialog(projectId, [record]),
    },
    makeReference: {
      label: '인페인트 만들기',
      icon: 'reference',
      group: 'send',
      keepLabel: true,
      fold: 3,
      onSelect: () => void makeReferenceFromRecord(projectId, record),
    },
    file: [
      {
        label: '다른 이름으로 저장',
        title: '다른 이름으로 저장 (Ctrl+Shift+S)',
        icon: 'save',
        group: 'file',
        iconOnly: true,
        fold: 9,
        onSelect: () => options.saveAs(record),
      },
      {
        label: '폴더에서 보기',
        icon: 'folder',
        group: 'file',
        iconOnly: true,
        fold: 5,
        onSelect: () =>
          void run('폴더를 여는 중', () => libraryApi().showGeneration(projectId, record.id)),
      },
      {
        label: '이 결과 삭제',
        icon: 'trash',
        title: '이 결과 삭제 (Del)',
        group: 'delete',
        iconOnly: true,
        onSelect: () => void deleteShownResult(projectId, options.records, record, options.show),
      },
    ],
  };
}
