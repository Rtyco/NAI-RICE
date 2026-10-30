import type { GenerationSummary } from '../core/domain/types';
import type { ResultAction } from './components/resultMenu';
import { fileApi, libraryApi } from './desktop';
import { makeAidFromRecord, makeReferenceFromRecord } from './freeImageOps';
import { deleteShownResult, openImg2ImgDialog, openLineFixDialog } from './generationOps';
import { run, toast } from './store';

export function copyResultImage(projectId: string, record: GenerationSummary): void {
  void run('이미지를 복사하는 중', async () => {
    await fileApi().copyImage(projectId, record.id);
    return true;
  }).then((done) => done && toast('이미지를 클립보드에 복사했습니다.'));
}

export function revealResult(projectId: string, record: GenerationSummary): void {
  void run('폴더를 여는 중', () => libraryApi().showGeneration(projectId, record.id));
}

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
  /** 결과 막대에는 자리가 없어 우클릭 메뉴에만 있다. */
  aid: ResultAction[];
  file: ResultAction[];
} {
  return {
    refine: {
      label: '다듬기',
      icon: 'upscale',
      group: 'send',
      accessKey: 'R',
      keepLabel: true,
      fold: 8,
      onSelect: () => openImg2ImgDialog(projectId, [record]),
    },
    lineFix: {
      label: '구분선 지우기',
      icon: 'border-line',
      group: 'send',
      accessKey: 'L',
      keepLabel: true,
      fold: 2,
      onSelect: () => openLineFixDialog(projectId, [record]),
    },
    makeReference: {
      label: '인페인트 만들기',
      icon: 'reference',
      group: 'send',
      accessKey: 'N',
      keepLabel: true,
      fold: 3,
      onSelect: () => void makeReferenceFromRecord(projectId, record),
    },
    aid: [
      {
        label: '캐릭터 레퍼런스로 보내기',
        icon: 'portrait',
        group: 'send',
        accessKey: 'H',
        menuOnly: true,
        onSelect: () => void makeAidFromRecord('characterReferences', projectId, record),
      },
      {
        label: '바이브로 보내기',
        icon: 'vibe',
        group: 'send',
        accessKey: 'V',
        menuOnly: true,
        onSelect: () => void makeAidFromRecord('vibes', projectId, record),
      },
    ],
    file: [
      {
        label: '이미지 복사',
        icon: 'copy',
        group: 'file',
        accessKey: 'C',
        shortcut: 'Ctrl+C',
        menuOnly: true,
        onSelect: () => copyResultImage(projectId, record),
      },
      {
        label: '다른 이름으로 저장',
        icon: 'save',
        group: 'file',
        accessKey: 'A',
        shortcut: 'Ctrl+Shift+S',
        iconOnly: true,
        fold: 9,
        onSelect: () => options.saveAs(record),
      },
      {
        label: '폴더에서 보기',
        icon: 'folder',
        group: 'file',
        accessKey: 'E',
        shortcut: 'Shift+Alt+R',
        iconOnly: true,
        fold: 5,
        onSelect: () => revealResult(projectId, record),
      },
      {
        label: '이 결과 삭제',
        icon: 'trash',
        group: 'delete',
        accessKey: 'D',
        shortcut: 'Delete',
        iconOnly: true,
        onSelect: () => void deleteShownResult(projectId, options.records, record, options.show),
      },
    ],
  };
}
