import type { ReactNode } from 'react';
import type { FreeImage } from '../../../core/domain/types';
import { modelLabel, noInpaintReason } from '../../../core/providers/NaiModels';
import { ImageStage } from '../../components/ImageStage';
import {
  loadImageFromFile,
  newBlankImage,
  sourceMedia,
  type ImageTarget,
} from '../../freeImageOps';
import { FreeDrawStage } from './FreeDrawStage';
import { FreeMaskCanvas } from './FreeMaskCanvas';

/** 자유 생성과 씬 상세 i2i의 가운데. `result`는 결과 미리보기. */
export function FreeSourceStage(props: {
  target: ImageTarget;
  image?: FreeImage;
  drawing: boolean;
  showSource: boolean;
  inpainting: boolean;
  sourceLabel: string;
  filmstrip: boolean;
  /** 이미지 없이 그리기 탭을 열면 만들 빈 캔버스 크기 */
  blank: { width: number; height: number };
  result: ReactNode;
}) {
  const { target, image, blank } = props;
  if (props.drawing)
    return (
      <div className="free-mask-stage">
        {image ? (
          <FreeDrawStage key={image.file} target={target} image={image} />
        ) : (
          <div className="stage-empty">
            <p>그릴 이미지가 없습니다.</p>
            <div className="stage-empty-actions">
              <button
                className="accent"
                onClick={() => void newBlankImage(target, blank.width, blank.height)}
              >
                빈 캔버스 만들기 ({blank.width}×{blank.height})
              </button>
              <button onClick={() => void loadImageFromFile(target)}>파일에서 불러오기</button>
            </div>
          </div>
        )}
      </div>
    );
  if (props.showSource && image)
    return props.inpainting ? (
      <div className="free-mask-stage">
        <FreeMaskCanvas key={image.file} target={target} image={image} />
      </div>
    ) : (
      <ImageStage src={sourceMedia(image.file)} filmstrip={props.filmstrip} />
    );
  if (!image) return props.result;
  return (
    <div className="compare-stage">
      <ImageStage
        src={sourceMedia(image.file)}
        alt={props.sourceLabel}
        overlay={<span className="stage-label">{props.sourceLabel}</span>}
      />
      {props.result}
    </div>
  );
}

export function InpaintModelBanner({ model }: { model: string }) {
  return (
    <div className="missing-banner">
      ⚠{' '}
      {[
        `${modelLabel(model)}는 인페인팅을 지원하지 않습니다.`,
        noInpaintReason(model),
        '생성 설정에서 모델을 바꾸거나 「전체 다시 그리기」로 바꾸십시오.',
      ]
        .filter(Boolean)
        .join(' ')}
    </div>
  );
}
