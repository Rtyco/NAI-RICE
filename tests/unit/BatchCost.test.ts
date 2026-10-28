import { describe, expect, it } from 'vitest';
import { batchCost } from '../../src/core/model/batchCost';
import {
  createEmotion,
  DEFAULT_GENERATION_SETTINGS,
  DEFAULT_LINE_FIX,
  effectiveGenerationSettings,
  type ResolvedProject,
} from '../../src/core/model/defaults';
import { lineFixCostJob } from '../../src/core/model/lineFix';
import { estimateJobAnlas } from '../../src/core/providers/NaiCost';

const generation = { ...DEFAULT_GENERATION_SETTINGS, variantsPerEmotion: 2 };
const area = { x: 0, y: 0, width: 512, height: 768 };

function resolved(autoLineFix: boolean, mode = 'reference'): ResolvedProject {
  return {
    project: { mode, autoLineFix },
    preset: { generation },
    reference: { image: { canvasWidth: 1024, canvasHeight: 1024, outputRect: area } },
    characters: [],
    missing: [],
  } as unknown as ResolvedProject;
}

/** Opus가 아니면 모든 생성에 Anlas가 들어 차이를 볼 수 있다. */
const paper = { tier: 0 };
const scenes = [createEmotion('기쁨', 'smile')];

describe('갤러리 예상 Anlas', () => {
  it('자동 구분선 지우기는 결과마다 장수만큼 잘라 낸 크기로 최대치를 더해', () => {
    const lineFix = { ...DEFAULT_LINE_FIX, count: 2 };
    const without = batchCost(resolved(false), scenes, undefined, paper, lineFix).estimate!;
    const withLineFix = batchCost(resolved(true), scenes, undefined, paper, lineFix).estimate!;
    const one = estimateJobAnlas(
      lineFixCostJob(lineFix, effectiveGenerationSettings(generation), area),
      paper,
    );
    expect(one).toBeGreaterThan(0);
    expect(withLineFix - without).toBe(one * 2 * 2);
  });

  it('인페인트 모드가 아니면 구분선 지우기를 더하지 않아', () => {
    const txt = (on: boolean) =>
      batchCost(resolved(on, 'txt2img'), scenes, undefined, paper, DEFAULT_LINE_FIX).estimate;
    expect(txt(true)).toBe(txt(false));
  });
});
