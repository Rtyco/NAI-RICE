import type { FreeImage, Preset } from '../../../core/domain/types';
import { openDialog } from '../../components/dialogStack';
import { Icon } from '../../components/Icon';
import { NumberRow, PresetNumberRow } from '../../components/PresetNumberRow';
import {
  clearImage,
  findBorderLines,
  loadImageFromFile,
  sourceMedia,
  updateImageTarget,
  type ImageTarget,
} from '../../freeImageOps';
import { FreeReferencePicker } from './FreeReferencePicker';

/** 디렉터 툴 모드도 같은 이미지를 쓰고 이미지 칸만 보인다. */
export function FreeImagePanel({
  target,
  image,
  inpaint,
  director = false,
  preset,
}: {
  target: ImageTarget;
  image?: FreeImage;
  inpaint: boolean;
  director?: boolean;
  preset?: Preset;
}) {
  const fromReference = image?.fromReference;
  return (
    <section className="detail-card free-source">
      <div className="detail-card-head">
        <b>{director ? '디렉터 툴 이미지' : 'i2i 이미지'}</b>
        {image && (
          <button className="link-button" onClick={() => clearImage(target)}>
            비우기
          </button>
        )}
      </div>
      <div className="free-source-body">
        {image ? (
          <img src={sourceMedia(image.file)} alt="" />
        ) : (
          <span className="free-source-empty" />
        )}
        <span className="hint">
          {image
            ? `${fromReference ? '인페인트 · ' : ''}${image.name} · ${image.outputRect.width}×${image.outputRect.height}`
            : '아직 고르지 않았습니다'}
        </span>
      </div>
      <div className="free-source-loads">
        <button className="with-icon" onClick={() => void loadImageFromFile(target)}>
          <Icon name="plus" size={14} /> 파일에서 불러오기
        </button>
        {!director && (
          <button
            className="with-icon"
            onClick={() =>
              void openDialog((close) => <FreeReferencePicker target={target} close={close} />)
            }
          >
            <Icon name="reference" size={14} /> 인페인트에서 불러오기
          </button>
        )}
        {!director && image && (
          <button className="with-icon" onClick={() => void findBorderLines(target)}>
            <Icon name="border-line" size={14} /> 구분선 찾기
          </button>
        )}
      </div>
      {!director && (
        <div className="segmented free-source-mode" role="group" aria-label="다시 그릴 범위">
          <button
            className={inpaint ? '' : 'active'}
            aria-pressed={!inpaint}
            onClick={() => updateImageTarget(target, { inpaint: false })}
          >
            <Icon name="i2i" size={14} /> 전체 다시 그리기
          </button>
          <button
            className={inpaint ? 'active' : ''}
            aria-pressed={inpaint}
            onClick={() => updateImageTarget(target, { inpaint: true })}
          >
            <Icon name="brush" size={14} /> 인페인팅
          </button>
        </div>
      )}
      {inpaint && image && fromReference && !director ? (
        <NumberRow
          field="inpaintStrength"
          value={fromReference.inpaintStrength}
          savedIn="이 이미지"
          onChange={(inpaintStrength) =>
            updateImageTarget(target, {
              image: { ...image, fromReference: { ...fromReference, inpaintStrength } },
            })
          }
        />
      ) : (
        preset &&
        !director &&
        (inpaint ? (
          <PresetNumberRow preset={preset} field="inpaintStrength" />
        ) : (
          <>
            <PresetNumberRow preset={preset} field="img2imgStrength" />
            <PresetNumberRow preset={preset} field="img2imgNoise" />
          </>
        ))
      )}
    </section>
  );
}
