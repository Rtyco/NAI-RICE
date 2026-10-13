import { useEffect, useState } from 'react';
import type { FreeImage } from '../../../core/domain/types';
import { DrawCanvas } from '../../components/DrawCanvas';
import { replaceFreeImagePixels, setPendingDrawing, sourceDataUrl } from '../../freeImageOps';
import { loadHtmlImage } from '../../lib/image';
import { run } from '../../store';

/** 이미지가 바뀌면 `key`로 새로 만든다. */
export function FreeDrawStage({ image }: { image: FreeImage }) {
  const [base, setBase] = useState<HTMLImageElement>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    sourceDataUrl(image.file)
      .then(loadHtmlImage)
      .then((picture) => !cancelled && setBase(picture))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [image.file]);
  useEffect(() => () => setPendingDrawing(undefined), []);
  if (failed) return <p className="hint">이미지를 읽지 못했습니다.</p>;
  if (!base) return <p className="hint">이미지를 불러오는 중…</p>;
  return (
    <DrawCanvas
      base={base}
      width={image.width}
      height={image.height}
      onApply={(dataUrl) =>
        run('그림을 합치는 중', () => replaceFreeImagePixels(image.file, dataUrl)).then(
          () => undefined,
        )
      }
      onPendingChange={setPendingDrawing}
    />
  );
}
