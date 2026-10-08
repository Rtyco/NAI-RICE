import type { Character } from '../../../core/domain/types';
import {
  addPromptSet,
  patchItem,
  removePromptSet,
  repairPromptSetRefs,
  updatePromptSet,
} from '../../../core/model/mutations';
import { Card, Menu, PromptField } from '../../components/ui';
import { updateLibrary } from '../../store';

export function CharacterEditor({ character }: { character: Character }) {
  const save = (recipe: (item: Character) => Character) =>
    updateLibrary((library) => {
      const next = patchItem(library, 'characters', character.id, recipe);
      const updated = next.characters.find((item) => item.id === character.id)!;
      return repairPromptSetRefs(next, updated);
    });
  return (
    <Card
      title="캐릭터 프롬프트 세트"
      subtitle=""
    >
      {character.promptSets.map((set, index) => (
        <section className="prompt-set" key={set.id}>
          <div className="prompt-set-head">
            <input
              className="inline-name"
              value={set.name}
              aria-label="세트 이름"
              onChange={(event) =>
                save((item) => updatePromptSet(item, set.id, { name: event.target.value }))
              }
            />
            <Menu
              label="⋯"
              items={[
                {
                  label: '이 세트 복제',
                  onSelect: () =>
                    save((item) => addPromptSet(item, `${set.name} 복사본`, set).character),
                },
                {
                  label: '삭제',
                  danger: true,
                  disabled: character.promptSets.length <= 1,
                  onSelect: () => save((item) => removePromptSet(item, set.id)),
                },
              ]}
            />
            {index === 0 && <span className="pill">기본</span>}
          </div>
          <div className="two-column">
            <PromptField
              label="캐릭터 포지티브"
              value={set.positive}
              rows={4}
              placeholder="외형, 복장, 정체성 등 캐릭터 전용 태그"
              onChange={(positive) => save((item) => updatePromptSet(item, set.id, { positive }))}
            />
            <PromptField
              label="캐릭터 네거티브"
              tone="negative"
              value={set.negative}
              rows={4}
              onChange={(negative) => save((item) => updatePromptSet(item, set.id, { negative }))}
            />
          </div>
        </section>
      ))}
      <button onClick={() => save((item) => addPromptSet(item).character)}>
        ＋ 프롬프트 세트 추가
      </button>
    </Card>
  );
}
