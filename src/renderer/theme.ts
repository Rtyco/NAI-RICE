import type { AppSettings, ThemeId, ThemeMode } from '../core/domain/types';

type Appearance = AppSettings['appearance'];

/**
 * 색 테마. 바탕은 색상(hue)과 채도(tint)로, 강조색은 accent로 정한다.
 * styles.css는 여기서 만든 --bg-0 … --red-bg 변수만 쓴다.
 */
export const THEMES: Record<
  ThemeId,
  { label: string; hue: number; tint: number; accent: string; lightAccent: string }
> = {
  navy: { label: '네이비', hue: 218, tint: 45, accent: '#38a3ff', lightAccent: '#1f7fd6' },
  graphite: { label: '그래파이트', hue: 220, tint: 7, accent: '#8ab4f8', lightAccent: '#3b6fd1' },
  violet: { label: '바이올렛', hue: 258, tint: 32, accent: '#a78bfa', lightAccent: '#7155d9' },
  forest: { label: '포레스트', hue: 165, tint: 28, accent: '#3ccf9e', lightAccent: '#14906a' },
  rose: { label: '로즈', hue: 340, tint: 24, accent: '#f472b6', lightAccent: '#c93d84' },
};

export const MODE_LABELS: Record<ThemeMode, string> = {
  dark: '다크',
  light: '라이트',
  system: 'Windows 설정 따르기',
};

const hsl = (hue: number, saturation: number, lightness: number) =>
  `hsl(${hue} ${Math.round(saturation)}% ${lightness}%)`;
const mix = (color: string, amount: number, other: string) =>
  `color-mix(in srgb, ${color} ${amount}%, ${other})`;

function darkTokens(theme: (typeof THEMES)[ThemeId]): Record<string, string> {
  const { hue: h, tint: s, accent } = theme;
  return {
    'color-scheme': 'dark',
    '--bg-0': hsl(h, s, 5),
    '--bg-1': hsl(h, s, 8),
    '--bg-2': hsl(h, s * 0.95, 9.5),
    '--bg-3': hsl(h, s * 0.9, 12.5),
    '--bg-4': hsl(h, s * 0.8, 15.5),
    '--bg-5': hsl(h, s * 0.75, 21),
    '--line': hsl(h, s * 0.7, 22),
    '--line-strong': hsl(h, s * 0.6, 30),
    '--text': hsl(h, Math.min(s, 15), 91),
    '--text-2': hsl(h, s * 0.5, 80),
    '--muted': hsl(h, s * 0.4, 63),
    '--faint': hsl(h, s * 0.35, 45),
    '--accent': accent,
    '--accent-strong': mix(accent, 82, 'black'),
    '--accent-deep': mix(accent, 68, 'black'),
    '--accent-text': mix(accent, 55, 'white'),
    '--accent-bg': mix(accent, 20, hsl(h, s, 9.5)),
    '--accent-line': mix(accent, 48, hsl(h, s, 9.5)),
    '--accent-a33': mix(accent, 33, 'transparent'),
    '--accent-a12': mix(accent, 12, 'transparent'),
    '--green': '#39d98a',
    '--green-strong': '#2dbb77',
    '--green-deep': '#24965f',
    '--green-line': '#2d7e5a',
    '--green-text': '#7de5ad',
    '--green-bg': '#0d2219',
    '--teal': '#21c9bf',
    '--teal-line': '#36968f',
    '--teal-text': '#74e6de',
    '--orange': '#f4a340',
    '--orange-text': '#f6cf8b',
    '--orange-line': '#8a6421',
    '--orange-bg': '#241b0b',
    '--red': '#f56b7a',
    '--red-text': '#ff98a4',
    '--red-strong': '#c4475a',
    '--red-deep': '#a63446',
    '--red-line': '#8b3443',
    '--red-bg': '#2b1219',
    '--overlay': mix(hsl(h, s, 5), 80, 'transparent'),
  };
}

