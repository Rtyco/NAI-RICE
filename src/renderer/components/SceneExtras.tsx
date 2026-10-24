import type { Emotion } from '../../core/domain/types';

const SCENE_SIZES: Array<[number, number]> = [
  [832, 1216],
  [1216, 832],
  [1024, 1024],
  [1024, 1536],
  [1536, 1024],
  [1472, 1472],
];

/** SDStudio 씬 seed·해상도. 비우면 생성 설정을 따른다. */
export function SceneExtras(props: {
  emotion: Emotion;
  /** 인페인트는 캔버스 크기를 써서 크기 칸을 보이지 않는다. */
  txt2img: boolean;
  onChange: (patch: Pick<Emotion, 'seed' | 'width' | 'height'>) => void;
}) {
  const { emotion } = props;
  const sizeKey = emotion.width && emotion.height ? `${emotion.width}x${emotion.height}` : '';
  const sizes = SCENE_SIZES.map(([width, height]) => `${width}x${height}`);
  if (sizeKey && !sizes.includes(sizeKey)) sizes.push(sizeKey);
  return (
    <div className="scene-extras">
      <label className="stack-field">
        씬 seed
        <input
          type="number"
          min={0}
          max={4_294_967_295}
          value={emotion.seed ?? ''}
          placeholder="생성 설정 따름"
          onChange={(event) => {
            const value = Number(event.target.value);
            props.onChange({
              seed:
                event.target.value === '' || !Number.isInteger(value) || value < 0
                  ? undefined
                  : Math.min(value, 4_294_967_295),
            });
          }}
        />
      </label>
      {props.txt2img && (
        <label className="stack-field">
          씬 크기
          <select
            value={sizeKey}
            onChange={(event) => {
              const [width, height] = event.target.value.split('x').map(Number);
              props.onChange(
                event.target.value ? { width, height } : { width: undefined, height: undefined },
              );
            }}
          >
            <option value="">생성 설정 따름</option>
            {sizes.map((key) => (
              <option key={key} value={key}>
                {key.replace('x', ' × ')}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
