import type { Library } from '../core/domain/types';
import type { IconName } from './components/Icon';
import type { LibrarySection } from './store';

/**
 * 라이브러리 항목 종류. 작업은 `projectPart`인 항목을 하나씩 골라 묶고, 프롬프트 조각은 프롬프트 안에서
 * 불러 쓴다. 화면 곳곳의 이름·아이콘·설명이 여기서 나온다.
 */
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
  usage: string;
  /** 이 화면으로 바로 가는 키. F1은 작업 화면이다. */
  shortcut: string;
}> = [
  {
    id: 'presets',
    shortcut: 'F2',
    key: 'presets',
    kind: 'preset',
    projectPart: true,
    label: '생성 설정',
    icon: 'preset',
    role: '모델 · 공통 프롬프트 · Steps',
    usage: '',
  },
  {
    id: 'characters',
    shortcut: 'F3',
    key: 'characters',
    kind: 'character',
    projectPart: true,
    label: '캐릭터',
    icon: 'character',
    role: '외형 · 의상 프롬프트',
    usage: '',
  },
  {
    id: 'emotionSets',
    shortcut: 'F4',
    key: 'emotionSets',
    kind: 'emotionSet',
    projectPart: true,
    label: '씬 모음',
    icon: 'emotion',
    role: '씬 프롬프트',
    usage: '',
  },
  {
    id: 'references',
    shortcut: 'F5',
    key: 'references',
    kind: 'reference',
    projectPart: true,
    label: '인페인트',
    icon: 'reference',
    role: '참고 이미지 · 캔버스',
    usage: '',
  },
  {
    id: 'characterReferences',
    shortcut: 'F7',
    key: 'characterReferences',
    kind: 'characterReference',
    projectPart: false,
    label: '캐릭터 레퍼런스',
    icon: 'portrait',
    role: '그림의 캐릭터 따라 그리기',
    usage: '작업의 일반 생성에서 고릅니다(V4.5 전용, 한 장에 5 Anlas)',
  },
  {
    id: 'vibes',
    shortcut: 'F8',
    key: 'vibes',
    kind: 'vibe',
    projectPart: false,
    label: '바이브',
    icon: 'vibe',
    role: '그림의 분위기·그림체',
    usage: '작업의 일반 생성·인페인트에서 고릅니다(V4.5 전용, 인코딩 한 번에 2 Anlas)',
  },
  {
    id: 'pieceSets',
    shortcut: 'F6',
    key: 'pieceSets',
    kind: 'pieceSet',
    projectPart: false,
    label: '프롬프트 조각',
    icon: 'tag',
    role: '',
    usage: '<세트이름.조각이름> 형식으로 불러 쓸 수 있습니다',
  },
];

export const PROJECT_SECTIONS = SECTIONS.filter((section) => section.projectPart);

/**
 * 항목 하나를 JSON으로 내보낼 수 있는지. 캐릭터 레퍼런스·바이브는 그림을 `pictures/`에 두어 JSON에 넣지 않으므로,
 * 전체 백업으로만 옮긴다.
 */
export function exportable(section: LibrarySection): boolean {
  return section !== 'characterReferences' && section !== 'vibes';
}

export function sectionInfo(id: LibrarySection) {
  return SECTIONS.find((section) => section.id === id)!;
}
