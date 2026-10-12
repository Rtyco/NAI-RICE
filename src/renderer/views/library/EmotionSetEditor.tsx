import { useState } from 'react';
import type { EmotionSet } from '../../../core/domain/types';
import {
  addEmotion,
  mergeEmotions,
  moveEmotion,
  patchItem,
  removeEmotion,
  updateEmotion,
  withExtraPrompt,
} from '../../../core/model/mutations';
import { moodLabel, suggestMood } from '../../../core/providers/NaiAugment';
import { MoodSelect, StrengthSelect } from '../../components/MoodFields';
import { Card, Menu } from '../../components/ui';
import { toast, updateLibrary, useLibrary } from '../../store';
import { PromptTextarea } from '../../components/PromptTextarea';
import { ExpandTextButton } from '../../components/TextEditorDialog';

export function EmotionSetEditor({ set }: { set: EmotionSet }) {
  const library = useLibrary();
  const save = (recipe: (item: EmotionSet) => EmotionSet) =>
    updateLibrary((current) => patchItem(current, 'emotionSets', set.id, recipe));
  const others = library.emotionSets.filter((item) => item.id !== set.id);
  // 새로 연 빈 칸은 저장하지 않으므로(끝의 빈 칸은 지운다) 화면에서만 센다.
  const [opened, setOpened] = useState<Record<string, number>>({});
  return (
    <Card
      title={`씬 (${set.emotions.length})`}
      subtitle="캐릭터 포지티브 뒤에 붙음 · 캐릭터가 여럿이면 칸마다 그 순서의 캐릭터에 붙음 · 이 모음을 쓰는 모든 작업에 반영"
      actions={
        <>
          {others.length > 0 && (
            <Menu
              label="다른 모음에서 가져오기"
              items={others.map((other) => ({
                label: `${other.name} (${other.emotions.length})`,
                onSelect: () => {
                  save((item) => mergeEmotions(item, other.emotions));
                  toast(`${other.name}의 씬을 병합했습니다. 같은 이름은 덮어썼습니다.`);
                },
              }))}
            />
          )}
          <button className="accent" onClick={() => save((item) => addEmotion(item))}>
            ＋ 씬 추가
          </button>
        </>
      }
    >
      <div className="emotion-table">
        {set.emotions.map((emotion, index) => (
          <div className="emotion-table-row" key={emotion.id}>
            <span className="row-index">{index + 1}</span>
            <input
              className="emotion-name-input"
              value={emotion.name}
              aria-label="씬 이름"
              onChange={(event) =>
                save((item) => updateEmotion(item, emotion.id, { name: event.target.value }))
              }
            />
            <div className="emotion-prompts">
              <PromptTextarea
                rows={1}
                value={emotion.prompt}
                aria-label={`${emotion.name} 프롬프트`}
                placeholder="씬 프롬프트"
                onChange={(prompt) => save((item) => updateEmotion(item, emotion.id, { prompt }))}
              />
              {Array.from(
                {
                  length: Math.max(emotion.extraPrompts?.length ?? 0, opened[emotion.id] ?? 0),
                },
                (_, extra) => (
                  <div className="emotion-extra-prompt" key={extra}>
                    <span>캐릭터 {extra + 2}</span>
                    <PromptTextarea
                      rows={1}
                      value={emotion.extraPrompts?.[extra] ?? ''}
                      aria-label={`${emotion.name} 캐릭터 ${extra + 2} 프롬프트`}
                      placeholder="비워 두면 이 캐릭터에는 붙이지 않습니다"
                      onChange={(prompt) =>
                        save((item) =>
                          updateEmotion(item, emotion.id, withExtraPrompt(emotion, extra, prompt)),
                        )
                      }
                    />
                  </div>
                ),
              )}
            </div>
            <div className="row-actions">
              <button
                className="icon-button"
                title="다음 캐릭터의 씬 프롬프트 칸 추가"
                onClick={() =>
                  setOpened((current) => ({
                    ...current,
                    [emotion.id]:
                      Math.max(emotion.extraPrompts?.length ?? 0, current[emotion.id] ?? 0) + 1,
                  }))
                }
              >
                ＋
              </button>
              <ExpandTextButton
                title={`${emotion.name || '씬'} 프롬프트`}
                value={emotion.prompt}
                placeholder="씬 프롬프트"
                onApply={(prompt) => save((item) => updateEmotion(item, emotion.id, { prompt }))}
              />
              <button
                className="icon-button"
                disabled={index === 0}
                title="위로"
                onClick={() => save((item) => moveEmotion(item, emotion.id, index - 1))}
              >
                ↑
              </button>
              <button
                className="icon-button"
                disabled={index === set.emotions.length - 1}
                title="아래로"
                onClick={() => save((item) => moveEmotion(item, emotion.id, index + 1))}
              >
                ↓
              </button>
              <button
                className="icon-button danger"
                title="삭제"
                onClick={() => save((item) => removeEmotion(item, emotion.id))}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        {!set.emotions.length && <p className="hint">씬이 없습니다.</p>}
      </div>
    </Card>
  );
}

/** 대표 이미지 한 장으로 씬 표정 세트를 만들 때(Emotion 툴) 씬마다 쓰는 표정과 강도. */
export function EmotionMoodEditor({ set }: { set: EmotionSet }) {
  const save = (recipe: (item: EmotionSet) => EmotionSet) =>
    updateLibrary((current) => patchItem(current, 'emotionSets', set.id, recipe));
  if (!set.emotions.length) return null;
  return (
    <Card
      title="Emotion 툴 표정"
      subtitle="대표 이미지 한 장으로 씬마다 표정만 바꾼 세트를 만들 때 씁니다 · 비워 두면 씬 이름으로 추천합니다"
    >
      <div className="mood-table">
        {set.emotions.map((emotion) => {
          const suggested = suggestMood(emotion.name);
          return (
            <div className="mood-table-row" key={emotion.id}>
              <span className="mood-scene">{emotion.name || '(이름 없음)'}</span>
              <MoodSelect
                value={emotion.augmentMood ?? ''}
                label={`${emotion.name} 표정`}
                emptyLabel={suggested ? `추천: ${moodLabel(suggested)}` : '고르지 않음'}
                onChange={(mood) =>
                  save((item) =>
                    updateEmotion(item, emotion.id, { augmentMood: mood || undefined }),
                  )
                }
              />
              <StrengthSelect
                value={emotion.augmentDefry ?? 0}
                label={`${emotion.name} 강도`}
                onChange={(defry) =>
                  save((item) =>
                    updateEmotion(item, emotion.id, { augmentDefry: defry || undefined }),
                  )
                }
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
