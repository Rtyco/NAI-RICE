import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FreeImage } from '../../../core/domain/types';
import { ReferenceCanvas } from '../../components/ReferenceCanvas';
import { saveMask, setMask, sourceDataUrl, type ImageTarget } from '../../freeImageOps';
import { decodeMask, loadHtmlImage } from '../../lib/image';

const NO_RECT = { x: 0, y: 0, width: 0, height: 0 };

const ignore = () => undefined;

/** 이미지가 바뀌면 `key`로 새로 만들어 마스크와 실행 취소 기록이 섞이지 않는다. */
export function FreeMaskCanvas({ target, image }: { target: ImageTarget; image: FreeImage }) {
  const { file, width, height } = image;
  const [initialMaskFile] = useState(image.maskFile);
  const [loaded, setLoaded] = useState<{ image: HTMLImageElement; mask?: Uint8Array }>();
  const [failed, setFailed] = useState(false);
  const empty = useMemo(() => new Uint8Array(width * height), [width, height]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const picture = await loadHtmlImage(await sourceDataUrl(file));
        // 읽지 못하면 빈 마스크에서 다시 칠한다.
        const mask = initialMaskFile
          ? await sourceDataUrl(initialMaskFile)
              .then((url) => decodeMask(url, width, height))
              .catch(() => undefined)
          : undefined;
        if (!cancelled) setLoaded({ image: picture, mask });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, width, height, initialMaskFile]);

  useEffect(() => () => void saveMask(), []);

  const onMaskChange = useCallback(
    (mask: Uint8Array) => setMask(target, file, mask, width, height),
    [target, file, width, height],
  );

  if (failed)
    return (
      <div className="stage-empty">
        <p>이미지를 읽지 못했습니다.</p>
        <p className="hint">오른쪽에서 이미지를 다시 불러오십시오.</p>
      </div>
    );
  if (!loaded) return <p className="hint">이미지를 불러오는 중…</p>;
  return (
    <ReferenceCanvas
      maskOnly
      image={loaded.image}
      width={width}
      height={height}
      backgroundMask={empty}
      referenceRect={NO_RECT}
      outputRect={image.outputRect}
      expansionPx={0}
      initialMask={loaded.mask}
      detectionLabel=""
      onReferenceRectChange={ignore}
      onOutputRectChange={ignore}
      onMaskChange={onMaskChange}
    />
  );
}
