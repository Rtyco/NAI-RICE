import { useEffect } from 'react';
import type { FreeGeneration } from '../../../core/domain/types';
import { Icon } from '../../components/Icon';
import { ModeToggle, type ModeInfo } from '../../components/ModeToggle';
import { updateFreeGeneration } from '../../store';

type GenerateMode = 'txt2img' | 'img2img';

const GENERATE_MODES: Record<GenerateMode, ModeInfo> = {
  txt2img: { label: '일반 생성', icon: 'sparkle', title: '프롬프트로만 그립니다' },
  img2img: {
    label: 'i2i',
    icon: 'reference',
    title: '고른 이미지를 다시 그리거나, 칠한 곳만 다시 그립니다',
  },
};

/** 디렉터 툴을 끄면 돌아갈 방식. 저장하지 않아 다시 실행한 뒤에는 일반 생성으로 돌아간다. */
let modeBeforeDirector: GenerateMode = 'txt2img';

/** 일반 생성 ⇄ i2i 버튼과, 따로 켜고 끄는 디렉터 툴 버튼 */
export function FreeModeSwitch({ mode }: { mode: FreeGeneration['mode'] }) {
  const director = mode === 'augment';
  const current = director ? modeBeforeDirector : mode;
  const other = current === 'txt2img' ? 'img2img' : 'txt2img';
  useEffect(() => {
    if (mode !== 'augment') modeBeforeDirector = mode;
  }, [mode]);
  return (
    <>
      <ModeToggle
        current={GENERATE_MODES[current]}
        next={GENERATE_MODES[other]}
        dimmed={
          director
            ? `디렉터 툴을 끄고 「${GENERATE_MODES[current].label}」로 돌아갑니다`
            : undefined
        }
        onToggle={() => updateFreeGeneration({ mode: director ? current : other })}
      />
      <button
        className={`tool-toggle ${director ? 'active' : ''}`}
        aria-pressed={director}
        title={
          director
            ? `디렉터 툴 끄기 · 「${GENERATE_MODES[current].label}」로 돌아갑니다`
            : '고른 이미지에 Emotion·배경 제거 같은 NovelAI 디렉터 툴을 적용합니다'
        }
        onClick={() => updateFreeGeneration({ mode: director ? current : 'augment' })}
      >
        <Icon name="wand" size={14} />
        <span className="header-label">디렉터 툴</span>
      </button>
    </>
  );
}
