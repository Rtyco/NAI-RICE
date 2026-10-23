import { useRef, useState } from 'react';

export type DrawTool = 'pen' | 'eraser' | 'fill' | 'picker';
export type DrawTip = 'round' | 'soft' | 'square';

export const TOOLS: Array<{
  id: DrawTool;
  label: string;
  key: string;
  icon: 'pen' | 'eraser' | 'bucket' | 'eyedropper';
}> = [
  { id: 'pen', label: '펜', key: 'b', icon: 'pen' },
  { id: 'eraser', label: '지우개', key: 'e', icon: 'eraser' },
  { id: 'fill', label: '채우기', key: 'g', icon: 'bucket' },
  { id: 'picker', label: '스포이트', key: 'i', icon: 'eyedropper' },
];

export const TIPS: Array<{ id: DrawTip; label: string }> = [
  { id: 'round', label: '둥근' },
  { id: 'soft', label: '부드러운' },
  { id: 'square', label: '네모' },
];

export const PALETTE = [
  '#000000',
  '#ffffff',
  '#808080',
  '#f5d0b5',
  '#e53935',
  '#fb8c00',
  '#fdd835',
  '#43a047',
  '#00acc1',
  '#1e88e5',
  '#5e35b1',
  '#d81b60',
  '#6d4c41',
];

export const MAX_SIZE = 300;
/** 포토샵처럼 이 안에 숫자를 하나 더 누르면 두 자리 불투명도(4, 5 → 45%) */
const OPACITY_TYPING_MS = 400;

export function useDrawSettings() {
  const [tool, setTool] = useState<DrawTool>('pen');
  const [tip, setTip] = useState<DrawTip>('round');
  const [size, setSize] = useState(12);
  const [opacity, setOpacity] = useState(100);
  const [tolerance, setTolerance] = useState(32);
  const [color, setColor] = useState('#000000');
  const [backColor, setBackColor] = useState('#ffffff');
  const typedOpacity = useRef<{ digit: number; at: number } | null>(null);
  return {
    tool,
    setTool,
    tip,
    setTip,
    size,
    setSize,
    opacity,
    setOpacity,
    tolerance,
    setTolerance,
    color,
    setColor,
    backColor,
    setBackColor,
    toolForKey: (key: string) => TOOLS.find((item) => item.key === key)?.id,
    shrink: () => setSize((value) => Math.max(1, Math.round(value / 1.2))),
    grow: () => setSize((value) => Math.min(MAX_SIZE, Math.round(value * 1.2) + 1)),
    typeOpacity: (digit: number) => {
      const now = performance.now();
      const previous = typedOpacity.current;
      const second = previous && now - previous.at < OPACITY_TYPING_MS;
      const value = second ? previous.digit * 10 + digit : digit === 0 ? 100 : digit * 10;
      typedOpacity.current = second ? null : { digit, at: now };
      setOpacity(Math.max(1, Math.min(100, value)));
    },
    swapColors: () => {
      setColor(backColor);
      setBackColor(color);
    },
    resetColors: () => {
      setColor('#000000');
      setBackColor('#ffffff');
    },
  };
}

export type DrawSettings = ReturnType<typeof useDrawSettings>;
