import type { ReactNode } from 'react';
import type { AugmentSettings } from '../../core/domain/types';
import {
  AUGMENT_STRENGTHS,
  AUGMENT_TOOLS,
  augmentToolInfo,
  EMOTION_MOODS,
} from '../../core/providers/NaiAugment';
import { PromptTextarea } from './PromptTextarea';
import { NumberField, SelectField } from './ui';

/** `children`은 값 칸과 프롬프트 사이에 들어간다. */
export function DirectorToolFields(props: {
  value: AugmentSettings;
  onChange: (patch: Partial<AugmentSettings>) => void;
  countLabel?: string;
  children?: ReactNode;
}) {
  const { value, onChange } = props;
  const info = augmentToolInfo(value.tool);
  const option = (tool: (typeof AUGMENT_TOOLS)[number]) => (
    <option key={tool.id} value={tool.id}>
      {tool.label}
    </option>
  );
  return (
    <>
      <label className="stack-field director-tools">
        툴
        <select
          title={info.description}
          value={value.tool}
          onChange={(event) => onChange({ tool: event.target.value as AugmentSettings['tool'] })}
        >
          {AUGMENT_TOOLS.map(option)}
        </select>
      </label>
      <div className="director-fields">
        {value.tool === 'emotion' && (
          <SelectField
            label="표정"
            value={value.mood}
            options={EMOTION_MOODS.map((mood) => ({
              value: mood.id,
              label: `${mood.label} (${mood.id})`,
            }))}
            onChange={(mood) => onChange({ mood })}
          />
        )}
        {info.strength && (
          <SelectField
            label="강도"
            value={String(value.defry)}
            options={AUGMENT_STRENGTHS.map((label, index) => ({ value: String(index), label }))}
            onChange={(defry) => onChange({ defry: Number(defry) })}
          />
        )}
        <NumberField
          label={props.countLabel ?? '장수'}
          value={value.count}
          min={1}
          max={4}
          integer
          onChange={(count) => onChange({ count })}
        />
      </div>
      {props.children}
      {info.prompt && (
        <label className="prompt-field director-prompt">
          <span>프롬프트 (선택)</span>
          <PromptTextarea
            rows={2}
            value={value.toolPrompt}
            placeholder={
              value.tool === 'emotion' ? '예: tears, blush' : '예: blonde hair, blue eyes'
            }
            onChange={(toolPrompt) => onChange({ toolPrompt })}
          />
        </label>
      )}
    </>
  );
}

/** 0단계·5단계 실측 값 */
export function BgRemovalWarning({ results }: { results: number }) {
  return (
    <p className="warning-box">
      배경 제거는 Opus여도 Anlas가 듭니다(832×1216 한 번에 65, 608×832 한 번에 35). 한 번에 세 장씩,
      모두 {results}장이 쌓입니다.
    </p>
  );
}
