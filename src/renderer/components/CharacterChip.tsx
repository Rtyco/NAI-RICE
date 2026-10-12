import type { CharacterSlot } from '../../core/domain/types';
import { useLibrary } from '../store';
import { ChecklistChip } from './ChainChip';
import { Icon } from './Icon';

/**
 * 구성 막대의 캐릭터 칩. 누르면 캐릭터 목록이 뜨고, 체크한 순서가 곧 씬 프롬프트 칸의 순서다. 인페인트의
 * 참고 이미지는 첫 캐릭터만 참고가 된다.
 */
export function CharacterChip(props: {
  slots: CharacterSlot[];
  /** 자유 생성처럼 캐릭터 없이도 생성하는 곳이면 true. 마지막 캐릭터도 뺄 수 있다. */
  optional?: boolean;
  /** 모델이 받는 최대 인원. 넘으면 더 넣지 못한다. */
  max: number;
  onChange: (slots: CharacterSlot[]) => void;
}) {
  const library = useLibrary();
  const { slots, onChange } = props;
  const checked = [...new Set(slots.map((slot) => slot.characterId))];
  const full = slots.length >= props.max;
  const names = slots.map(
    (slot) => library.characters.find((item) => item.id === slot.characterId)?.name ?? '(없음)',
  );
  const missing = slots.some(
    (slot) => !library.characters.some((item) => item.id === slot.characterId),
  );

  const toggle = (characterId: string) => {
    if (checked.includes(characterId)) {
      onChange(slots.filter((slot) => slot.characterId !== characterId));
      return;
    }
    const character = library.characters.find((item) => item.id === characterId);
    if (character && !full)
      onChange([...slots, { characterId, promptSetId: character.promptSets[0].id }]);
  };
  const moveEarlier = (index: number) =>
    onChange([
      ...slots.slice(0, index - 1),
      slots[index],
      slots[index - 1],
      ...slots.slice(index + 1),
    ]);
  const lastOne = !props.optional && slots.length === 1;

  return (
    <ChecklistChip
      section="characters"
      itemId={slots[0]?.characterId}
      missing={missing || (!props.optional && !slots.length)}
      edit={slots.length > 1 ? null : undefined}
      value={
        !names.length
          ? '캐릭터 없음'
          : names.length > 2
            ? `${names[0]} 외 ${names.length - 1}명`
            : names.join(', ')
      }
      items={[
        ...library.characters.map((item) => ({
          id: item.id,
          name: item.name,
          folder: item.folder,
          hint: item.promptSets.length > 1 ? `세트 ${item.promptSets.length}개` : undefined,
          disabled: checked.includes(item.id)
            ? lastOne
              ? '작업에는 캐릭터가 한 명 이상 있어야 합니다'
              : undefined
            : full
              ? `이 모델은 캐릭터를 ${props.max}명까지 넣을 수 있습니다`
              : undefined,
        })),
        ...checked
          .filter((id) => !library.characters.some((item) => item.id === id))
          .map((id) => ({ id, name: '(지워진 캐릭터)' })),
      ]}
      checked={checked}
      multi
      onPick={toggle}
      editSection="characters"
      empty="라이브러리에 캐릭터가 없습니다."
      hint="번호가 씬 프롬프트 칸의 순서입니다"
      rowTools={(characterId, order) => {
        const index = slots.findIndex((slot) => slot.characterId === characterId);
        const slot = slots[index];
        const character = library.characters.find((item) => item.id === characterId);
        return (
          <>
            {character && character.promptSets.length > 1 && (
              <select
                className="checklist-select"
                title="캐릭터 프롬프트 세트"
                aria-label="캐릭터 프롬프트 세트"
                value={slot.promptSetId}
                onChange={(event) =>
                  onChange(
                    slots.map((item, at) =>
                      at === index ? { ...item, promptSetId: event.target.value } : item,
                    ),
                  )
                }
              >
                {character.promptSets.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.name}
                  </option>
                ))}
              </select>
            )}
            {order > 1 && (
              <button
                className="icon-button checklist-edit"
                title="앞 순서로 옮기기"
                aria-label="앞 순서로 옮기기"
                onClick={() => moveEarlier(index)}
              >
                <Icon name="chevron" size={14} className="rotate-up" />
              </button>
            )}
          </>
        );
      }}
    />
  );
}
