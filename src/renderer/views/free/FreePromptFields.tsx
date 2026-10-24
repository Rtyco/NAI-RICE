import type { EmotionPosition, FreeGeneration, Preset } from '../../../core/domain/types';
import { freePromptPosition } from '../../../core/jobs/JobBuilder';
import { usesMedium } from '../../../core/providers/NaiModels';
import { PromptField } from '../../components/ui';
import { PROMPT_POSITIONS } from '../../promptPositions';
import { updateFreeGeneration } from '../../store';

const SHORT_LABELS: Record<EmotionPosition, string> = {
  'common-end': '공통 끝',
  'common-marker': '공통 | 자리',
  'character-end': '캐릭터 끝',
};

export function FreePromptFields(props: {
  free: FreeGeneration;
  preset?: Preset;
  firstCharacterPositive?: string;
}) {
  const { free } = props;
  const hasCharacterPrompt = Boolean(props.firstCharacterPositive?.trim());
  const position = freePromptPosition(free.promptPosition, props.firstCharacterPositive);
  return (
    <>
      <PromptField
        label="프롬프트"
        dialogTitle="자유 생성 프롬프트"
        rows={8}
        value={free.prompt}
        placeholder="예: sitting, cafe, window, warm lighting"
        counter={false}
        onChange={(prompt) => updateFreeGeneration({ prompt })}
      />
      <PromptField
        label="네거티브"
        hint={
          props.preset && usesMedium(props.preset.generation)
            ? 'Medium에서는 쓰이지 않음'
            : undefined
        }
        title={
          position === 'character-end'
            ? '첫 캐릭터 네거티브 뒤에 붙습니다'
            : '공통 네거티브 뒤에 붙습니다'
        }
        dialogTitle="자유 생성 네거티브"
        tone="negative"
        rows={3}
        value={free.negative}
        placeholder="이번 생성에서만 뺄 태그"
        counter={false}
        onChange={(negative) => updateFreeGeneration({ negative })}
      />
      <div className="prompt-position">
        <span>붙일 위치</span>
        <span className="segmented" role="group" aria-label="프롬프트를 붙일 위치">
          {(['common-end', 'common-marker', 'character-end'] as const).map((value) => {
            const blocked = value === 'character-end' && !hasCharacterPrompt;
            return (
              <button
                key={value}
                className={position === value ? 'active' : ''}
                aria-pressed={position === value}
                disabled={blocked}
                title={
                  blocked
                    ? '캐릭터 프롬프트가 없어 고를 수 없습니다'
                    : value === 'character-end'
                      ? 'V4 이상에서 그 캐릭터에만 적용됩니다'
                      : PROMPT_POSITIONS[value]
                }
                onClick={() => updateFreeGeneration({ promptPosition: value })}
              >
                {SHORT_LABELS[value]}
              </button>
            );
          })}
        </span>
      </div>
    </>
  );
}
