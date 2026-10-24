import type { KeyboardEvent } from 'react';
import type { Emotion, SceneOption } from '../../core/domain/types';
import {
  hasFixedScenePrompt,
  MAX_COMBOS,
  mergeableFirstSlot,
  optionLabel,
} from '../../core/model/sceneCombos';
import { useSceneSlots, type SceneSlotsChange } from '../useSceneSlots';
import { Icon } from './Icon';
import { SceneOptionItem, SceneOptionTable } from './SceneOptionRows';

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
  onChange: (patch: SceneSlotsChange) => void;
}) {
  const { emotion, names } = props;
  const state = useSceneSlots(props);
  const { slots, slot, slotIndex, count, characterCount } = state;
  const total = <b>조합 {count > MAX_COMBOS ? `${MAX_COMBOS}개 넘음` : `${count}개`}</b>;
  const moveButton = (className?: string) =>
    hasFixedScenePrompt(emotion) && (
      <button
        className={className}
        title="씬 프롬프트를 조합 칸 1로 옮기기"
        onClick={state.moveScenePrompt}
      >
        씬 프롬프트 → 칸 1
      </button>
    );

  if (!slots.length)
    return (
      <div className="scene-slots-start">
        <button onClick={state.addSlot}>＋ 조합 칸</button>
        {moveButton()}
      </div>
    );

  if (!state.open)
    return (
      <button
        className="scene-slots-toggle"
        aria-expanded={false}
        onClick={() => state.setOpen(true)}
      >
        <Icon name="chevron" size={12} className="section-chevron" />
        {total}
        <span>{slotsSummary(slots)}</span>
      </button>
    );

  return (
    <div className="scene-slots">
      <div className="scene-slots-head">
        {props.foldable ? (
          <button className="scene-slots-toggle" aria-expanded onClick={() => state.setOpen(false)}>
            <Icon name="chevron" size={12} className="section-chevron" />
            {total}
          </button>
        ) : (
          total
        )}
        {slots.length > 1 && (
          <span className="scene-slots-formula">= {slots.map(enabledCount).join(' × ')}</span>
        )}
        <button className="link-button" title="다음 캐릭터 몫 칸 추가" onClick={state.addCharacter}>
          ＋ 캐릭터
        </button>
        {characterCount > names.length && (
          <button
            className="link-button"
            title={`캐릭터 ${characterCount} 몫 칸 삭제`}
            onClick={() => void state.removeCharacter()}
          >
            － 캐릭터
          </button>
        )}
        {moveButton('link-button')}
      </div>
      <div className="scene-slot-tabs" role="tablist" aria-label="조합 칸">
        {slots.map((item, index) => (
          <button
            key={index}
            role="tab"
            aria-selected={index === slotIndex}
            className={enabledCount(item) ? '' : 'empty'}
            title={`칸 ${index + 1}`}
            onClick={() => state.setTab(index)}
          >
            {index + 1}
            <small>{enabledCount(item)}</small>
          </button>
        ))}
        <button className="scene-slot-tab-add" title="칸 추가" onClick={state.addSlot}>
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
              onClick={state.mergeFirst}
            >
              씬 프롬프트로 합치기
            </button>
          )}
          <button
            className="icon-button danger row-remove"
            title="칸 삭제"
            onClick={state.removeSlot}
          >
            ×
          </button>
        </div>
        {props.foldable ? (
          <SceneOptionTable
            slot={slot}
            names={names}
            characterCount={characterCount}
            option={state.optionProps}
          />
        ) : (
          <div className="scene-option-list" onKeyDown={moveBetweenOptions}>
            {slot.map((option) => (
              <SceneOptionItem
                key={option.id}
                {...state.optionProps(option)}
                open={state.openId === option.id}
                toggle={() => state.setOpenId(state.openId === option.id ? undefined : option.id)}
              />
            ))}
          </div>
        )}
        <button className="link-button scene-slot-add" onClick={state.addOption}>
          ＋ 후보
        </button>
      </section>
    </div>
  );
}
