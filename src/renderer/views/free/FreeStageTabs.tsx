import { Icon } from '../../components/Icon';

export type FreeStage = 'source' | 'draw' | 'result';

export function FreeStageTabs(props: {
  stage: FreeStage;
  onStage: (stage: FreeStage) => void;
  hasImage: boolean;
  /** 원본 탭 이름과 아이콘 */
  source: { label: string; icon: 'brush' | 'wand' | 'reference' };
  drawable: boolean;
}) {
  const { stage, onStage, hasImage } = props;
  return (
    <div className="segmented stage-tabs" role="group" aria-label="왼쪽에 보일 것">
      {hasImage && (
        <button
          className={stage === 'source' ? 'active' : ''}
          aria-pressed={stage === 'source'}
          onClick={() => onStage('source')}
        >
          <Icon name={props.source.icon} size={14} />
          {props.source.label}
        </button>
      )}
      {props.drawable && (
        <button
          className={stage === 'draw' ? 'active' : ''}
          aria-pressed={stage === 'draw'}
          onClick={() => onStage('draw')}
        >
          <Icon name="pen" size={14} /> 그리기
        </button>
      )}
      <button
        className={stage === 'result' || (!hasImage && stage === 'source') ? 'active' : ''}
        aria-pressed={stage === 'result'}
        onClick={() => onStage('result')}
      >
        <Icon name="images" size={14} /> {hasImage ? '원본과 결과' : '결과'}
      </button>
    </div>
  );
}
