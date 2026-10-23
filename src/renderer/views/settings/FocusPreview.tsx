import { useId } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import type { FocusPart } from '../../store';

const WIDTH = 176;
const HEIGHT = 120;
const TITLE_BAR = 7;
const ROW = 12;
const SIDEBAR = 18;
const LEFT_PANEL = 30;
const SIDE_PANEL = 32;
const HISTORY = 18;

type Region = {
  part?: FocusPart;
  name: string;
  icon: IconName;
  x: number;
  y: number;
  width: number;
  height: number;
};

const CONTENT_LEFT = SIDEBAR + LEFT_PANEL;
const CONTENT_RIGHT = WIDTH - HISTORY;
const BODY_TOP = TITLE_BAR + ROW * 2;
const BODY_BOTTOM = HEIGHT - ROW;

/** 평소 화면. 집중 모드가 숨기는 곳만 빗금으로 칠해 단계마다 무엇이 빠지는지 비교해 보게 한다. */
const REGIONS: Region[] = [
  {
    part: 'sidebar',
    name: '사이드바',
    icon: 'sidebar',
    x: 0,
    y: TITLE_BAR,
    width: SIDEBAR,
    height: HEIGHT - TITLE_BAR,
  },
  {
    part: 'leftPanel',
    name: '프롬프트 패널·라이브러리 목록',
    icon: 'prompt',
    x: SIDEBAR,
    y: TITLE_BAR,
    width: LEFT_PANEL,
    height: BODY_BOTTOM - TITLE_BAR,
  },
  {
    name: '화면 머리줄',
    icon: 'project',
    x: CONTENT_LEFT,
    y: TITLE_BAR,
    width: CONTENT_RIGHT - CONTENT_LEFT,
    height: ROW,
  },
  {
    part: 'topBar',
    name: '설정 줄',
    icon: 'preset',
    x: CONTENT_LEFT,
    y: TITLE_BAR + ROW,
    width: CONTENT_RIGHT - CONTENT_LEFT,
    height: ROW,
  },
  {
    name: '이미지',
    icon: 'images',
    x: CONTENT_LEFT,
    y: BODY_TOP,
    width: CONTENT_RIGHT - CONTENT_LEFT - SIDE_PANEL,
    height: BODY_BOTTOM - BODY_TOP,
  },
  {
    part: 'sidePanel',
    name: '오른쪽 입력 패널',
    icon: 'sliders',
    x: CONTENT_RIGHT - SIDE_PANEL,
    y: BODY_TOP,
    width: SIDE_PANEL,
    height: BODY_BOTTOM - BODY_TOP,
  },
  {
    part: 'history',
    name: '히스토리',
    icon: 'panel-right',
    x: CONTENT_RIGHT,
    y: TITLE_BAR,
    width: HISTORY,
    height: BODY_BOTTOM - TITLE_BAR,
  },
  {
    part: 'queueBar',
    name: '생성 큐 막대',
    icon: 'queue',
    x: SIDEBAR,
    y: BODY_BOTTOM,
    width: WIDTH - SIDEBAR,
    height: ROW,
  },
];

const ICON = 13;

export function FocusPreview({ hidden }: { hidden: FocusPart[] }) {
  const hatch = useId();
  const image = REGIONS.find((region) => region.icon === 'images')!;
  const palette = hidden.includes('sidePanel') || hidden.includes('queueBar');
  return (
    <svg className="focus-preview" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      <defs>
        <pattern
          id={hatch}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect className="fp-hidden-line" width="1.4" height="4" />
        </pattern>
      </defs>
      <rect className="fp-chrome" width={WIDTH} height={TITLE_BAR} />
      {REGIONS.map((region) => {
        const gone = region.part !== undefined && hidden.includes(region.part);
        const size = Math.min(ICON, region.height - 3, region.width - 4);
        return (
          <g key={region.name} className={gone ? 'fp-hidden' : 'fp-region'}>
            <title>{gone ? `${region.name} · 숨김` : region.name}</title>
            <rect
              x={region.x + 0.5}
              y={region.y + 0.5}
              width={region.width - 1}
              height={region.height - 1}
              rx={1.5}
              fill={gone ? `url(#${hatch})` : undefined}
            />
            <g
              transform={`translate(${region.x + (region.width - size) / 2} ${region.y + (region.height - size) / 2})`}
            >
              <Icon name={region.icon} size={size} />
            </g>
          </g>
        );
      })}
      {palette && (
        <g className="fp-palette">
          <title>떠 있는 버튼 창</title>
          <rect
            x={image.x + image.width / 2 - 14}
            y={BODY_BOTTOM - 15}
            width={28}
            height={11}
            rx={3}
          />
          <g transform={`translate(${image.x + image.width / 2 - 4} ${BODY_BOTTOM - 13.5})`}>
            <Icon name="play" size={8} />
          </g>
        </g>
      )}
    </svg>
  );
}
