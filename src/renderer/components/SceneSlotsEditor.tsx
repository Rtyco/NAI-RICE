import { useState } from 'react';
import type { Emotion, SceneOption } from '../../core/domain/types';
import { newId } from '../../core/model/defaults';
import { withPromptAt } from '../../core/model/mutations';
import { comboCount, MAX_COMBOS, optionLabel } from '../../core/model/sceneCombos';
import { Icon } from './Icon';
import { PromptTextarea } from './PromptTextarea';

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

function SceneOptionRow({
  option,
  names,
  characterCount,
  open,
  expand,
  patch,
  replace,
  remove,
}: {
  option: SceneOption;
  names: string[];
  characterCount: number;
  /** 빈 캐릭터 몫 칸까지 보인다. */
  open: boolean;
  expand: (open: boolean) => void;
  patch: (patch: Partial<SceneOption>) => void;
  replace: (next: SceneOption) => void;
  remove: () => void;
}) {
  const filled = Array.from({ length: characterCount }, (_, index) => index).filter((index) =>
    option.characterPrompts[index]?.trim(),
  );
  const shown = open ? Array.from({ length: characterCount }, (_, index) => index) : filled;
  return (
    <div className={`scene-option ${option.enabled ? '' : 'off'}`}>
      <div className="scene-option-head">
        <input
          type="checkbox"
          checked={option.enabled}
          title="조합에 넣기"
          onChange={(event) => patch({ enabled: event.target.checked })}
        />
        <input
          className="scene-option-name"
          value={option.name ?? ''}
          placeholder="후보 이름"
          aria-label="후보 이름"
          onChange={(event) => patch({ name: event.target.value || undefined })}
        />
        {(open || filled.length < characterCount) && (
          <button className="link-button" onClick={() => expand(!open)}>
            {open ? '캐릭터 몫 접기' : '＋ 캐릭터 몫'}
          </button>
        )}
        <button className="icon-button danger row-remove" title="후보 삭제" onClick={remove}>
          ×
        </button>
      </div>
      <PromptTextarea
        rows={1}
        value={option.prompt}
        aria-label="후보 프롬프트"
        placeholder="씬 프롬프트 자리에 붙음"
        onChange={(prompt) => patch({ prompt })}
      />
      {shown.length > 0 && (
        <div className="scene-option-chars">
          {shown.map((index) => (
            <div className="emotion-extra-prompt" key={index}>
              <span>{names[index] ?? `캐릭터 ${index + 1}`}</span>
              <PromptTextarea
                rows={1}
                value={option.characterPrompts[index] ?? ''}
                aria-label={`${names[index] ?? `캐릭터 ${index + 1}`} 몫`}
                placeholder="이 캐릭터 프롬프트에 붙음"
                onChange={(value) => {
                  expand(true);
                  replace({
                    ...option,
                    characterPrompts: withPromptAt(option.characterPrompts, index, value),
                  });
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** SDStudio 조합 칸. 씬 모음은 여러 작업이 함께 써서 캐릭터 몫은 순서로 저장된다. */
export function SceneSlotsEditor(props: {
  emotion: Emotion;
  /** 작업의 캐릭터 이름. 라이브러리에서는 비었다. */
  names: string[];
  /** 접힌 한 줄로 시작한다. */
  foldable?: boolean;
  onChange: (patch: Pick<Emotion, 'slots'>) => void;
}) {
  const { emotion, names } = props;
  const slots = emotion.slots ?? [];
  const [open, setOpen] = useState(!props.foldable);
  // 끝의 빈 칸은 저장하지 않아 화면에서만 센다.
  const [opened, setOpened] = useState(0);
  // 펼친 후보는 고치는 중에 몫을 비워도 그 칸이 남는다.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const expand = (id: string, open = true) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  const used = Math.max(0, ...slots.flat().map((option) => option.characterPrompts.length));
  const characterCount = Math.max(names.length, used, opened);
  const count = comboCount(emotion);
  const total = <b>조합 {count > MAX_COMBOS ? `${MAX_COMBOS}개 넘음` : `${count}개`}</b>;

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
      <button
        className="scene-slots-add"
        onClick={() => {
          setOpen(true);
          save([[newOption()]]);
        }}
      >
        ＋ 조합 칸
      </button>
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
          onClick={() => {
            setOpened(characterCount + 1);
            setExpanded(new Set(slots.flat().map((option) => option.id)));
          }}
        >
          ＋ 캐릭터
        </button>
      </div>
      {slots.map((slot, slotIndex) => (
        <section className="scene-slot" key={slotIndex}>
          <div className="scene-slot-head">
            <b>칸 {slotIndex + 1}</b>
            {enabledCount(slot) ? (
              <small>
                켜짐 {enabledCount(slot)}/{slot.length}
              </small>
            ) : (
              <em className="scene-slot-empty">켜진 후보가 없어 생성되지 않음</em>
            )}
            <button
              className="icon-button danger row-remove"
              title="칸 삭제"
              onClick={() => save(slots.filter((_, index) => index !== slotIndex))}
            >
              ×
            </button>
          </div>
          {slot.map((option) => (
            <SceneOptionRow
              key={option.id}
              option={option}
              names={names}
              characterCount={characterCount}
              open={expanded.has(option.id)}
              expand={(open) => expand(option.id, open)}
              patch={(patch) => patchOption(slotIndex, option.id, patch)}
              replace={(next) => setOption(slotIndex, next)}
              remove={() =>
                save(
                  slots.map((item, index) =>
                    index === slotIndex ? item.filter((entry) => entry.id !== option.id) : item,
                  ),
                )
              }
            />
          ))}
          <button
            className="link-button scene-slot-add"
            onClick={() =>
              save(
                slots.map((item, index) => (index === slotIndex ? [...item, newOption()] : item)),
              )
            }
          >
            ＋ 후보
          </button>
        </section>
      ))}
      <button className="scene-slots-add" onClick={() => save([...slots, [newOption()]])}>
        ＋ 칸
      </button>
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
