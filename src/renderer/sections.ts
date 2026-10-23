import type { Library } from '../core/domain/types';
import type { IconName } from './components/Icon';
import type { LibrarySection } from './store';

export const SECTIONS: Array<{
  id: LibrarySection;
  key: keyof Library;
  kind:
    | 'preset'
    | 'character'
    | 'emotionSet'
    | 'reference'
    | 'characterReference'
    | 'vibe'
    | 'pieceSet';
  projectPart: boolean;
  label: string;
  icon: IconName;
  role: string;
  /** 1은 작업 화면 */
  shortcut: string;
}> = [
  {
    id: 'presets',
    shortcut: '2',
    key: 'presets',
    kind: 'preset',
    projectPart: true,
    label: '생성 설정',
    icon: 'preset',
    role: '모델 · 공통 프롬프트 · Steps',
  },
  {
    id: 'characters',
    shortcut: '3',
    key: 'characters',
    kind: 'character',
    projectPart: true,
    label: '캐릭터',
    icon: 'character',
    role: '외형 · 의상 프롬프트',
  },
  {
    id: 'emotionSets',
    shortcut: '4',
    key: 'emotionSets',
    kind: 'emotionSet',
    projectPart: true,
    label: '씬 모음',
    icon: 'emotion',
    role: '씬 프롬프트',
  },
  {
    id: 'references',
    shortcut: '5',
    key: 'references',
    kind: 'reference',
    projectPart: true,
    label: '인페인트',
    icon: 'reference',
    role: '참고 이미지 · 캔버스',
  },
  {
    id: 'characterReferences',
    shortcut: '6',
    key: 'characterReferences',
    kind: 'characterReference',
    projectPart: false,
    label: '캐릭터 레퍼런스',
    icon: 'portrait',
    role: '그림의 캐릭터 따라 그리기',
  },
  {
    id: 'vibes',
    shortcut: '7',
    key: 'vibes',
    kind: 'vibe',
    projectPart: false,
    label: '바이브',
    icon: 'vibe',
    role: '그림의 분위기·그림체',
  },
  {
    id: 'pieceSets',
    shortcut: '8',
    key: 'pieceSets',
    kind: 'pieceSet',
    projectPart: false,
    label: '프롬프트 조각',
    icon: 'tag',
    role: '',
  },
];

export const PROJECT_SECTIONS = SECTIONS.filter((section) => section.projectPart);

/** 캐릭터 레퍼런스·바이브는 그림이 `pictures/`에 있어 전체 백업으로만 옮긴다. */
export function exportable(section: LibrarySection): boolean {
  return section !== 'characterReferences' && section !== 'vibes';
}

export function sectionInfo(id: LibrarySection) {
  return SECTIONS.find((section) => section.id === id)!;
}
