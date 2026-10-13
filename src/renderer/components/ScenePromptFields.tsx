import type { Emotion } from '../../core/domain/types';
import { withExtraPrompt } from '../../core/model/mutations';
import { PromptTextarea } from './PromptTextarea';
import { ExpandTextButton } from './TextEditorDialog';

/** 씬 모음은 여러 작업이 함께 써서 칸은 캐릭터 이름이 아니라 순서로 저장된다. */
export function ScenePromptFields(props: {
  emotion: Emotion;
  /** 비어 있으면 칸 하나 */
  names: string[];
  firstPlacement: string;
  onChange: (patch: Partial<Pick<Emotion, 'prompt' | 'extraPrompts'>>) => void;
}) {
  const { emotion, names } = props;
  const slots = Math.max(1, names.length);
  const hidden = (emotion.extraPrompts ?? []).slice(slots - 1).filter((prompt) => prompt.trim());
  return (
    <>
      {Array.from({ length: slots }, (_, index) => {
        const value = index === 0 ? emotion.prompt : (emotion.extraPrompts?.[index - 1] ?? '');
        const change = (next: string) =>
          props.onChange(
            index === 0 ? { prompt: next } : withExtraPrompt(emotion, index - 1, next),
          );
        const title = slots > 1 ? `씬 프롬프트 · ${index + 1}. ${names[index]}` : '씬 프롬프트';
        return (
          <label className="prompt-field" key={index}>
            <span>
              {title}
              <span className="prompt-field-tools">
                <em>{index === 0 ? props.firstPlacement : '이 캐릭터 프롬프트 뒤에 붙습니다'}</em>
                <ExpandTextButton
                  title={`${emotion.name} ${title}`}
                  value={value}
                  placeholder="예: smile, happy, open mouth"
                  onApply={change}
                />
              </span>
            </span>
            <PromptTextarea
              rows={slots > 1 ? 3 : 5}
              value={value}
              placeholder={
                index === 0
                  ? '예: smile, happy, open mouth'
                  : '비워 두면 이 캐릭터에는 붙이지 않습니다'
              }
              onChange={change}
            />
          </label>
        );
      })}
      {hidden.length > 0 && (
        <p className="hint">
          이 작업에 없는 {slots + 1}번째 이후 캐릭터 칸에도 프롬프트가 {hidden.length}개 있습니다.
          캐릭터를 더 넣으면 쓰입니다.
        </p>
      )}
    </>
  );
}
