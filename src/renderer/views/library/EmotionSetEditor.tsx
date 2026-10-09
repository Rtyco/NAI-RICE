import type { EmotionSet } from '../../../core/domain/types';
import {
  addEmotion,
  mergeEmotions,
  moveEmotion,
  patchItem,
  removeEmotion,
  updateEmotion,
} from '../../../core/model/mutations';
import { Card, Menu } from '../../components/ui';
import { toast, updateLibrary, useLibrary } from '../../store';
import { PromptTextarea } from '../../components/PromptTextarea';
import { ExpandTextButton } from '../../components/TextEditorDialog';

export function EmotionSetEditor({ set }: { set: EmotionSet }) {
  const library = useLibrary();
  const save = (recipe: (item: EmotionSet) => EmotionSet) =>
    updateLibrary((current) => patchItem(current, 'emotionSets', set.id, recipe));
  const others = library.emotionSets.filter((item) => item.id !== set.id);
  return (
    <Card
      title={`씬 (${set.emotions.length})`}
      subtitle="캐릭터 포지티브 뒤에 붙음 · 이 모음을 쓰는 모든 작업에 반영"
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
            <PromptTextarea
              rows={1}
              value={emotion.prompt}
              aria-label={`${emotion.name} 프롬프트`}
              placeholder="씬 프롬프트"
              onChange={(prompt) => save((item) => updateEmotion(item, emotion.id, { prompt }))}
            />
            <div className="row-actions">
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
