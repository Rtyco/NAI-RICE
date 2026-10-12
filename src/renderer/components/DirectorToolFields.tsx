import { useState, type ReactNode } from 'react';
import type { AugmentSettings } from '../../core/domain/types';
import {
  AUGMENT_STRENGTHS,
  AUGMENT_TOOLS,
  augmentToolInfo,
  EMOTION_MOODS,
} from '../../core/providers/NaiAugment';
import { PromptTextarea } from './PromptTextarea';
import { NumberField, SelectField } from './ui';

/**
 * 디렉터 툴 고르기와 그 툴의 값(표정·강도·장수·프롬프트). 디렉터 툴 창과 자유 생성의 디렉터 툴이 함께 쓴다.
 * `children`은 값 칸과 프롬프트 사이에 들어간다.
 */
export function DirectorToolFields(props: {
  value: AugmentSettings;
  onChange: (patch: Partial<AugmentSettings>) => void;
  countLabel?: string;
  children?: ReactNode;
}) {
  const { value, onChange } = props;
  const info = augmentToolInfo(value.tool);
  const [moreOpen, setMoreOpen] = useState(!info.primary);
  const toolButton = (tool: (typeof AUGMENT_TOOLS)[number]) => (
    <button
      key={tool.id}
      className={value.tool === tool.id ? 'active blue' : ''}
      aria-pressed={value.tool === tool.id}
      title={tool.description}
      onClick={() => onChange({ tool: tool.id })}
    >
      {tool.label}
    </button>
  );
  return (
    <>
      <div className="director-tools">
        <div className="segmented full" role="group" aria-label="툴">
          {AUGMENT_TOOLS.filter((tool) => tool.primary).map(toolButton)}
          <button
            className={`director-more ${moreOpen ? 'open' : ''}`}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(!moreOpen)}
          >
            더 보기
          </button>
        </div>
        {moreOpen && (
          <div className="segmented full" role="group" aria-label="다른 툴">
            {AUGMENT_TOOLS.filter((tool) => !tool.primary).map(toolButton)}
          </div>
        )}
        <p className="hint">{info.description}</p>
      </div>
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

/** 배경 제거를 고르면 띄우는 경고. 0단계·5단계 실측 값을 적는다. */
export function BgRemovalWarning({ results }: { results: number }) {
  return (
    <p className="warning-box">
      배경 제거는 Opus여도 Anlas가 듭니다(832×1216 한 번에 65, 608×832 한 번에 35). 한 번에 배경이
      투명한 이미지 세 장(원본 그대로 오린 것, 다시 그린 것, 거의 원본과 같은 것)이 와서 모두{' '}
      {results}장이 쌓입니다.
    </p>
  );
}
