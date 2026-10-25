import type { FreeGeneration, Preset } from '../../../core/domain/types';
import { openDialog } from '../../components/dialogStack';
import { Icon } from '../../components/Icon';
import { PresetNumberRow } from '../../components/PresetNumberRow';
import { Stepper } from '../../components/Stepper';
import { clearFreeImage, loadFreeImageFromFile, sourceMedia } from '../../freeImageOps';
import { updateFreeGeneration } from '../../store';
import { FreeReferencePicker } from './FreeReferencePicker';

/** 디렉터 툴 모드도 같은 이미지를 쓰고 이미지 칸만 보인다. */
export function FreeImagePanel({ free, preset }: { free: FreeGeneration; preset?: Preset }) {
  const { image } = free;
  const director = free.mode === 'augment';
  const fromReference = image?.fromReference;
  return (
    <section className="detail-card free-source">
      <div className="detail-card-head">
        <b>{director ? '디렉터 툴 이미지' : 'i2i 이미지'}</b>
        {image && (
          <button className="link-button" onClick={clearFreeImage}>
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
        <button className="with-icon" onClick={() => void loadFreeImageFromFile()}>
          <Icon name="plus" size={14} /> 파일에서 불러오기
        </button>
        {!director && (
          <button
            className="with-icon"
            onClick={() => void openDialog((close) => <FreeReferencePicker close={close} />)}
          >
            <Icon name="reference" size={14} /> 인페인트에서 불러오기
          </button>
        )}
      </div>
      {!director && (
        <div className="segmented free-source-mode" role="group" aria-label="다시 그릴 범위">
          <button
            className={free.inpaint ? '' : 'active'}
            aria-pressed={!free.inpaint}
            onClick={() => updateFreeGeneration({ inpaint: false })}
          >
            <Icon name="refresh" size={14} /> 전체 다시 그리기
          </button>
          <button
            className={free.inpaint ? 'active' : ''}
            aria-pressed={free.inpaint}
            onClick={() => updateFreeGeneration({ inpaint: true })}
          >
            <Icon name="brush" size={14} /> 인페인팅
          </button>
        </div>
      )}
      {free.inpaint && image && fromReference && !director ? (
        <div className="preset-number-row" title="인페인팅 강도 (Strength) · 이 이미지에 저장">
          <span>
            <Icon name="brush" size={14} /> 강도
          </span>
          <Stepper
            value={fromReference.inpaintStrength}
            min={0}
            max={1}
            step={0.05}
            label="강도"
            onChange={(inpaintStrength) =>
              updateFreeGeneration({
                image: { ...image, fromReference: { ...fromReference, inpaintStrength } },
              })
            }
          />
        </div>
      ) : (
        preset &&
        !director &&
        (free.inpaint ? (
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
