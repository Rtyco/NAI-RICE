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
import { Card, Menu } from '../../components/ui';
import { toast, updateLibrary, useLibrary } from '../../store';
import { PromptTextarea } from '../../components/PromptTextarea';
import { ExpandTextButton } from '../../components/TextEditorDialog';
import { SceneSlotsEditor } from '../../components/SceneSlotsEditor';

export function EmotionSetEditor({ set }: { set: EmotionSet }) {
  const library = useLibrary();
  const save = (recipe: (item: EmotionSet) => EmotionSet) =>
    updateLibrary((current) => patchItem(current, 'emotionSets', set.id, recipe));
  const others = library.emotionSets.filter((item) => item.id !== set.id);
  // 끝의 빈 칸은 저장하지 않아 화면에서만 센다.
  const [opened, setOpened] = useState<Record<string, number>>({});
  return (
    <Card
      title={`씬 (${set.emotions.length})`}
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
          <div className="piece-row emotion-row" key={emotion.id}>
            <div className="piece-row-head">
              <span className="row-index">{index + 1}</span>
              <input
                className="emotion-name-input"
                value={emotion.name}
                aria-label="씬 이름"
                onChange={(event) =>
                  save((item) => updateEmotion(item, emotion.id, { name: event.target.value }))
                }
              />
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
            <div className="emotion-prompts">
              <PromptTextarea
                rows={3}
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
                      rows={2}
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
              <div className="emotion-extra-prompt negative-field">
                <span>네거티브</span>
                <PromptTextarea
                  rows={2}
                  value={emotion.negative ?? ''}
                  aria-label={`${emotion.name} 씬 네거티브`}
                  placeholder="이 씬에서만 뺄 태그"
                  onChange={(negative) =>
                    save((item) =>
                      updateEmotion(item, emotion.id, { negative: negative || undefined }),
                    )
                  }
                />
              </div>
              <SceneSlotsEditor
                emotion={emotion}
                names={[]}
                onChange={(patch) => save((item) => updateEmotion(item, emotion.id, patch))}
              />
            </div>
          </div>
        ))}
        {!set.emotions.length && <p className="hint">씬이 없습니다.</p>}
      </div>
    </Card>
  );
}