function lightTokens(theme: (typeof THEMES)[ThemeId]): Record<string, string> {
  const { hue: h, tint: s, lightAccent: accent } = theme;
  return {
    'color-scheme': 'light',
    '--bg-0': hsl(h, s * 0.4, 92),
    '--bg-1': hsl(h, s * 0.3, 99),
    '--bg-2': hsl(h, s * 0.4, 96.5),
    '--bg-3': hsl(h, s * 0.3, 99.5),
    '--bg-4': hsl(h, s * 0.4, 93.5),
    '--bg-5': hsl(h, s * 0.4, 88),
    '--line': hsl(h, s * 0.35, 84),
    '--line-strong': hsl(h, s * 0.3, 72),
    '--text': hsl(h, s * 0.45, 13),
    '--text-2': hsl(h, s * 0.4, 26),
    '--muted': hsl(h, s * 0.3, 40),
    '--faint': hsl(h, s * 0.25, 55),
    '--accent': accent,
    '--accent-strong': mix(accent, 88, 'black'),
    '--accent-deep': accent,
    '--accent-text': mix(accent, 82, 'black'),
    '--accent-bg': mix(accent, 13, 'white'),
    '--accent-line': mix(accent, 45, 'white'),
    '--accent-a33': mix(accent, 30, 'transparent'),
    '--accent-a12': mix(accent, 14, 'transparent'),
    '--green': '#16a34a',
    '--green-strong': '#1f9d5c',
    '--green-deep': '#17864d',
    '--green-line': '#86cfa5',
    '--green-text': '#137a3e',
    '--green-bg': '#dcf5e6',
    '--teal': '#0d9488',
    '--teal-line': '#6cc7bf',
    '--teal-text': '#0f6f68',
    '--orange': '#d97706',
    '--orange-text': '#9a5a05',
    '--orange-line': '#e5b462',
    '--orange-bg': '#fdf1d6',
    '--red': '#e11d48',
    '--red-text': '#b4183d',
    '--red-strong': '#d23a55',
    '--red-deep': '#b42d46',
    '--red-line': '#eda0ae',
    '--red-bg': '#fde4e8',
    '--overlay': mix(hsl(h, s * 0.4, 30), 45, 'transparent'),
  };
}

let systemQuery: MediaQueryList | undefined;
let current: Appearance = { theme: 'navy', mode: 'dark' };

function resolvedMode(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** 고른 테마의 변수를 문서 전체에 적용한다. "Windows 설정 따르기"면 설정이 바뀔 때 다시 적용한다. */
export function applyAppearance(appearance: Appearance): void {
  current = appearance;
  const theme = THEMES[appearance.theme] ?? THEMES.navy;
  const mode = resolvedMode(appearance.mode);
  const tokens = mode === 'light' ? lightTokens(theme) : darkTokens(theme);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
  root.dataset.mode = mode;
  syncTitleBar();
  try {
    localStorage.setItem('appearance', JSON.stringify(appearance));
  } catch {
    // 다음 실행의 첫 화면만 기본 색으로 보일 뿐이다.
  }
  if (!systemQuery) {
    systemQuery = window.matchMedia('(prefers-color-scheme: light)');
    systemQuery.addEventListener('change', () => {
      if (current.mode === 'system') applyAppearance(current);
    });
  }
}

/** CSS 색(hsl·color-mix 포함)을 창 제목 표시줄에 넘길 #rrggbb로 바꾼다. */
function cssColorToHex(variable: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${variable})`;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  probe.remove();
  return `#${rgb
    .slice(0, 3)
    .map((value) => Math.round(value).toString(16).padStart(2, '0'))
    .join('')}`;
}

function syncTitleBar(): void {
  try {
    window.referenceDesk?.setTitleBarColors?.({
      color: cssColorToHex('--bg-2'),
      symbolColor: cssColorToHex('--text-2'),
    });
  } catch {
    // 제목 표시줄 색은 꾸밈일 뿐이다.
  }
}

export function cachedAppearance(): Appearance {
  try {
    const value = JSON.parse(localStorage.getItem('appearance') ?? 'null') as Appearance | null;
    if (value && value.theme in THEMES && value.mode in MODE_LABELS) return value;
  } catch {
    // 저장된 값이 없거나 깨졌으면 기본값.
  }
  return { theme: 'navy', mode: 'dark' };
}

/** 설정 화면의 견본 색. */
export function themeSwatch(id: ThemeId, mode: 'dark' | 'light') {
  const tokens = mode === 'light' ? lightTokens(THEMES[id]) : darkTokens(THEMES[id]);
  return {
    background: tokens['--bg-2'],
    surface: tokens['--bg-4'],
    text: tokens['--text'],
    accent: tokens['--accent'],
  };
}
