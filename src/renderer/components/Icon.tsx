import type { ReactNode } from 'react';

function gearPath(teeth = 8, outer = 9.5, inner = 7.2): string {
  const points: string[] = [];
  const step = (Math.PI * 2) / (teeth * 4);
  for (let index = 0; index < teeth * 4; index += 1) {
    const radius = index % 4 < 2 ? outer : inner;
    const angle = index * step - step / 2;
    points.push(
      `${(12 + radius * Math.cos(angle)).toFixed(2)} ${(12 + radius * Math.sin(angle)).toFixed(2)}`,
    );
  }
  return `M${points.join('L')}Z`;
}

const GEAR = gearPath();

/** 24×24 격자, 같은 굵기의 선, 색은 글자색. */
const ICONS = {
  settings: (
    <>
      <path d={GEAR} />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  preset: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  character: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  emotion: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14.5c1 1.4 2.4 2 4 2s3-.6 4-2" />
      <path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.6" />
    </>
  ),
  reference: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m3 18 5-5 4 4 3-3 6 6" />
    </>
  ),
  project: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  import: <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16Zm9-13 4 4" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  export: <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  prompt: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h10M7 13h10M7 17h5" />
    </>
  ),
  keyboard: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
    </>
  ),
  sidebar: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  'panel-right': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />,
  output: <path d="M4 6h16M4 12h10M4 18h7M17 15l3 3-3 3" />,
  tag: (
    <>
      <path d="M3 12V4h8l10 10-8 8Z" />
      <circle cx="7.5" cy="8.5" r="1.5" />
    </>
  ),
  storage: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  account: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z" />
      <circle cx="7.5" cy="11" r="1.2" />
      <circle cx="10.5" cy="7" r="1.2" />
      <circle cx="15" cy="7.5" r="1.2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5h.01" />
    </>
  ),
  images: (
    <>
      <rect x="7" y="3" width="14" height="14" rx="2" />
      <path d="M3 7v12a2 2 0 0 0 2 2h12" />
      <path d="m7 13 4-4 4 4 2-2 4 4" />
    </>
  ),
  sparkle: (
    <>
      <path d="M10 3.5l1.6 4.9 4.9 1.6-4.9 1.6L10 16.5l-1.6-4.9L3.5 10l4.9-1.6Z" />
      <path d="M18 14l.8 2.2 2.2.8-2.2.8L18 20l-.8-2.2L15 17l2.2-.8Z" />
    </>
  ),
  'check-square': (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  square: <rect x="3.5" y="3.5" width="17" height="17" rx="3" />,
  'ratio-portrait': <rect x="6.5" y="3.5" width="11" height="17" rx="2" />,
  'ratio-landscape': <rect x="3.5" y="6.5" width="17" height="11" rx="2" />,
  'ratio-square': <rect x="5" y="5" width="14" height="14" rx="2" />,
  circle: <circle cx="12" cy="12" r="8.5" />,
  'select-all': (
    <>
      <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  transform: (
    <>
      <rect x="6" y="6" width="12" height="12" />
      <path d="M3 3h3v3H3zM18 3h3v3h-3zM3 18h3v3H3zM18 18h3v3h-3z" />
    </>
  ),
  center: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    </>
  ),
  pen: <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1ZM14.5 6.5l3 3" />,
  bucket: (
    <>
      <path d="m5 11 7-7 7.5 7.5-7 7a2 2 0 0 1-2.8 0L5 13.8a2 2 0 0 1 0-2.8Z" />
      <path d="M5 12h14M20 15.5s1.5 1.9 1.5 3a1.5 1.5 0 0 1-3 0c0-1.1 1.5-3 1.5-3Z" />
    </>
  ),
  eyedropper: (
    <path d="m14 7 3 3M4 20l1.5-.5L16 9l-1-1L4.5 18.5 4 20ZM15.5 4.5a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L17 11l-4-4 2.5-2.5Z" />
  ),
  eraser: (
    <path d="M8 20 3.5 15.5a1.5 1.5 0 0 1 0-2.1L13.4 3.5a1.5 1.5 0 0 1 2.1 0l5 5a1.5 1.5 0 0 1 0 2.1L11 20ZM8 20h12M9 8l7 7" />
  ),
  brush: (
    <>
      <path d="M20.5 3.5 11 13" />
      <path d="M11 13c-2.3-1.2-5-.1-5.5 2.6-.3 1.6-1 2.6-2.5 3.4 3.4 1 7.2.4 8.5-2.2.8-1.6.4-3.1-.5-3.8Z" />
    </>
  ),
  portrait: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 18c.8-2.4 2.7-3.6 5-3.6s4.2 1.2 5 3.6" />
    </>
  ),
  vibe: (
    <>
      <path d="M3 9c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
      <path d="M3 15c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
    </>
  ),
  wand: (
    <>
      <path d="M4 20 15 9" />
      <path d="m13.5 7.5 3 3" />
      <path d="M18 3v3M16.5 4.5h3M20 10v2M19 11h2M10 3v2M9 4h2" />
    </>
  ),
  upscale: (
    <>
      <rect x="3" y="10" width="11" height="11" rx="2" />
      <path d="M14 3h7v7M21 3l-8 8" />
    </>
  ),
  save: (
    <>
      <path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M7 3v5h8M7 21v-7h10v7" />
    </>
  ),
  undo: <path d="M9 14 4 9l5-5M4 9h11a5.5 5.5 0 0 1 0 11h-4" />,
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" />,
  'zoom-in': (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.8-4.8M10.5 7.5v6M7.5 10.5h6" />
    </>
  ),
  'zoom-out': (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.8-4.8M7.5 10.5h6" />
    </>
  ),
  filmstrip: (
    <>
      <rect x="3" y="3.5" width="18" height="11" rx="2" />
      <path d="M3 19.5h4M10 19.5h4M17 19.5h4" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  pause: <path d="M9 5.5v13M15 5.5v13" />,
  focus: <path d="M4 9V5h4M16 4h4v5M20 15v5h-4M8 20H4v-5" />,
  queue: (
    <>
      <rect x="4" y="4" width="16" height="5" rx="1.5" />
      <rect x="4" y="11" width="16" height="5" rx="1.5" />
      <path d="M6 20h12" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
