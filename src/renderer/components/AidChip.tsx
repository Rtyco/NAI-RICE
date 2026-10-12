import type { AidMode, CharacterReference, Project, Vibe } from '../../core/domain/types';
import { aidItems, projectAid, projectAidMode, type AidChoice } from '../../core/model/defaults';
import { supportsReferenceAid } from '../../core/providers/NaiModels';
import { pictureMedia, useLibrary } from '../store';
import { ChecklistChip, type ChecklistItem } from './ChainChip';
import { Toggle } from './ui';

const AID_MODES: Record<AidMode, { label: string; title: string }> = {
  character: { label: '레퍼런스', title: '캐릭터 레퍼런스를 씁니다' },
  vibe: { label: '바이브', title: '바이브를 씁니다' },
};

export type AidValue = AidChoice & Pick<Project, 'normalizeVibes'>;

/**
 * 참고 칩. 캐릭터 레퍼런스와 바이브는 함께 쓰지 않아 칩 안의 버튼을 누를 때마다 방식이 바뀌고, 그 방식의
 * 목록에서 여럿 고른다. 방식을 바꿔도 다른 쪽에서 고른 것은 남겨 둔다. 작업과 자유 생성이 함께 쓴다.
 */
export function AidChip(props: {
  value: AidValue;
  onChange: (patch: Partial<AidValue>) => void;
  /** 생성 설정의 모델. V4.5가 아니면 칩을 경고 색으로 둔다. */
  model?: string;
  /** 인페인트 요청이면 캐릭터 레퍼런스를 고를 때 경고한다. */
  inpaint: boolean;
}) {
  const library = useLibrary();
  const { value, onChange: patch } = props;
  const mode = projectAidMode(value);
  const aid = projectAid(library, value);
  const missing =
    aidItems(aid).some((item) => !item?.image) ||
    Boolean(props.model && !supportsReferenceAid(props.model));
  const row = (item: CharacterReference | Vibe): ChecklistItem => ({
    id: item.id,
    name: item.name,
    folder: item.folder,
    thumb: item.image ? pictureMedia(item.image.file) : '',
    hint: item.image ? undefined : '그림 없음',
  });
  const character = mode === 'character';
  const next: AidMode = character ? 'vibe' : 'character';
  const section = character ? 'characterReferences' : 'vibes';
  const list: Array<CharacterReference | Vibe> = character
    ? library.characterReferences
    : library.vibes;
  const field = character ? 'characterReferenceIds' : 'vibeIds';
  const ids = value[field];
  const label = character ? '캐릭터 레퍼런스' : '바이브';
  const names = ids.map((id) => list.find((item) => item.id === id)?.name ?? '(없음)');
  const first = list.find((item) => item.id === ids[0]);
  return (
    <ChecklistChip
      label={{
        text: '참고',
        icon: character ? 'portrait' : 'vibe',
        usage: '캐릭터 레퍼런스나 바이브를 씁니다(V4.5 전용)',
      }}
      missing={Boolean(aid) && missing}
      before={
        <span className="segmented chain-chip-switch">
          <button
            className="active blue"
            title={`${AID_MODES[mode].title} · 누르면 ${AID_MODES[next].label}로 바꿉니다`}
            onClick={() => patch({ aidMode: next })}
          >
            {AID_MODES[mode].label}
          </button>
        </span>
      }
      section={section}
      itemId={ids.length === 1 ? ids[0] : undefined}
      value={
        !names.length
          ? '쓰지 않음'
          : names.length > 2
            ? `${names[0]} 외 ${names.length - 1}개`
            : names.join(', ')
      }
      thumb={first?.image ? pictureMedia(first.image.file) : undefined}
      items={[
        ...list.map(row),
        ...ids
          .filter((id) => !list.some((item) => item.id === id))
          .map((id) => ({ id, name: `(지워진 ${label})`, noEdit: true })),
      ]}
      checked={ids}
      multi
      onPick={(id) =>
        patch({ [field]: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] })
      }
      editSection={section}
      pickTitle={`${label} 선택`}
      empty={`라이브러리에 ${label}가 없습니다.`}
      options={
        character ? (
          // NovelAI 웹은 V4.5 인페인트에도 캐릭터 레퍼런스를 허용하지만 사용자가 써 보니 결과가 나빴다. 같은 조건의
          // 바이브는 괜찮아 막지 않고 알리기만 한다.
          props.inpaint && (
            <p className="warning-box aid-warning">
              인페인트에서는 캐릭터 레퍼런스를 쓰면 이미지가 제대로 생성되지 않을 수 있습니다. 인페인트에는
              바이브를 쓰십시오.
            </p>
          )
        ) : (
          <>
            <Toggle
              label="세기 합 맞추기 (Normalize Reference Strengths)"
              checked={value.normalizeVibes ?? true}
              onChange={(normalizeVibes) => patch({ normalizeVibes })}
            />
          </>
        )
      }
      hint={character ? '' : ''}
    />
  );
}
