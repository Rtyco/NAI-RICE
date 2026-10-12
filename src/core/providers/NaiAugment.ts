import type { AugmentSettings, AugmentTool } from '../domain/types';

export type AugmentToolInfo = {
  id: AugmentTool;
  label: string;
  description: string;
  /** 툴 목록에서 「주요 툴」로 앞에 둔다. 나머지는 「그 밖의 툴」이다. */
  primary: boolean;
  /** 덧붙이는 프롬프트를 받는다. */
  prompt: boolean;
  /** 강도(defry)를 받는다. */
  strength: boolean;
};

/** NovelAI 웹의 디렉터 툴과 같은 종류. 0단계 실측: 배경 제거만 Opus여도 Anlas가 든다. */
export const AUGMENT_TOOLS: AugmentToolInfo[] = [
  {
    id: 'emotion',
    label: 'Emotion',
    description: '얼굴 표정만 바꿉니다. 머리·옷·포즈·배경은 그대로입니다.',
    primary: true,
    prompt: true,
    strength: true,
  },
  {
    id: 'bg-removal',
    label: '배경 제거',
    description: '배경을 투명하게 지운 이미지 세 장을 받습니다.',
    primary: true,
    prompt: false,
    strength: false,
  },
  {
    id: 'declutter',
    label: 'Declutter',
    description: '글자·말풍선·효과선 같은 잡다한 것을 지웁니다.',
    primary: true,
    prompt: false,
    strength: false,
  },
  {
    id: 'lineart',
    label: 'Line Art',
    description: '흑백 선화로 바꿉니다.',
    primary: false,
    prompt: false,
    strength: false,
  },
  {
    id: 'sketch',
    label: 'Sketch',
    description: '연필 스케치로 바꿉니다.',
    primary: false,
    prompt: false,
    strength: false,
  },
  {
    id: 'colorize',
    label: 'Colorize',
    description: '색을 새로 칠합니다. 프롬프트가 없으면 머리·눈 색이 바뀔 수 있습니다.',
    primary: false,
    prompt: true,
    strength: true,
  },
];

export const DEFAULT_AUGMENT_SETTINGS: AugmentSettings = {
  tool: 'emotion',
  mood: 'happy',
  toolPrompt: '',
  defry: 0,
  count: 1,
};

export function augmentToolInfo(tool: AugmentTool): AugmentToolInfo {
  return AUGMENT_TOOLS.find((item) => item.id === tool) ?? AUGMENT_TOOLS[0];
}

/** Emotion 툴이 받는 표정. 값과 순서는 NovelAI 웹의 목록과 같다. */
export const EMOTION_MOODS: Array<{ id: string; label: string }> = [
  { id: 'neutral', label: '중립' },
  { id: 'happy', label: '기쁨' },
  { id: 'sad', label: '슬픔' },
  { id: 'angry', label: '화남' },
  { id: 'scared', label: '겁먹음' },
  { id: 'surprised', label: '놀람' },
  { id: 'tired', label: '피곤함' },
  { id: 'excited', label: '신남' },
  { id: 'nervous', label: '긴장' },
  { id: 'thinking', label: '생각 중' },
  { id: 'confused', label: '어리둥절' },
  { id: 'shy', label: '수줍음' },
  { id: 'disgusted', label: '역겨움' },
  { id: 'smug', label: '의기양양' },
  { id: 'bored', label: '지루함' },
  { id: 'laughing', label: '웃음' },
  { id: 'irritated', label: '짜증' },
  { id: 'aroused', label: '달아오름' },
  { id: 'embarrassed', label: '부끄러움' },
  { id: 'worried', label: '걱정' },
  { id: 'love', label: '사랑' },
  { id: 'determined', label: '결의' },
  { id: 'hurt', label: '아픔' },
  { id: 'playful', label: '장난스러움' },
];

export function moodLabel(mood: string | undefined): string {
  const found = EMOTION_MOODS.find((item) => item.id === mood);
  return found ? `${found.label} (${found.id})` : (mood ?? '');
}

