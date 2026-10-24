import { useMemo, useState } from 'react';
import type { Emotion, SceneOption } from '../core/domain/types';
import { newId } from '../core/model/defaults';
import { withPromptAt } from '../core/model/mutations';
import {
  characterTagGroup,
  comboCount,
  mergeFirstSlot,
  moveScenePromptToSlot,
  optionLabel,
  sceneRepeatedTags,
} from '../core/model/sceneCombos';
import { confirmDialog } from './components/dialogStack';
import type { OptionProps } from './components/SceneOptionRows';

export type SceneSlotsChange = Partial<Pick<Emotion, 'slots' | 'prompt' | 'extraPrompts'>>;

const newOption = (): SceneOption => ({
  id: newId(),
  prompt: '',
  characterPrompts: [],
  enabled: true,
});

export function useSceneSlots(props: {
  emotion: Emotion;
  names: string[];
  foldable?: boolean;
  firstOnCommon?: boolean;
  onChange: (patch: SceneSlotsChange) => void;
}) {
  const { emotion, names } = props;
  const slots = emotion.slots ?? [];
  const [open, setOpen] = useState(!props.foldable);
  // 끝의 빈 칸은 저장하지 않아 화면에서만 센다.
  const [opened, setOpened] = useState(0);
  const [tab, setTab] = useState(0);
  const [openId, setOpenId] = useState<string>();
  const slotIndex = Math.min(tab, slots.length - 1);
  const used = Math.max(0, ...slots.flat().map((option) => option.characterPrompts.length));
  const characterCount = Math.max(names.length, used, opened);
  const repeated = useMemo(
    () => sceneRepeatedTags(emotion, props.firstOnCommon),
    [emotion, props.firstOnCommon],
  );

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
    setOpen(true);
    setTab(slots.length);
    setOpenId(option.id);
    save([...slots, [option]]);
  };
  const removeSlot = () => save(slots.filter((_, index) => index !== slotIndex));
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
  const addCharacter = () => setOpened(characterCount + 1);
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

  return {
    slots,
    slotIndex,
    slot: slots[slotIndex] ?? [],
    count: comboCount(emotion),
    characterCount,
    open,
    setOpen,
    setTab,
    openId,
    setOpenId,
    optionProps,
    addOption,
    addSlot,
    removeSlot,
    moveScenePrompt,
    mergeFirst,
    addCharacter,
    removeCharacter,
  };
}
