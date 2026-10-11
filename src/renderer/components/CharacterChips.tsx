import type { CharacterSlot } from '../../core/domain/types';
import { useLibrary } from '../store';
import { ChainChip } from './ChainChip';
import { Icon } from './Icon';

/**
 * 구성 막대의 캐릭터 칩들. 캐릭터마다 칩 하나이고, 끝의 「+ 캐릭터」로 늘린다. 순서가 곧 씬 프롬프트 칸의
 * 순서이고, 인페인트의 참고 이미지는 첫 캐릭터만 참고가 된다.
 */
export function CharacterChips(props: {
  slots: CharacterSlot[];
  /** 자유 생성처럼 캐릭터 없이도 생성하는 곳이면 true. 마지막 캐릭터도 뺄 수 있다. */
  optional?: boolean;
  /** 모델이 받는 최대 인원. 넘으면 더 넣지 못한다. */
  max: number;
  onChange: (slots: CharacterSlot[]) => void;
}) {
  const library = useLibrary();
  const { slots, onChange } = props;
  const many = slots.length > 1;

  const replace = (index: number, value: CharacterSlot) =>
    onChange(slots.map((slot, at) => (at === index ? value : slot)));
  const pick = (index: number, characterId: string) => {
    const character = library.characters.find((item) => item.id === characterId);
    if (!character) {
      onChange(slots.filter((_, at) => at !== index));
      return;
    }
    replace(index, {
      ...slots[index],
      characterId: character.id,
      promptSetId: character.promptSets[0].id,
    });
  };
  const add = () => {
    const used = new Set(slots.map((slot) => slot.characterId));
    const character =
      library.characters.find((item) => !used.has(item.id)) ?? library.characters[0];
    if (character)
      onChange([...slots, { characterId: character.id, promptSetId: character.promptSets[0].id }]);
  };
  const moveEarlier = (index: number) =>
    onChange([
      ...slots.slice(0, index - 1),
      slots[index],
      slots[index - 1],
      ...slots.slice(index + 1),
    ]);

  if (!slots.length && props.optional) {
    return (
      <ChainChip section="characters">
        <select value="" onChange={(event) => event.target.value && add()}>
          <option value="">캐릭터 없음</option>
          {library.characters.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </ChainChip>
    );
  }

  return (
    <>
      {slots.map((slot, index) => {
        const character = library.characters.find((item) => item.id === slot.characterId);
        const promptSet =
          character?.promptSets.find((set) => set.id === slot.promptSetId) ??
          character?.promptSets[0];
        const removable = many || props.optional;
        return (
          <ChainChip
            key={index}
            section="characters"
            itemId={character?.id}
            missing={!character}
            label={
              many
                ? {
                    text: `캐릭터 ${index + 1}`,
                    icon: 'character',
                    usage:
                      index === 0
                        ? '첫 캐릭터: 참고 이미지가 참고하고, 씬 프롬프트의 첫 칸이 붙습니다'
                        : `씬 프롬프트의 ${index + 1}번째 칸이 붙습니다`,
                  }
                : undefined
            }
            actions={
              <>
                {index > 0 && (
                  <button
                    className="icon-button chain-chip-edit"
                    title="앞으로 옮기기"
                    aria-label="앞으로 옮기기"
                    onClick={() => moveEarlier(index)}
                  >
                    <Icon name="chevron" size={14} className="rotate-left" />
                  </button>
                )}
                {removable && (
                  <button
                    className="icon-button chain-chip-edit"
                    title="이 캐릭터 빼기"
                    aria-label="이 캐릭터 빼기"
                    onClick={() => onChange(slots.filter((_, at) => at !== index))}
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </>
            }
          >
            <select value={slot.characterId} onChange={(event) => pick(index, event.target.value)}>
              {!character && <option value={slot.characterId}>(없음)</option>}
              {props.optional && !many && <option value="">캐릭터 없음</option>}
              {library.characters.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {character && character.promptSets.length > 1 && (
              <>
                <span className="chain-chip-sep">/</span>
                <select
                  title="캐릭터 프롬프트 세트"
                  aria-label="캐릭터 프롬프트 세트"
                  value={promptSet?.id}
                  onChange={(event) => replace(index, { ...slot, promptSetId: event.target.value })}
                >
                  {character.promptSets.map((set) => (
                    <option key={set.id} value={set.id}>
                      세트: {set.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </ChainChip>
        );
      })}
      {library.characters.length > 0 && (
        <button
          className="chain-add"
          disabled={slots.length >= props.max}
          title={
            slots.length >= props.max
              ? `이 모델은 캐릭터를 ${props.max}명까지 넣을 수 있습니다`
              : '캐릭터를 한 명 더 넣습니다'
          }
          onClick={add}
        >
          <Icon name="plus" size={13} /> 캐릭터
        </button>
      )}
    </>
  );
}
