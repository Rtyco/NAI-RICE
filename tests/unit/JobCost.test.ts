import { describe, expect, it } from 'vitest';
import {
  createDefaultLibrary,
  createPreset,
  DEFAULT_LINE_FIX,
  DEFAULT_SETTINGS,
} from '../../src/core/model/defaults';
import { followUpAnlas } from '../../src/core/model/jobCost';
import { librarySchema } from '../../src/core/validation/schemas';
import type { GenerationJobSnapshot } from '../../src/core/domain/types';

const opus = { tier: 3, valid: true } as never;
const job = (patch: Partial<GenerationJobSnapshot>) =>
  ({
    kind: 'txt2img',
    canvasWidth: 832,
    canvasHeight: 1216,
    settings: createPreset('P').generation,
    ...patch,
  }) as unknown as GenerationJobSnapshot;

describe('큐에 넣기 전 예상 Anlas', () => {
  it('이어 붙는 작업이 없으면 0', () => {
    expect(followUpAnlas(job({}), opus)).toBe(0);
  });

  it('구분선 지우기는 장수만큼 최대치로 더한다', () => {
    const big = { canvasWidth: 1600, canvasHeight: 1600 };
    const one = followUpAnlas(job({ ...big, lineFix: { ...DEFAULT_LINE_FIX, count: 1 } }), opus);
    const three = followUpAnlas(job({ ...big, lineFix: { ...DEFAULT_LINE_FIX, count: 3 } }), opus);
    expect(one).toBeGreaterThan(0);
    expect(three).toBe(one * 3);
  });

  it('옛 설정에는 Anlas 확인이 기본값(Anlas가 들 때마다)으로 들어간다', () => {
    const library = createDefaultLibrary();
    const old: Partial<typeof library.settings> = { ...library.settings };
    delete old.anlasConfirm;
    const parsed = librarySchema.parse({ ...library, settings: old });
    expect(parsed.settings.anlasConfirm).toEqual(DEFAULT_SETTINGS.anlasConfirm);
  });
});
