import { useEffect, useMemo, useState } from 'react';
import type { Emotion, SceneOption } from '../core/domain/types';
import { newId } from '../core/model/defaults';
import { withPromptAt } from '../core/model/mutations';
import {
  characterTagGroup,
  comboCount,
  defaultOpenIds,
  mergeFirstSlot,
  moveScenePromptToSlot,
  optionLabel,
  optionWithText,
  sceneRepeatedTags,
} from '../core/model/sceneCombos';
import { confirmDialog } from './components/dialogStack';
import type { OptionProps } from './components/SceneOptionRows';
import { useFind } from './find';
import { useStore } from './store';

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
  const [tab, setTabState] = useState(0);
  const rule = useStore((state) => state.library?.settings.layout.comboOptions ?? 'first');
  // 비면 칸을 연 그대로(설정의 기본 펼침). 하나라도 접거나 펴면 그때부터 후보마다 기억한다.
  // 씬을 넘기면 같은 편집기가 그대로 남아 씬 ID로 구분한다.
  const [picked, setPicked] = useState<{ emotionId: string; ids: Set<string> }>();
  const chosen = picked?.emotionId === emotion.id ? picked.ids : undefined;
  const setChosen = (ids: Set<string> | undefined) =>
    setPicked(ids && { emotionId: emotion.id, ids });
  const slotIndex = Math.min(tab, slots.length - 1);
  const currentSlot = slots[slotIndex] ?? [];
  const openIds = chosen ?? defaultOpenIds(currentSlot, rule);
  const setTab = (index: number) => {
    setTabState(index);
    setChosen(undefined);
  };
  const openOnly = (ids: string[]) => setChosen(new Set(ids));
  // 찾기 결과로 옮겨 오면 그 후보가 그려져야 입력칸이 찾은 곳까지 스크롤한다.
  const reveal = useFind((state) => state.reveal);
  const revealAt = reveal === undefined ? undefined : optionWithText(slots, reveal);
  const revealSlot = revealAt?.slot;
  const revealId = revealAt?.id;
  useEffect(() => {
    if (revealSlot === undefined || revealId === undefined) return;
    setOpen(true);
    setTabState(revealSlot);
    setPicked({ emotionId: emotion.id, ids: new Set([revealId]) });
  }, [revealSlot, revealId, emotion.id]);
  const toggleOption = (id: string) => {
    const next = new Set(openIds);
    if (!next.delete(id)) next.add(id);
    setChosen(next);
  };
  const allOpen = currentSlot.length > 0 && currentSlot.every((option) => openIds.has(option.id));
  const setAllOpen = (open: boolean) =>
    setChosen(new Set(open ? currentSlot.map((option) => option.id) : []));
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
    setChosen(new Set([...openIds, option.id]));
    saveSlot((item) => [...item, option]);
  };
  const addSlot = () => {
    const option = newOption();
    setOpen(true);
    setTabState(slots.length);
    openOnly([option.id]);
    save([...slots, [option]]);
  };
  const removeSlot = () => save(slots.filter((_, index) => index !== slotIndex));
  const moveScenePrompt = () => {
    const id = newId();
    setOpen(true);
    setTabState(0);
    openOnly([id]);
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
    slot: currentSlot,
    count: comboCount(emotion),
    characterCount,
    open,
    setOpen,
    setTab,
    openIds,
    toggleOption,
    allOpen,
    setAllOpen,
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
