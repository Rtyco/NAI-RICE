import type { AidMode, CharacterReference, Project, Vibe } from '../../core/domain/types';
import { aidItems, projectAid, projectAidMode, type AidChoice } from '../../core/model/defaults';
import { modelLabel, supportsReferenceAid } from '../../core/providers/NaiModels';
import { withRo } from '../lib/korean';
import { pictureMedia, useLibrary } from '../store';
import { ChecklistChip, type ChecklistItem } from './ChainChip';
import { Toggle } from './ui';

const AID_MODES: Record<AidMode, string> = { character: '레퍼런스', vibe: '바이브' };

export type AidValue = AidChoice & Pick<Project, 'normalizeVibes'>;

/** 캐릭터 레퍼런스와 바이브는 함께 쓰지 않는다. 방식을 바꿔도 다른 쪽에서 고른 것은 남는다. */
export function AidChip(props: {
  value: AidValue;
  onChange: (patch: Partial<AidValue>) => void;
  /** V4.5가 아니면 경고 색 */
  model?: string;
  inpaint: boolean;
}) {
  const library = useLibrary();
  const { value, onChange: patch } = props;
  const mode = projectAidMode(value);
  const aid = projectAid(library, value);
  const unsupported = Boolean(props.model && !supportsReferenceAid(props.model));
  const missing = aidItems(aid).some((item) => !item?.image) || unsupported;
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
  const switchMode = {
    title: `${withRo(AID_MODES[next])} 바꾸기`,
    run: () => patch({ aidMode: next }),
  };
  return (
    <ChecklistChip
      label={{
        text: '참고',
        icon: character ? 'portrait' : 'vibe',
        usage: 'V4.5 전용',
      }}
      iconAction={switchMode}
      missing={Boolean(aid) && missing}
      before={
        <span className="segmented chain-chip-switch">
          <button className="active blue" title={switchMode.title} onClick={switchMode.run}>
            {AID_MODES[mode]}
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
        <>
          {unsupported ? (
            <p className="warning-box aid-warning">
              {modelLabel(props.model!)}에서는 {label}를 쓸 수 없습니다. V4.5 모델로 바꾸십시오.
            </p>
          ) : (
            // NovelAI 웹은 V4.5 인페인트에 캐릭터 레퍼런스를 허용하지만 결과가 나빴다. 바이브는 괜찮아 알리기만 한다.
            character &&
            props.inpaint && (
              <p className="warning-box aid-warning">
                인페인트에서는 캐릭터 레퍼런스를 쓰면 이미지가 제대로 생성되지 않을 수 있습니다.
                인페인트에는 바이브를 쓰십시오.
              </p>
            )
          )}
          {!character && (
            <Toggle
              label="세기 합 맞추기 (Normalize Reference Strengths)"
              checked={value.normalizeVibes ?? true}
              onChange={(normalizeVibes) => patch({ normalizeVibes })}
            />
          )}
        </>
      }
    />
  );
}
