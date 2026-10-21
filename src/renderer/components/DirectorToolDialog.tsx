import { useState } from 'react';
import type { AugmentSettings, AugmentTool, GenerationSummary } from '../../core/domain/types';
import { DEFAULT_GENERATION_SETTINGS } from '../../core/model/defaults';
import { DEFAULT_AUGMENT_SETTINGS } from '../../core/providers/NaiAugment';
import { estimateJobAnlas, generationCostWarnings } from '../../core/providers/NaiCost';
import { directorToolSize, runDirectorTool, type DirectorToolOptions } from '../actions';
import { projectMedia, useStore } from '../store';
import { Modal } from './Dialogs';
import { BgRemovalWarning, DirectorToolFields } from './DirectorToolFields';
import { Toggle } from './ui';

// 같은 실행 동안 다음 창의 기본값이 된다.
let lastOptions: AugmentSettings = DEFAULT_AUGMENT_SETTINGS;

const FREE_PIXELS = 1024 * 1024;

export function DirectorToolDialog(props: {
  projectId: string;
  records: GenerationSummary[];
  tool?: AugmentTool;
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
  const estimate =
    costJobs.reduce((sum, job) => sum + estimateJobAnlas(job, token), 0) * options.count;
  const reasons = generationCostWarnings(costJobs, token);
  const count = props.records.length;
  const requests = count * options.count;
  const resultCount = options.tool === 'bg-removal' ? requests * 3 : requests;

  const submit = () => {
    const { tool, mood, toolPrompt, defry } = options;
    // 배경 제거는 Anlas가 들어 장수를 넘기지 않는다.
    lastOptions = {
      tool,
      mood,
      toolPrompt,
      defry,
      count: tool === 'bg-removal' ? 1 : options.count,
    };
    props.close();
    void runDirectorTool(
      props.projectId,
      props.records.map((record) => ({ record })),
      options,
    );
  };

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
            {requests > 1 ? `${requests}번 적용` : '적용'}
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
      <DirectorToolFields
        value={options}
        onChange={patch}
        countLabel={count > 1 ? '결과마다 장수' : '장수'}
      >
        {options.tool === 'emotion' && props.onSceneSet && (
          <p>
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
      </DirectorToolFields>
      {oversized && (
        <Toggle
          label="무료 면적(1024×1024)을 넘는 결과는 비율을 지켜 줄여 보내기"
          checked={options.shrink}
          onChange={(shrink) => patch({ shrink })}
        />
      )}
      {options.tool === 'bg-removal' && <BgRemovalWarning results={resultCount} />}
    </Modal>
  );
}
