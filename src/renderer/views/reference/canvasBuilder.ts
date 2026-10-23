import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasLayout, Rect } from '../../../core/domain/types';
import { cropOutside, suggestOutputRect } from '../../../core/imaging/OutputCropper';
import { expandRect } from '../../../core/imaging/rects';
import { composeCanvas, prepareImage, repaintComposed } from '../../lib/image';
import { LatestOnly } from '../../lib/LatestOnly';
import { errorMessage, toast } from '../../store';
import { detectionText, type Source, type Working } from './referenceStorage';

export type BuiltCanvas = { working: Working; referenceRect: Rect; outputRect: Rect };

type Repaint = { canvas: HTMLCanvasElement; dataUrl: string; layout: CanvasLayout };

/** 여백은 만들기가 끝난 때의 값을 쓴다. */
async function buildCanvas(
  source: Source,
  layout: CanvasLayout,
  threshold: number,
  expansionPx: () => number,
): Promise<BuiltCanvas> {
  if (layout.mode === 'auto') {
    const composed = await composeCanvas(source.dataUrl, layout);
    const { width, height, referenceRect } = composed;
    return {
      working: {
        canvas: composed.canvas,
        width,
        height,
        backgroundMask: composed.backgroundMask,
        detectionLabel: '자동 구성',
      },
      referenceRect,
      outputRect: cropOutside(
        composed.outputRect,
        expandRect(referenceRect, expansionPx(), width, height),
      ),
    };
  }
  const prepared = await prepareImage(source.dataUrl, threshold);
  const { width, height } = prepared;
  const referenceRect = prepared.detection.referenceRect;
  return {
    working: {
      canvas: prepared.canvas,
      width,
      height,
      backgroundMask: prepared.backgroundMask,
      detectionLabel: detectionText(prepared.detection.mode, prepared.detection.confidence),
    },
    referenceRect,
    outputRect: suggestOutputRect(
      expandRect(referenceRect, expansionPx(), width, height),
      width,
      height,
      1,
    ),
  };
}

/** 늦게 끝난 앞 요청의 결과는 버린다. 다시 칠하기는 프레임마다 한 번. */
export function useCanvasBuilder(expansionPx: number, onBuilt: (built: BuiltCanvas) => void) {
  const expansion = useRef(expansionPx);
  expansion.current = expansionPx;
  const built = useRef(onBuilt);
  built.current = onBuilt;
  const sequence = useRef(0);
  const [rebuilding, setRebuilding] = useState(false);
  /** 캔버스 객체는 그대로라 이 값으로 다시 그리게 한다. */
  const [imageVersion, setImageVersion] = useState(0);

  const rebuild = useCallback(async (source: Source, layout: CanvasLayout, threshold: number) => {
    const current = (sequence.current += 1);
    setRebuilding(true);
    try {
      const result = await buildCanvas(source, layout, threshold, () => expansion.current);
      if (current === sequence.current) built.current(result);
    } catch (error) {
      toast(`캔버스를 만들 수 없습니다: ${errorMessage(error)}`, 'error');
    } finally {
      if (current === sequence.current) setRebuilding(false);
    }
  }, []);

  const [rebuilds] = useState(
    () => new LatestOnly<[Source, CanvasLayout, number]>((args) => rebuild(...args)),
  );
  useEffect(() => () => rebuilds.clear(), [rebuilds]);

  const [repaints] = useState(
    () =>
      new LatestOnly<Repaint>(async ({ canvas, dataUrl, layout }) => {
        try {
          await repaintComposed(canvas, dataUrl, layout);
          setImageVersion((version) => version + 1);
        } catch (error) {
          toast(`캔버스를 다시 칠할 수 없습니다: ${errorMessage(error)}`, 'error');
        }
        await new Promise(requestAnimationFrame);
      }),
  );

  return {
    rebuilding,
    imageVersion,
    rebuild,
    schedule: (source: Source | null, layout: CanvasLayout, threshold: number) => {
      if (source) rebuilds.push([source, layout, threshold]);
    },
    repaint: (job: Repaint) => repaints.push(job),
    busy: () => rebuilds.busy,
  };
}
