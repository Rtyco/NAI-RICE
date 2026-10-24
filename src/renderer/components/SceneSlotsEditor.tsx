import { useMemo, useState, type KeyboardEvent } from 'react';
import type { Emotion, SceneOption } from '../../core/domain/types';
import { newId } from '../../core/model/defaults';
import { withPromptAt } from '../../core/model/mutations';
import {
  characterTagGroup,
  comboCount,
  hasFixedScenePrompt,
  MAX_COMBOS,
  mergeableFirstSlot,
  mergeFirstSlot,
  moveScenePromptToSlot,
  optionLabel,
  sceneRepeatedTags,
} from '../../core/model/sceneCombos';
import { confirmDialog } from './dialogStack';
import { Icon } from './Icon';
import { PromptTextarea } from './PromptTextarea';
import { ExpandTextButton } from './TextEditorDialog';

const newOption = (): SceneOption => ({
  id: newId(),
  prompt: '',
  characterPrompts: [],
  enabled: true,
});

const enabledCount = (slot: SceneOption[]) => slot.filter((option) => option.enabled).length;

const slotsSummary = (slots: SceneOption[][]) =>
  slots
    .map(
      (slot) =>
        slot
          .filter((option) => option.enabled)
          .map(optionLabel)
          .join(' · ') || '(없음)',
    )
    .join('  ×  ');

type OptionProps = {
  option: SceneOption;
  /** 크게 편집 창 제목 앞부분 */
  title: string;
  names: string[];
  characterCount: number;
  /** 씬 자리(없음) 또는 캐릭터 몫에서 경고할 겹친 태그 */
  repeated: (character?: number) => ReadonlySet<string>;
  patch: (patch: Partial<SceneOption>) => void;
  setCharacterPrompt: (index: number, value: string) => void;
  remove: () => void;
};

const characterName = (names: string[], index: number) => names[index] ?? `캐릭터 ${index + 1}`;

function PromptCell(props: {
  title: string;
  label: string;
  value: string;
  placeholder?: string;
  repeated: ReadonlySet<string>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="prompt-cell">
      <PromptTextarea
        rows={2}
        value={props.value}
        aria-label={props.label}
        placeholder={props.placeholder}
        repeated={props.repeated}
        onChange={props.onChange}
      />
      <ExpandTextButton
        title={props.title}
        value={props.value}
        placeholder={props.placeholder}
        onApply={props.onChange}
      />
    </div>
  );
}

function OptionCheck({ option, patch }: Pick<OptionProps, 'option' | 'patch'>) {
  return (
    <input
      type="checkbox"
      checked={option.enabled}
      title="조합에 넣기"
      onChange={(event) => patch({ enabled: event.target.checked })}
    />
  );
}

function OptionName({ option, patch }: Pick<OptionProps, 'option' | 'patch'>) {
  return (
    <input
      className="scene-option-name"
      value={option.name ?? ''}
      placeholder="후보 이름"
      aria-label="후보 이름"
      onChange={(event) => patch({ name: event.target.value || undefined })}
    />
  );
}

function RemoveOption({ remove }: Pick<OptionProps, 'remove'>) {
  return (
    <button className="icon-button danger row-remove" title="후보 삭제" onClick={remove}>
      ×
    </button>
  );
}

