import { useState } from 'react';
import type { AugmentTool, GenerationSummary } from '../../core/domain/types';
import { DEFAULT_GENERATION_SETTINGS } from '../../core/model/defaults';
import {
  AUGMENT_STRENGTHS,
  AUGMENT_TOOLS,
  augmentToolInfo,
  EMOTION_MOODS,
} from '../../core/providers/NaiAugment';
import { estimateJobAnlas, generationCostWarnings } from '../../core/providers/NaiCost';
import { directorToolSize, runDirectorTool, type DirectorToolOptions } from '../actions';
import { projectMedia, useStore } from '../store';
import { Modal } from './Dialogs';
import { SelectField, Toggle } from './ui';

// 같은 실행 동안 마지막으로 고른 툴과 값을 다음 창의 기본값으로 쓴다.
let lastOptions: Omit<DirectorToolOptions, 'shrink'> = {
  tool: 'emotion',
  mood: 'happy',
  toolPrompt: '',
  defry: 0,
};

const FREE_PIXELS = 1024 * 1024;

export function DirectorToolDialog(props: {
  projectId: string;
  records: GenerationSummary[];
  tool?: AugmentTool;
  /** 있으면 Emotion 툴에서 「씬마다 다른 표정으로 만들기」로 넘어갈 수 있다. */
  onSceneSet?: () => void;
  close: () => void;
}) {
  const token = useStore((state) => state.token);
  const [options, setOptions] = useState<DirectorToolOptions>({
    ...lastOptions,
    ...(props.tool ? { tool: props.tool } : {}),
    shrink: true,
  });
  const patch = (value: Partial<DirectorToolOptions>) =>
    setOptions((current) => ({ ...current, ...value }));
  const info = augmentToolInfo(options.tool);
  const [moreOpen, setMoreOpen] = useState(!info.primary);
  const oversized = props.records.some((record) => record.width * record.height > FREE_PIXELS);
  const costJobs = props.records.map((record) => {
    const size = directorToolSize(record, options.shrink);
    return {
      kind: 'augment' as const,
      tool: options.tool,
      settings: DEFAULT_GENERATION_SETTINGS,
      canvasWidth: size.width,
      canvasHeight: size.height,
    };
  });
  const estimate = costJobs.reduce((sum, job) => sum + estimateJobAnlas(job, token), 0);
  const reasons = generationCostWarnings(costJobs, token);
  const count = props.records.length;
  const resultCount = options.tool === 'bg-removal' ? count * 3 : count;

  const submit = () => {
    const { tool, mood, toolPrompt, defry } = options;
    lastOptions = { tool, mood, toolPrompt, defry };
    props.close();
    void runDirectorTool(
      props.projectId,
      props.records.map((record) => ({ record })),
      options,
    );
  };

  const toolButton = (tool: (typeof AUGMENT_TOOLS)[number]) => (
    <button
      key={tool.id}
      className={options.tool === tool.id ? 'active blue' : ''}
      title={tool.description}
      onClick={() => patch({ tool: tool.id })}
    >
      {tool.label}
    </button>
  );

  return (
    <Modal
      title={count > 1 ? `결과 ${count}장에 디렉터 툴 적용` : '디렉터 툴'}
      onClose={props.close}
      wide
      footer={
        <>
          <span
            className={`hint ${estimate ? 'cost-warn' : ''}`}
            title={[...reasons, '예상값이며 실제 차감량과 다를 수 있습니다.'].join('\n')}
          >
            {estimate ? `예상 약 ${estimate.toLocaleString()} Anlas` : '예상 0 Anlas (무료)'}
          </span>
          <button onClick={props.close}>취소</button>
          <button className="accent" onClick={submit}>
            {count > 1 ? `${count}장에 적용` : '적용'}
          </button>
        </>
      }
    >
      <div className="i2i-sources">
        {props.records.slice(0, 12).map((record) => (
          <figure key={record.id}>
            <img src={projectMedia(props.projectId, record.thumbFile ?? record.file)} alt="" />
            <figcaption>
              {record.emotionName || `seed ${record.seed}`} · {record.width}×{record.height}
            </figcaption>
          </figure>
        ))}
        {count > 12 && <p className="hint">외 {count - 12}장</p>}
      </div>
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
      {(info.strength || options.tool === 'emotion') && (
        <div className="four-column-fields">
          {options.tool === 'emotion' && (
            <SelectField
              label="표정"
              value={options.mood}
              options={EMOTION_MOODS.map((mood) => ({
                value: mood.id,
                label: `${mood.label} (${mood.id})`,
              }))}
              onChange={(mood) => patch({ mood })}
            />
          )}
          {info.strength && (
            <SelectField
              label="강도"
              value={String(options.defry)}
              options={AUGMENT_STRENGTHS.map((label, index) => ({
                value: String(index),
                label,
              }))}
              onChange={(value) => patch({ defry: Number(value) })}
            />
          )}
        </div>
      )}
      {options.tool === 'emotion' && props.onSceneSet && (
        <p className="hint">
          씬 모음의 씬마다 다른 표정으로 한꺼번에 만들려면{' '}
          <button
            className="link-button"
            onClick={() => {
              props.close();
              props.onSceneSet?.();
            }}
          >
            이 이미지로 씬 표정 만들기 →
          </button>
        </p>
      )}
      {info.prompt && (
        <label className="stack-field">
          {options.tool === 'emotion' ? '추가 문구 (선택)' : '프롬프트 (선택)'}
          <input
            value={options.toolPrompt}
            placeholder={
              options.tool === 'emotion' ? '예: tears, blush' : '예: blonde hair, blue eyes'
            }
            onChange={(event) => patch({ toolPrompt: event.target.value })}
          />
        </label>
      )}
      {oversized && (
        <Toggle
          label="무료 면적(1024×1024)을 넘는 결과는 비율을 지켜 줄여 보내기"
          checked={options.shrink}
          onChange={(shrink) => patch({ shrink })}
        />
      )}
      {options.tool === 'bg-removal' && (
        <p className="warning-box">
          배경 제거는 Opus여도 Anlas가 듭니다(832×1216 한 장에 65 Anlas). 결과는 배경이 투명한
          이미지 세 장으로, 모두 {resultCount}장이 쌓입니다.
        </p>
      )}
      <p className="hint">
        {options.tool === 'emotion' && '정면을 보는 중립 표정의 캐릭터 한 명일 때 가장 잘 됩니다. '}
        결과는 원래 씬에 새 결과로 쌓이고, 프롬프트와 생성 설정은 쓰지 않습니다.
      </p>
    </Modal>
  );
}
