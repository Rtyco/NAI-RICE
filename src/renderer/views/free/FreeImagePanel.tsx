import type { FreeGeneration, Preset } from '../../../core/domain/types';
import { Icon } from '../../components/Icon';
import { PresetNumberRow } from '../../components/PresetNumberRow';
import { clearFreeImage, loadFreeImageFromFile, sourceMedia } from '../../freeImageOps';
import { updateFreeGeneration } from '../../store';

/** 디렉터 툴 모드도 같은 이미지를 쓰고 이미지 칸만 보인다. */
export function FreeImagePanel({ free, preset }: { free: FreeGeneration; preset?: Preset }) {
  const { image } = free;
  const director = free.mode === 'augment';
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
            ? `${image.name} · ${image.outputRect.width}×${image.outputRect.height}`
            : '아직 고르지 않았습니다'}
          <br />
          {director
            ? '결과의 「이 결과로 디렉터 툴」로 보내거나 파일에서 불러옵니다.'
            : '결과의 「자유 생성으로 보내기」로 보내거나 파일에서 불러옵니다.'}
        </span>
      </div>
      <button className="with-icon" onClick={() => void loadFreeImageFromFile()}>
        <Icon name="plus" size={14} /> 파일에서 불러오기
      </button>
      {!director && (
        <div className="segmented free-source-mode" role="group" aria-label="다시 그릴 범위">
          <button
            className={free.inpaint ? '' : 'active'}
            aria-pressed={!free.inpaint}
            title="이미지 전체를 강도만큼 다시 그립니다"
            onClick={() => updateFreeGeneration({ inpaint: false })}
          >
            <Icon name="refresh" size={14} /> 전체 다시 그리기
          </button>
          <button
            className={free.inpaint ? 'active' : ''}
            aria-pressed={free.inpaint}
            title="가운데 이미지에 마스크로 칠한 곳만 다시 그립니다"
            onClick={() => updateFreeGeneration({ inpaint: true })}
          >
            <Icon name="brush" size={14} /> 인페인팅
          </button>
        </div>
      )}
      {preset &&
        !director &&
        (free.inpaint ? (
          <PresetNumberRow preset={preset} field="inpaintStrength" />
        ) : (
          <>
            <PresetNumberRow preset={preset} field="img2imgStrength" />
            <PresetNumberRow preset={preset} field="img2imgNoise" />
          </>
        ))}
    </section>
  );
}