/** 한 번에 하나만 펼쳐, 접힌 후보는 한 줄 요약이다. */
function SceneOptionItem(props: OptionProps & { open: boolean; toggle: () => void }) {
  const { option, names, characterCount, open } = props;
  const filled = option.characterPrompts.filter((prompt) => prompt.trim()).length;
  const name = option.name?.trim();
  return (
    <div className={`scene-option ${option.enabled ? '' : 'off'} ${open ? 'open' : ''}`}>
      <div className="scene-option-head">
        <OptionCheck option={option} patch={props.patch} />
        <button
          className="scene-option-toggle"
          aria-expanded={open}
          title={open ? '접기' : '펼치기'}
          onClick={props.toggle}
        >
          <Icon name="chevron" size={12} className="section-chevron" />
          {!open && (
            <>
              {name && <b>{name}</b>}
              <span>{option.prompt.trim() || (name ? '' : '(빈 후보)')}</span>
              {filled > 0 && <small>+{filled}</small>}
            </>
          )}
        </button>
        {open && <OptionName option={option} patch={props.patch} />}
        <RemoveOption remove={props.remove} />
      </div>
      {open && (
        <>
          <PromptCell
            title={`${props.title} · 씬 자리`}
            label="후보 프롬프트"
            value={option.prompt}
            placeholder="씬 프롬프트 자리에 붙음"
            repeated={props.repeated()}
            onChange={(prompt) => props.patch({ prompt })}
          />
          {characterCount > 0 && (
            <div className="scene-option-chars">
              {Array.from({ length: characterCount }, (_, index) => (
                <div className="emotion-extra-prompt" key={index}>
                  <span>{characterName(names, index)}</span>
                  <PromptCell
                    title={`${props.title} · ${characterName(names, index)}`}
                    label={`${characterName(names, index)} 몫`}
                    value={option.characterPrompts[index] ?? ''}
                    placeholder="이 캐릭터 프롬프트에 붙음"
                    repeated={props.repeated(index)}
                    onChange={(value) => props.setCharacterPrompt(index, value)}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 넓은 화면: 후보는 행, 씬 자리와 캐릭터 몫은 열. */
function SceneOptionTable(props: {
  slot: SceneOption[];
  names: string[];
  characterCount: number;
  option: (option: SceneOption) => OptionProps;
}) {
  const characters = Array.from({ length: props.characterCount }, (_, index) => index);
  return (
    <div className="scene-option-table-wrap">
      <table className="scene-option-table">
        <colgroup>
          <col className="check" />
          <col className="name" />
          <col />
          {characters.map((index) => (
            <col key={index} />
          ))}
          <col className="remove" />
        </colgroup>
        <thead>
          <tr>
            <th />
            <th>이름</th>
            <th>씬 자리</th>
            {characters.map((index) => (
              <th key={index}>{characterName(props.names, index)}</th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {props.slot.map((option) => {
            const row = props.option(option);
            return (
              <tr key={option.id} className={option.enabled ? '' : 'off'}>
                <td>
                  <OptionCheck option={option} patch={row.patch} />
                </td>
                <td>
                  <OptionName option={option} patch={row.patch} />
                </td>
                <td>
                  <PromptCell
                    title={`${row.title} · 씬 자리`}
                    label="후보 프롬프트"
                    value={option.prompt}
                    repeated={row.repeated()}
                    onChange={(prompt) => row.patch({ prompt })}
                  />
                </td>
                {characters.map((index) => (
                  <td key={index}>
                    <PromptCell
                      title={`${row.title} · ${characterName(props.names, index)}`}
                      label={`${characterName(props.names, index)} 몫`}
                      value={option.characterPrompts[index] ?? ''}
                      repeated={row.repeated(index)}
                      onChange={(value) => row.setCharacterPrompt(index, value)}
                    />
                  </td>
                ))}
                <td>
                  <RemoveOption remove={row.remove} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** ↑↓로 접힌 후보 사이를 옮긴다. */
function moveBetweenOptions(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const target = event.target as HTMLElement;
  if (!target.matches('.scene-option-toggle')) return;
  const toggles = [...event.currentTarget.querySelectorAll<HTMLElement>('.scene-option-toggle')];
  const next = toggles[toggles.indexOf(target) + (event.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

/** SDStudio 조합 칸. 씬 모음은 여러 작업이 함께 써서 캐릭터 몫은 순서로 저장된다. */
export function SceneSlotsEditor(props: {
  emotion: Emotion;
  /** 작업의 캐릭터 이름. 라이브러리에서는 비었다. */
  names: string[];
  /** 접힌 한 줄로 시작하고, 후보를 표로 보인다. */
  foldable?: boolean;
  /** 씬 프롬프트가 첫 캐릭터가 아니라 공통 쪽에 붙을 때 */
  firstOnCommon?: boolean;
  onChange: (patch: Partial<Pick<Emotion, 'slots' | 'prompt' | 'extraPrompts'>>) => void;
}) {
  const { emotion, names } = props;
  const slots = emotion.slots ?? [];
  const [open, setOpen] = useState(!props.foldable);
  // 끝의 빈 칸은 저장하지 않아 화면에서만 센다.
  const [opened, setOpened] = useState(0);
  const [tab, setTab] = useState(0);
  const [openId, setOpenId] = useState<string>();
  const slotIndex = Math.min(tab, slots.length - 1);
  const slot = slots[slotIndex] ?? [];
  const used = Math.max(0, ...slots.flat().map((option) => option.characterPrompts.length));
  const characterCount = Math.max(names.length, used, opened);
  const count = comboCount(emotion);
  const repeated = useMemo(
    () => sceneRepeatedTags(emotion, props.firstOnCommon),
    [emotion, props.firstOnCommon],
  );
  const total = <b>조합 {count > MAX_COMBOS ? `${MAX_COMBOS}개 넘음` : `${count}개`}</b>;

  const save = (next: SceneOption[][]) => props.onChange({ slots: next.length ? next : undefined });
  const saveSlot = (recipe: (slot: SceneOption[]) => SceneOption[]) =>
    save(slots.map((item, index) => (index === slotIndex ? recipe(item) : item)));
  const optionProps = (option: SceneOption): OptionProps => ({
    option,
    title: `${emotion.name} · 칸 ${slotIndex + 1} · ${optionLabel(option)}`,
    names,
    characterCount,
    repeated: (character) =>
      repeated(character === undefined ? 0 : characterTagGroup(character, !!props.firstOnCommon)),
    patch: (patch) =>
      saveSlot((item) =>
        item.map((entry) => (entry.id === option.id ? { ...entry, ...patch } : entry)),
      ),
    setCharacterPrompt: (index, value) =>
      saveSlot((item) =>
        item.map((entry) =>
          entry.id === option.id
            ? { ...entry, characterPrompts: withPromptAt(entry.characterPrompts, index, value) }
            : entry,
        ),
      ),
    remove: () => saveSlot((item) => item.filter((entry) => entry.id !== option.id)),
  });
  const addOption = () => {
    const option = newOption();
    setOpenId(option.id);
    saveSlot((item) => [...item, option]);
  };
  const addSlot = () => {
    const option = newOption();
    setTab(slots.length);
    setOpenId(option.id);
    save([...slots, [option]]);
  };
  const moveScenePrompt = () => {
    const id = newId();
    setOpen(true);
    setTab(0);
    setOpenId(id);
    props.onChange(moveScenePromptToSlot(emotion, id));
  };
  const mergeFirst = () => {
    const merged = mergeFirstSlot(emotion);
    if (merged) props.onChange(merged);
  };
  const removeCharacter = async () => {
    const index = characterCount - 1;
    const filled = slots.flat().filter((option) => option.characterPrompts[index]?.trim()).length;
    const ok =
      !filled ||
      (await confirmDialog({
        title: `캐릭터 ${index + 1} 몫 삭제`,
        message: `후보 ${filled}개의 캐릭터 ${index + 1} 몫을 지웁니다.`,
        confirmLabel: '삭제',
        danger: true,
      }));
    if (!ok) return;
    setOpened(index);
    save(
      slots.map((item) =>
        item.map((option) => ({
          ...option,
          characterPrompts: withPromptAt(option.characterPrompts, index, ''),
        })),
      ),
    );
  };

  if (!slots.length)
    return (
      <div className="scene-slots-start">
        <button
          onClick={() => {
            setOpen(true);
            addSlot();
          }}
        >
          ＋ 조합 칸
        </button>
        {hasFixedScenePrompt(emotion) && (
          <button title="씬 프롬프트를 조합 칸 1로 옮기기" onClick={moveScenePrompt}>
            씬 프롬프트 → 칸 1
          </button>
        )}
      </div>
    );

  if (!open)
    return (
      <button className="scene-slots-toggle" aria-expanded={false} onClick={() => setOpen(true)}>
        <Icon name="chevron" size={12} className="section-chevron" />
        {total}
        <span>{slotsSummary(slots)}</span>
      </button>
    );

  return (
    <div className="scene-slots">
      <div className="scene-slots-head">
        {props.foldable ? (
          <button className="scene-slots-toggle" aria-expanded onClick={() => setOpen(false)}>
            <Icon name="chevron" size={12} className="section-chevron" />
            {total}
          </button>
        ) : (
          total
        )}
        {slots.length > 1 && (
          <span className="scene-slots-formula">= {slots.map(enabledCount).join(' × ')}</span>
        )}
        <button
          className="link-button"
          title="다음 캐릭터 몫 칸 추가"
          onClick={() => setOpened(characterCount + 1)}
        >
          ＋ 캐릭터
        </button>
        {characterCount > names.length && (
          <button
            className="link-button"
            title={`캐릭터 ${characterCount} 몫 칸 삭제`}
            onClick={() => void removeCharacter()}
          >
            － 캐릭터
          </button>
        )}
        {hasFixedScenePrompt(emotion) && (
          <button
            className="link-button"
            title="씬 프롬프트를 조합 칸 1로 옮기기"
            onClick={moveScenePrompt}
          >
            씬 프롬프트 → 칸 1
          </button>
        )}
      </div>
      <div className="scene-slot-tabs" role="tablist" aria-label="조합 칸">
        {slots.map((item, index) => (
          <button
            key={index}
            role="tab"
            aria-selected={index === slotIndex}
            className={enabledCount(item) ? '' : 'empty'}
            title={`칸 ${index + 1}`}
            onClick={() => setTab(index)}
          >
            {index + 1}
            <small>{enabledCount(item)}</small>
          </button>
        ))}
        <button className="scene-slot-tab-add" title="칸 추가" onClick={addSlot}>
          ＋
        </button>
      </div>
      <section className="scene-slot" role="tabpanel">
        <div className="scene-slot-head">
          <b>칸 {slotIndex + 1}</b>
          {enabledCount(slot) ? (
            <small>
              켜짐 {enabledCount(slot)}/{slot.length}
            </small>
          ) : (
            <em className="scene-slot-empty">켜진 후보가 없어 생성되지 않음</em>
          )}
          {slotIndex === 0 && mergeableFirstSlot(emotion) && (
            <button
              className="link-button"
              title="칸 1을 씬 프롬프트에 합치기"
              onClick={mergeFirst}
            >
              씬 프롬프트로 합치기
            </button>
          )}
          <button
            className="icon-button danger row-remove"
            title="칸 삭제"
            onClick={() => save(slots.filter((_, index) => index !== slotIndex))}
          >
            ×
          </button>
        </div>
        {props.foldable ? (
          <SceneOptionTable
            slot={slot}
            names={names}
            characterCount={characterCount}
            option={optionProps}
          />
        ) : (
          <div className="scene-option-list" onKeyDown={moveBetweenOptions}>
            {slot.map((option) => (
              <SceneOptionItem
                key={option.id}
                {...optionProps(option)}
                open={openId === option.id}
                toggle={() => setOpenId(openId === option.id ? undefined : option.id)}
              />
            ))}
          </div>
        )}
        <button className="link-button scene-slot-add" onClick={addOption}>
          ＋ 후보
        </button>
      </section>
    </div>
  );
}

const SCENE_SIZES: Array<[number, number]> = [
  [832, 1216],
  [1216, 832],
  [1024, 1024],
  [1024, 1536],
  [1536, 1024],
  [1472, 1472],
];

/** SDStudio 씬 seed·해상도. 비우면 생성 설정을 따른다. */
export function SceneExtras(props: {
  emotion: Emotion;
  /** 인페인트는 캔버스 크기를 써서 크기 칸을 보이지 않는다. */
  txt2img: boolean;
  onChange: (patch: Pick<Emotion, 'seed' | 'width' | 'height'>) => void;
}) {
  const { emotion } = props;
  const sizeKey = emotion.width && emotion.height ? `${emotion.width}x${emotion.height}` : '';
  const sizes = SCENE_SIZES.map(([width, height]) => `${width}x${height}`);
  if (sizeKey && !sizes.includes(sizeKey)) sizes.push(sizeKey);
  return (
    <div className="scene-extras">
      <label className="stack-field">
        씬 seed
        <input
          type="number"
          min={0}
          max={4_294_967_295}
          value={emotion.seed ?? ''}
          placeholder="생성 설정 따름"
          onChange={(event) => {
            const value = Number(event.target.value);
            props.onChange({
              seed:
                event.target.value === '' || !Number.isInteger(value) || value < 0
                  ? undefined
                  : Math.min(value, 4_294_967_295),
            });
          }}
        />
      </label>
      {props.txt2img && (
        <label className="stack-field">
          씬 크기
          <select
            value={sizeKey}
            onChange={(event) => {
              const [width, height] = event.target.value.split('x').map(Number);
              props.onChange(
                event.target.value ? { width, height } : { width: undefined, height: undefined },
              );
            }}
          >
            <option value="">생성 설정 따름</option>
            {sizes.map((key) => (
              <option key={key} value={key}>
                {key.replace('x', ' × ')}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
