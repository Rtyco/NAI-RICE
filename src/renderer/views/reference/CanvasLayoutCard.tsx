import type { CanvasLayout, FreePlacement, ReferenceSide } from '../../../core/domain/types';
import {
  CUSTOM_MAX,
  CUSTOM_MIN,
  RESOLUTION_PRESETS,
  snapDimension,
} from '../../../core/imaging/CanvasLayout';
import { Icon } from '../../components/Icon';
import { Stepper } from '../../components/Stepper';
import { SelectField } from '../../components/ui';
import { FreePlacementFields, SettingRow } from './ReferenceFields';

const SIDES: Array<{ value: ReferenceSide; label: string }> = [
  { value: 'left', label: '왼쪽' },
  { value: 'right', label: '오른쪽' },
  { value: 'top', label: '위쪽' },
  { value: 'bottom', label: '아래쪽' },
];

export function CanvasLayoutCard(props: {
  layout: CanvasLayout;
  threshold: number;
  canReset: boolean;
  /** 캔버스 크기가 바뀌는 값. 그린 층을 지울지 먼저 묻는다. */
  onCanvasSize: (patch: Partial<CanvasLayout>) => void;
  onLayout: (patch: Partial<CanvasLayout>) => void;
  onFit: (fit: CanvasLayout['fit']) => void;
  onFree: (patch: Partial<FreePlacement>) => void;
  onFitFree: (fit: 'contain' | 'cover') => void;
  onThreshold: (threshold: number) => void;
  onReset: () => void;
}) {
  const { layout } = props;
  const auto = layout.mode === 'auto';
  return (
    <section className="detail-card settings-card">
      <div className="detail-card-head">
        <b>캔버스 구성</b>
      </div>
      <div className="segmented full">
        <button
          className={auto ? 'active' : ''}
          onClick={() => props.onCanvasSize({ mode: 'auto' })}
        >
          자동 구성
        </button>
        <button
          className={!auto ? 'active' : ''}
          onClick={() => props.onCanvasSize({ mode: 'prepared' })}
        >
          직접 준비한 캔버스
        </button>
      </div>
      {auto ? (
        <>
          <SelectField
            label="해상도 (NovelAI에 보내는 전체 캔버스)"
            value={layout.resolution}
            options={[
              ...RESOLUTION_PRESETS.map((item) => ({ value: item.id, label: item.label })),
              { value: 'custom' as const, label: '커스텀' },
            ]}
            onChange={(resolution) => {
              const preset = RESOLUTION_PRESETS.find((item) => item.id === resolution);
              props.onCanvasSize(
                preset
                  ? { resolution, width: preset.width, height: preset.height }
                  : { resolution },
              );
            }}
          />
          {layout.resolution === 'custom' && (
            <>
              <SettingRow label="가로" unit="px">
                <Stepper
                  label="가로"
                  value={layout.width}
                  min={CUSTOM_MIN}
                  max={CUSTOM_MAX}
                  step={64}
                  onChange={(width) => props.onCanvasSize({ width: snapDimension(width) })}
                />
              </SettingRow>
              <SettingRow label="세로" unit="px">
                <Stepper
                  label="세로"
                  value={layout.height}
                  min={CUSTOM_MIN}
                  max={CUSTOM_MAX}
                  step={64}
                  onChange={(height) => props.onCanvasSize({ height: snapDimension(height) })}
                />
              </SettingRow>
            </>
          )}
          <SelectField
            label="참고 이미지 위치"
            value={layout.referenceSide}
            options={SIDES}
            onChange={(referenceSide) => props.onLayout({ referenceSide })}
          />
          <SettingRow
            label="참고 영역 비율"
            unit="%"
            title="캔버스에서 참고 이미지가 차지하는 몫입니다. 나머지가 결과 쪽 크기입니다."
          >
            <Stepper
              label="참고 영역 비율"
              value={Math.round(layout.referenceRatio * 100)}
              min={20}
              max={80}
              step={5}
              onChange={(percent) => props.onLayout({ referenceRatio: percent / 100 })}
            />
          </SettingRow>
          <div className="two-column-fields">
            <SelectField
              label="이미지 맞춤"
              value={layout.fit}
              options={[
                { value: 'contain', label: '전체 보이기' },
                { value: 'cover', label: '꽉 채우기' },
                { value: 'free', label: '자유 배치' },
              ]}
              onChange={props.onFit}
            />
            {layout.fit !== 'free' && (
              <SelectField
                label="세로 맞춤"
                value={layout.anchor}
                options={[
                  { value: 'top', label: '상단' },
                  { value: 'center', label: '중앙' },
                  { value: 'bottom', label: '하단' },
                ]}
                onChange={(anchor) => props.onLayout({ anchor })}
              />
            )}
          </div>
          {layout.fit === 'free' && layout.free && (
            <FreePlacementFields
              free={layout.free}
              onChange={props.onFree}
              onFit={props.onFitFree}
            />
          )}
          <SettingRow label="배경색">
            <input
              type="color"
              className="color-swatch"
              aria-label="배경색"
              value={layout.background}
              onChange={(event) => props.onLayout({ background: event.target.value })}
            />
          </SettingRow>
        </>
      ) : (
        <SettingRow label="배경 임계값">
          <Stepper
            label="배경 임계값"
            value={props.threshold}
            min={4}
            max={64}
            step={1}
            onChange={props.onThreshold}
          />
        </SettingRow>
      )}
      <button
        className="with-icon full-width"
        disabled={!props.canReset}
        title="참고 영역·결과 영역·생성 영역을 처음 상태로 다시 만듭니다"
        onClick={props.onReset}
      >
        <Icon name="refresh" size={14} /> {auto ? '자동 배치로 되돌리기' : '배경 다시 감지'}
      </button>
    </section>
  );
}
