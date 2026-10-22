import type { ReactNode } from 'react';
import type { DividerLine, FreePlacement, Rect, Reference } from '../../../core/domain/types';
import { clampRect } from '../../../core/imaging/rects';
import { patchItem } from '../../../core/model/mutations';
import { Stepper } from '../../components/Stepper';
import { SelectField, Toggle } from '../../components/ui';
import { updateLibrary } from '../../store';

export function SettingRow(props: {
  label: string;
  unit?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row" title={props.title}>
      <span>{props.label}</span>
      <span>
        {props.children}
        {props.unit}
      </span>
    </div>
  );
}

/** NovelAI 마스크 한 칸이 8px라 8 단위로 맞춘다. */
function snapCells(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value / 8) * 8));
}

export function FreePlacementFields(props: {
  free: FreePlacement;
  onChange: (patch: Partial<FreePlacement>) => void;
  onFit: (fit: 'contain' | 'cover') => void;
}) {
  const { free, onChange } = props;
  return (
    <>
      <div>
        <SettingRow label="가로 위치" unit="%" title="참고 영역 안에서 이미지 중심의 위치입니다">
          <Stepper
            label="가로 위치"
            value={Math.round(free.x * 100)}
            min={-100}
            max={200}
            step={1}
            onChange={(percent) => onChange({ x: percent / 100 })}
          />
        </SettingRow>
        <SettingRow label="세로 위치" unit="%">
          <Stepper
            label="세로 위치"
            value={Math.round(free.y * 100)}
            min={-100}
            max={200}
            step={1}
            onChange={(percent) => onChange({ y: percent / 100 })}
          />
        </SettingRow>
        <SettingRow label="가로 크기" unit="%" title="100%가 전체 보이기 크기입니다">
          <Stepper
            label="가로 크기"
            value={Math.round(free.scaleX * 100)}
            min={5}
            max={1000}
            step={5}
            onChange={(percent) => onChange({ scaleX: percent / 100 })}
          />
        </SettingRow>
        <SettingRow label="세로 크기" unit="%">
          <Stepper
            label="세로 크기"
            value={Math.round(free.scaleY * 100)}
            min={5}
            max={1000}
            step={5}
            onChange={(percent) => onChange({ scaleY: percent / 100 })}
          />
        </SettingRow>
        <SettingRow label="회전" unit="°">
          <Stepper
            label="회전"
            value={Math.round(free.rotation)}
            min={-180}
            max={180}
            step={1}
            onChange={(rotation) => onChange({ rotation })}
          />
        </SettingRow>
        <Toggle label="좌우 반전" checked={free.flipX} onChange={(flipX) => onChange({ flipX })} />
      </div>
      <div className="button-row">
        <button onClick={() => props.onFit('contain')}>전체 보이기로</button>
        <button onClick={() => props.onFit('cover')}>꽉 채우기로</button>
        <button onClick={() => onChange({ x: 0.5, y: 0.5 })}>가운데로</button>
      </div>
    </>
  );
}

export function DividerFields(props: {
  divider: DividerLine;
  onChange: (patch: Partial<DividerLine>) => void;
}) {
  const { divider, onChange } = props;
  return (
    <>
      <Toggle
        label="분리선"
        checked={divider.enabled}
        onChange={(enabled) => onChange({ enabled })}
      />
      {divider.enabled && (
        <>
          <SettingRow label="선 색">
            <input
              type="color"
              className="color-swatch"
              aria-label="분리선 색"
              value={divider.color}
              onChange={(event) => onChange({ color: event.target.value })}
            />
          </SettingRow>
          <SettingRow label="선 두께" unit="px" title="NovelAI 마스크 한 칸(8px) 단위입니다">
            <Stepper
              label="선 두께"
              value={divider.widthPx}
              min={8}
              max={32}
              step={8}
              onChange={(widthPx) => onChange({ widthPx: snapCells(widthPx, 8, 32) })}
            />
          </SettingRow>
          <SelectField
            label="선 위치"
            value={divider.placement}
            options={[
              { value: 'outside', label: '생성 영역 바깥' },
              { value: 'center', label: '경계에 걸침' },
              { value: 'inside', label: '생성 영역 안쪽 (다시 그려질 수 있음)' },
            ]}
            onChange={(placement) => onChange({ placement })}
          />
          {divider.placement !== 'center' && (
            <SettingRow
              label="경계와 간격"
              unit="px"
              title="생성 영역 경계에서 선을 이만큼 띄웁니다"
            >
              <Stepper
                label="경계와 간격"
                value={divider.gapPx}
                min={0}
                max={64}
                step={8}
                onChange={(gapPx) => onChange({ gapPx: snapCells(gapPx, 0, 64) })}
              />
            </SettingRow>
          )}
        </>
      )}
    </>
  );
}

const CROP_FIELDS = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'width', label: '가로' },
  { key: 'height', label: '세로' },
] as const;

export function OutputRectFields(props: {
  rect: Rect;
  width: number;
  height: number;
  onChange: (rect: Rect) => void;
}) {
  const { rect } = props;
  return (
    <details className="crop-details">
      <summary>결과 영역 숫자로 맞추기</summary>
      <div className="two-column-fields">
        {CROP_FIELDS.map(({ key, label }) => (
          <SettingRow key={key} label={label}>
            <Stepper
              label={`결과 영역 ${label}`}
              value={Math.round(rect[key])}
              min={key === 'width' || key === 'height' ? 16 : 0}
              max={key === 'x' || key === 'width' ? props.width : props.height}
              step={8}
              onChange={(value) =>
                props.onChange(clampRect({ ...rect, [key]: value }, props.width, props.height, 16))
              }
            />
          </SettingRow>
        ))}
      </div>
    </details>
  );
}

export function InpaintRequestCard({ reference }: { reference: Reference }) {
  const changeStrength = (inpaintStrength: number) =>
    updateLibrary((library) =>
      patchItem(library, 'references', reference.id, (item) => ({ ...item, inpaintStrength })),
    );
  return (
    <section className="detail-card settings-card">
      <div className="detail-card-head">
        <b>생성</b>
      </div>
      <SettingRow label="인페인트 강도" title="Inpaint Strength">
        <Stepper
          label="인페인트 강도"
          value={reference.inpaintStrength}
          min={0}
          max={1}
          step={0.05}
          onChange={changeStrength}
        />
      </SettingRow>
    </section>
  );
}
