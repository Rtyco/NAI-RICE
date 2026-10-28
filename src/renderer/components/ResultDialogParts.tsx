import type { GenerationSummary } from '../../core/domain/types';
import { projectMedia } from '../store';

const SHOWN = 12;

/** 결과를 받는 창 위쪽의 썸네일. */
export function ResultThumbs(props: { projectId: string; records: GenerationSummary[] }) {
  return (
    <div className="i2i-sources">
      {props.records.slice(0, SHOWN).map((record) => (
        <figure key={record.id}>
          <img src={projectMedia(props.projectId, record.thumbFile ?? record.file)} alt="" />
          <figcaption>
            {record.emotionName || `seed ${record.seed}`} · {record.width}×{record.height}
          </figcaption>
        </figure>
      ))}
      {props.records.length > SHOWN && <p className="hint">외 {props.records.length - SHOWN}장</p>}
    </div>
  );
}

export function CostEstimate(props: { estimate: number; reasons: string[]; warn?: boolean }) {
  return (
    <span
      className={props.warn && props.estimate ? 'hint cost-warn' : 'hint'}
      title={[...props.reasons, '예상값이며 실제 차감량과 다를 수 있습니다.'].join('\n')}
    >
      {props.estimate ? `예상 약 ${props.estimate.toLocaleString()} Anlas` : '예상 0 Anlas'}
    </span>
  );
}
