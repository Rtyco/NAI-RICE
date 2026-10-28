import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { findBorderLineMask } from '../../electron/services/Images';

const area = { x: 0, y: 0, width: 128, height: 128 };

function picture(lineWidth: number): Promise<Buffer> {
  return sharp({ create: { width: 128, height: 128, channels: 3, background: '#ffffff' } })
    .composite(
      lineWidth
        ? [
            {
              input: {
                create: { width: lineWidth, height: 128, channels: 3, background: '#000000' },
              },
              left: 0,
              top: 0,
            },
          ]
        : [],
    )
    .png()
    .toBuffer();
}

async function painted(mask: Buffer, x: number, y: number): Promise<boolean> {
  const red = await sharp(mask).extractChannel(0).raw().toBuffer();
  return red[y * 128 + x] >= 128;
}

describe('메인에서 만드는 구분선 마스크', () => {
  it('선을 찾으면 여유를 더해 흰색으로 칠하고, 없으면 만들지 않아', async () => {
    const found = await findBorderLineMask(await picture(6), area, 4);
    expect(found?.lines).toBe(1);
    expect(await painted(found!.mask, 0, 64)).toBe(true);
    expect(await painted(found!.mask, 15, 64)).toBe(true);
    expect(await painted(found!.mask, 16, 64)).toBe(false);
    expect(await findBorderLineMask(await picture(0), area, 4)).toBeUndefined();
  });

  it('칠해 둔 마스크에 더해', async () => {
    const base = await sharp({
      create: { width: 128, height: 128, channels: 3, background: '#000000' },
    })
      .composite([
        {
          input: { create: { width: 8, height: 8, channels: 3, background: '#ffffff' } },
          left: 100,
          top: 100,
        },
      ])
      .png()
      .toBuffer();
    const found = await findBorderLineMask(await picture(6), area, 4, base);
    expect(await painted(found!.mask, 104, 104)).toBe(true);
    expect(await painted(found!.mask, 0, 0)).toBe(true);
    expect(await painted(found!.mask, 60, 60)).toBe(false);
  });
});
