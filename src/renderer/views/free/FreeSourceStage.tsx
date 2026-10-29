import type { MouseEvent, ReactNode } from 'react';
import type { FreeImage, Preset } from '../../../core/domain/types';
import { modelLabel, noInpaintReason } from '../../../core/providers/NaiModels';
import { ImageStage } from '../../components/ImageStage';
import { StreamPreview } from '../../components/StreamPreview';
import {
  loadImageFromFile,
  newBlankImage,
  sourceMedia,
  type ImageTarget,
} from '../../freeImageOps';
import { FreeDrawStage } from './FreeDrawStage';
import { FreeMaskCanvas } from './FreeMaskCanvas';

export function FreeSourceStage(props: {
  target: ImageTarget;
  image?: FreeImage;
  drawing: boolean;
  showSource: boolean;
  inpainting: boolean;
  sourceLabel: string;
  filmstrip: boolean;
  preset?: Preset;
  result: ReactNode;
}) {
  const { target, image } = props;
  const blank = {
    width: props.preset?.generation.width ?? 832,
    height: props.preset?.generation.height ?? 1216,
  };
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

export function ResultStage(props: {
  src?: string;
  alt?: string;
  filmstrip: boolean;
  /** 원본과 나란히 보일 때 붙인다. */
  labelled: boolean;
  running: string[];
  pending: number;
  onGrid?: () => void;
  onContextMenu?: (event: MouseEvent) => void;
}) {
  return (
    <ImageStage
      src={props.src}
      alt={props.alt}
      filmstrip={props.filmstrip}
      onGrid={props.onGrid}
      empty={
        <div className="stage-empty">
          <p>아직 생성된 이미지가 없습니다.</p>
        </div>
      }
      overlay={
        <>
          <StreamPreview jobIds={props.running} className="stage-preview" />
          {props.labelled && <span className="stage-label">결과</span>}
          {props.pending > 0 && (
            <span className="card-status busy stage-status">생성 대기 {props.pending}</span>
          )}
        </>
      }
      onContextMenu={props.onContextMenu}
    />
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
