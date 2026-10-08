import { describe, expect, it } from 'vitest';
import { parseNovelAIUserStatus } from '../../src/core/providers/NovelAIProvider';

describe('parseNovelAIUserStatus', () => {
  it('V5 무료 생성 잔여 할당량과 Anlas를 함께 읽어', () => {
    expect(
      parseNovelAIUserStatus({
        subscription: {
          trainingStepsLeft: {
            fixedTrainingStepsLeft: 10_000,
            purchasedTrainingSteps: 250,
          },
          usage: {
            percent: 83.6,
            isNegative: false,
            timeUntilNextPercent: 120,
          },
        },
      }),
    ).toEqual({
      valid: true,
      anlas: 10_250,
      v5Quota: {
        percent: 84,
        isNegative: false,
        timeUntilNextPercent: 120,
      },
    });
  });

  it('서버가 보고한 100% 초과 잔량을 보존하고 불완전한 응답은 미확인으로 둬', () => {
    expect(
      parseNovelAIUserStatus({
        subscription: {
          usage: { percent: 111, isNegative: false, timeUntilNextPercent: 0 },
        },
      }).v5Quota?.percent,
    ).toBe(111);

    expect(
      parseNovelAIUserStatus({ subscription: { usage: { percent: 0 } } }).v5Quota,
    ).toBeUndefined();
  });
});
