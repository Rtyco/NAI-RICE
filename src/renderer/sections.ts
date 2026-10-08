import type { Library } from '../core/domain/types';
import type { IconName } from './components/Icon';
import type { LibrarySection } from './store';

/**
 * 라이브러리 항목.  작업은 projectPart를 묶어 사용
 * 프롬프트 조각은 작업에 묶지 않고 프롬프트 안에서 불러 쓴다.
 * 화면 곳곳의 이름·아이콘·설명이 여기서 나온다.
 */
export const SECTIONS: Array<{
  id: LibrarySection;
  key: keyof Library;
  kind: 'preset' | 'character' | 'emotionSet' | 'reference' | 'pieceSet';
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
    label: '감정 모음',
    icon: 'emotion',
    role: '감정 프롬프트',
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

export function sectionInfo(id: LibrarySection) {
  return SECTIONS.find((section) => section.id === id)!;
}