/** 강도 단계. 요청의 `defry`는 이 목록의 순서(0이 가장 강함)다. NovelAI 웹의 이름을 옮겼다. */
export const AUGMENT_STRENGTHS = [
  '보통',
  '조금 약하게',
  '약하게',
  '더 약하게',
  '아주 약하게',
  '가장 약하게',
];

/** 앞에 있는 표정부터 맞춰 본다. 「웃음」이 「기쁨」보다, 「부끄러움」이 「당황」보다 먼저 맞도록 둔다. */
const MOOD_KEYWORDS: Array<[string, string[]]> = [
  ['neutral', ['중립', '무표정', '기본', '평온', '평상', 'neutral', 'default', 'calm']],
  ['laughing', ['폭소', '웃음', '웃는', 'laugh']],
  ['happy', ['기쁨', '기쁜', '기뻐', '행복', '미소', 'happy', 'joy', 'smile']],
  ['sad', ['슬픔', '슬픈', '울음', '우는', '눈물', 'sad', 'cry', 'tear']],
  ['angry', ['분노', '화남', '화난', '격노', 'angry', 'anger', 'rage', 'mad']],
  ['irritated', ['짜증', '불만', 'irritat', 'annoy']],
  ['scared', ['공포', '겁', '무서', '두려', 'scared', 'fear', 'afraid']],
  ['surprised', ['놀람', '놀란', '깜짝', 'surprise', 'shock']],
  ['embarrassed', ['부끄', '창피', '당황', 'embarrass', 'blush']],
  ['shy', ['수줍', 'shy']],
  ['tired', ['피곤', '졸림', '지침', 'tired', 'sleepy']],
  ['excited', ['신남', '신난', '흥분', 'excite']],
  ['nervous', ['긴장', '초조', 'nervous']],
  ['thinking', ['생각', '고민', 'think']],
  ['confused', ['혼란', '어리둥절', '갸웃', 'confus']],
  ['disgusted', ['역겨', '혐오', 'disgust']],
  ['smug', ['의기양양', '득의', '자신만만', '우쭐', 'smug']],
  ['bored', ['지루', '심심', 'bored']],
  ['worried', ['걱정', '불안', 'worr']],
  ['love', ['사랑', '반함', 'love']],
  ['determined', ['결의', '단호', '결심', 'determin']],
  ['hurt', ['아픔', '고통', '상처', 'hurt', 'pain']],
  ['playful', ['장난', 'playful', 'wink']],
  ['aroused', ['aroused']],
];

/** 씬 이름으로 Emotion 툴 표정을 추천한다. 맞는 것이 없으면 undefined다. */
export function suggestMood(sceneName: string): string | undefined {
  const name = sceneName.toLowerCase();
  return MOOD_KEYWORDS.find(([, words]) => words.some((word) => name.includes(word)))?.[0];
}

/** 씬에 정해 둔 Emotion 툴 표정. 없으면 씬 이름으로 추천한 표정이다. */
export function sceneMood(scene: { name: string; augmentMood?: string }): string | undefined {
  return scene.augmentMood ?? suggestMood(scene.name);
}

const FREE_AUGMENT_PIXELS = 1024 * 1024;

/**
 * 디렉터 툴에 보낼 크기. 무료 면적 안이면 원래 크기 그대로 보낸다. 넘으면 비율을 지켜 무료 면적 안의 64 배수로
 * 줄인다(ComfyUI_NAIDGenerator의 Opus 무료 제한과 같은 계산).
 */
export function freeAugmentSize(width: number, height: number): { width: number; height: number } {
  if (width * height <= FREE_AUGMENT_PIXELS) return { width, height };
  const k = Math.sqrt(((FREE_AUGMENT_PIXELS / 4096) * width) / height);
  return { width: Math.floor(k) * 64, height: Math.floor((k * height) / width) * 64 };
}
