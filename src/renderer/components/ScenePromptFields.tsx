import type { Emotion } from '../../core/domain/types';
import { withExtraPrompt } from '../../core/model/mutations';
import { confirmDialog } from './dialogStack';
import { PromptField } from './ui';

/** 씬 모음은 여러 작업이 함께 써서 칸은 캐릭터 이름이 아니라 순서로 저장된다. */
export function ScenePromptFields(props: {
  emotion: Emotion;
  /** 비어 있으면 칸 하나 */
  names: string[];
  firstPlacement: string;
  /** 첫 칸이 첫 캐릭터가 아니라 상위·하위 사이로 갈 때 */
  firstOnCommon?: boolean;
  negativePlacement: string;
  negativeHint?: string;
  onChange: (patch: Partial<Pick<Emotion, 'prompt' | 'extraPrompts' | 'negative'>>) => void;
}) {
  const { emotion, names } = props;
  const slots = Math.max(1, names.length);
  const hidden = (emotion.extraPrompts ?? []).slice(slots - 1).filter((prompt) => prompt.trim());
  const dropHidden = async () => {
    const ok = await confirmDialog({
      title: '캐릭터 칸 삭제',
      message: `${emotion.name}의 ${slots + 1}번째 이후 캐릭터 씬 프롬프트 ${hidden.length}개를 지웁니다. 이 씬 모음을 쓰는 다른 작업에도 반영됩니다.`,
      confirmLabel: '삭제',
      danger: true,
    });
    const kept = (emotion.extraPrompts ?? []).slice(0, slots - 1);
    if (ok)
      props.onChange({ extraPrompts: kept.some((prompt) => prompt.trim()) ? kept : undefined });
  };
  return (
    <>
      {Array.from({ length: slots }, (_, index) => {
        const label =
          slots < 2
            ? '씬 프롬프트'
            : index === 0 && props.firstOnCommon
              ? '씬 프롬프트 · 중간'
              : `씬 프롬프트 · ${index + 1}. ${names[index]}`;
        return (
          <PromptField
            key={index}
            label={label}
            title={
              index === 0
                ? props.firstPlacement
                : '이 캐릭터 프롬프트 뒤(| 자리가 있으면 그 자리)에 붙습니다'
            }
            dialogTitle={`${emotion.name} ${label}`}
            rows={slots > 1 ? 6 : 10}
            value={index === 0 ? emotion.prompt : (emotion.extraPrompts?.[index - 1] ?? '')}
            placeholder={
              index === 0
                ? '예: smile, happy, open mouth'
                : '비워 두면 이 캐릭터에는 붙이지 않습니다'
            }
            counter={false}
            onChange={(next) =>
              props.onChange(
                index === 0 ? { prompt: next } : withExtraPrompt(emotion, index - 1, next),
              )
            }
          />
        );
      })}
      <PromptField
        label="씬 네거티브"
        hint={props.negativeHint}
        title={props.negativePlacement}
        dialogTitle={`${emotion.name} 씬 네거티브`}
        tone="negative"
        rows={2}
        value={emotion.negative ?? ''}
        placeholder="이 씬에서만 뺄 태그"
        counter={false}
        onChange={(negative) => props.onChange({ negative: negative || undefined })}
      />
      {hidden.length > 0 && (
        <p className="hint">
          {slots + 1}번째 이후 캐릭터 칸에 프롬프트 {hidden.length}개가 더 있습니다.{' '}
          <button className="link-button" onClick={() => void dropHidden()}>
            지우기
          </button>
        </p>
      )}
    </>
  );
}
