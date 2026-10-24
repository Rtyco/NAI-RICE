import { useState } from 'react';
import type { Emotion, SceneOption } from '../../core/domain/types';
import { newId } from '../../core/model/defaults';
import { comboCount, MAX_COMBOS } from '../../core/model/sceneCombos';
import { PromptTextarea } from './PromptTextarea';

const newOption = (): SceneOption => ({
  id: newId(),
  prompt: '',
  characterPrompts: [],
  enabled: true,
});

/** 끝의 빈 캐릭터 몫은 저장하지 않는다. */
function withCharacterPrompt(option: SceneOption, index: number, value: string): SceneOption {
  const prompts = [...option.characterPrompts];
  while (prompts.length <= index) prompts.push('');
  prompts[index] = value;
  while (prompts.length && !prompts.at(-1)!.trim()) prompts.pop();
  return { ...option, characterPrompts: prompts };
}

/** SDStudio 조합 칸. 씬 모음은 여러 작업이 함께 써서 캐릭터 몫은 순서로 저장된다. */
export function SceneSlotsEditor(props: {
  emotion: Emotion;
  /** 작업의 캐릭터 이름. 라이브러리에서는 비었다. */
  names: string[];
  onChange: (patch: Pick<Emotion, 'slots'>) => void;
}) {
  const { emotion, names } = props;
  const slots = emotion.slots ?? [];
  // 끝의 빈 칸은 저장하지 않아 화면에서만 센다.
  const [opened, setOpened] = useState(0);
  const used = Math.max(0, ...slots.flat().map((option) => option.characterPrompts.length));
  const characterCount = Math.max(names.length, used, opened);
  const count = comboCount(emotion);

  const save = (next: SceneOption[][]) => props.onChange({ slots: next.length ? next : undefined });
  const patchOption = (slotIndex: number, optionId: string, patch: Partial<SceneOption>) =>
    save(
      slots.map((slot, index) =>
        index === slotIndex
          ? slot.map((option) => (option.id === optionId ? { ...option, ...patch } : option))
          : slot,
      ),
    );
  const setOption = (slotIndex: number, next: SceneOption) =>
    save(
      slots.map((slot, index) =>
        index === slotIndex ? slot.map((option) => (option.id === next.id ? next : option)) : slot,
      ),
    );

  if (!slots.length)
    return (
      <button className="scene-slots-add" onClick={() => save([[newOption()]])}>
        ＋ 조합 칸
      </button>
    );

  return (
    <div className="scene-slots">
      <div className="scene-slots-head">
        <span>조합 칸 · 조합 {count > MAX_COMBOS ? `${MAX_COMBOS}개 넘음` : `${count}개`}</span>
        <button
          className="link-button"
          title="다음 캐릭터 몫 칸 추가"
          onClick={() => setOpened(characterCount + 1)}
        >
          ＋ 캐릭터
        </button>
        <button className="link-button" onClick={() => save([...slots, [newOption()]])}>
          ＋ 칸
        </button>
      </div>
      {slots.map((slot, slotIndex) => (
        <div className="scene-slot" key={slotIndex}>
          <div className="scene-slot-head">
            <span>칸 {slotIndex + 1}</span>
            {!slot.some((option) => option.enabled) && (
              <em className="scene-slot-empty">켜진 후보가 없어 생성되지 않음</em>
            )}
            <button
              className="link-button"
              onClick={() =>
                save(
                  slots.map((item, index) => (index === slotIndex ? [...item, newOption()] : item)),
                )
              }
            >
              ＋ 후보
            </button>
            <button
              className="icon-button danger"
              title="칸 삭제"
              onClick={() => save(slots.filter((_, index) => index !== slotIndex))}
            >
              ×
            </button>
          </div>
          {slot.map((option) => (
            <div className={`scene-option ${option.enabled ? '' : 'off'}`} key={option.id}>
              <div className="scene-option-head">
                <input
                  type="checkbox"
                  checked={option.enabled}
                  title="조합에 넣기"
                  onChange={(event) =>
                    patchOption(slotIndex, option.id, { enabled: event.target.checked })
                  }
                />
                <input
                  className="scene-option-name"
                  value={option.name ?? ''}
                  placeholder="후보 이름"
                  aria-label="후보 이름"
                  onChange={(event) =>
                    patchOption(slotIndex, option.id, { name: event.target.value || undefined })
                  }
                />
                <button
                  className="icon-button danger"
                  title="후보 삭제"
                  onClick={() =>
                    save(
                      slots.map((item, index) =>
                        index === slotIndex ? item.filter((entry) => entry.id !== option.id) : item,
                      ),
                    )
                  }
                >
                  ×
                </button>
              </div>
              <PromptTextarea
                rows={2}
                value={option.prompt}
                aria-label="후보 프롬프트"
                placeholder="씬 프롬프트 자리에 붙음"
                onChange={(prompt) => patchOption(slotIndex, option.id, { prompt })}
              />
              {Array.from({ length: characterCount }, (_, index) => (
                <div className="emotion-extra-prompt" key={index}>
                  <span>{names[index] ?? `캐릭터 ${index + 1}`}</span>
                  <PromptTextarea
                    rows={1}
                    value={option.characterPrompts[index] ?? ''}
                    aria-label={`${names[index] ?? `캐릭터 ${index + 1}`} 몫`}
                    placeholder="이 캐릭터 프롬프트에 붙음"
                    onChange={(value) =>
                      setOption(slotIndex, withCharacterPrompt(option, index, value))
                    }
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
