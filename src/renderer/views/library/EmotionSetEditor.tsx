import { useState } from 'react';
import type { Emotion, EmotionSet } from '../../../core/domain/types';
import { comboCount, comboPrompts, sceneCombos } from '../../../core/model/sceneCombos';
import { stripComments } from '../../../core/prompts/PromptPieces';
import {
  addEmotion,
  mergeEmotions,
  moveEmotion,
  patchItem,
  removeEmotion,
  updateEmotion,
  withExtraPrompt,
} from '../../../core/model/mutations';
import { Card, Menu } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { toast, updateLibrary, useLibrary } from '../../store';
import { PromptTextarea } from '../../components/PromptTextarea';
import { ExpandTextButton } from '../../components/TextEditorDialog';
import { SceneSlotsEditor } from '../../components/SceneSlotsEditor';
import { revealRow } from '../../components/revealRow';
import { SceneSearch } from '../../components/SceneSearch';
import { matchesScene } from '../../sceneSearch';

/** 접힌 줄에 보이는 요약. 펼치지 않아도 어떤 씬인지 알 수 있을 만큼만. */
function EmotionSummary({ emotion, onOpen }: { emotion: Emotion; onOpen: () => void }) {
  // SD Studio에서 가져온 씬은 프롬프트가 조합 칸에만 있기도 해 첫 조합으로 보여 준다.
  const first = comboPrompts(emotion, sceneCombos(emotion, 1)[0]).prompt;
  const prompt = stripComments(first).replace(/s+/g, ' ').trim();
  const extras = emotion.extraPrompts?.filter((text) => text.trim()).length ?? 0;
  const combos = comboCount(emotion);
  return (
    <button className="emotion-summary" onClick={onOpen}>
      <span className={prompt ? '' : 'empty'}>{prompt || '프롬프트 없음'}</span>
      {extras > 0 && <small>캐릭터 +{extras}</small>}
      {emotion.negative?.trim() && <small>네거티브</small>}
      {combos > 1 && <small>조합 {combos}</small>}
    </button>
  );
}

function EmotionRow({
  emotion,
  index,
  last,
  collapsed,
  opened,
  toggle,
  openExtra,
  save,
}: {
  emotion: Emotion;
  index: number;
  last: boolean;
  collapsed: boolean;
  opened: number;
  toggle: (open?: boolean) => void;
  openExtra: () => void;
  save: (recipe: (item: EmotionSet) => EmotionSet) => void;
}) {
  const patch = (value: Partial<Omit<Emotion, 'id'>>) =>
    save((item) => updateEmotion(item, emotion.id, value));
  return (
    <div
      className={`piece-row emotion-row ${collapsed ? 'collapsed' : ''}`}
      data-row-id={emotion.id}
    >
      <div className="piece-row-head">
        <button
          className="icon-button emotion-fold"
          aria-expanded={!collapsed}
          title={collapsed ? '펼치기' : '접기'}
          onClick={() => toggle()}
        >
          <Icon name="chevron" size={14} className="section-chevron" />
        </button>
        <span className="row-index">{index + 1}</span>
        <input
          className="emotion-name-input"
          value={emotion.name}
          aria-label="씬 이름"
          onChange={(event) => patch({ name: event.target.value })}
        />
        {collapsed && <EmotionSummary emotion={emotion} onOpen={() => toggle(true)} />}
        <div className="row-actions">
          <button
            className="icon-button"
            title="다음 캐릭터의 씬 프롬프트 칸 추가"
            onClick={() => {
              toggle(true);
              openExtra();
            }}
          >
            ＋
          </button>
          <ExpandTextButton
            title={`${emotion.name || '씬'} 프롬프트`}
            value={emotion.prompt}
            placeholder="씬 프롬프트"
            onApply={(prompt) => patch({ prompt })}
          />
          <button
            className="icon-button"
            disabled={index === 0}
            title="위로"
            onClick={() => save((item) => moveEmotion(item, emotion.id, index - 1))}
          >
            ↑
          </button>
          <button
            className="icon-button"
            disabled={last}
            title="아래로"
            onClick={() => save((item) => moveEmotion(item, emotion.id, index + 1))}
          >
            ↓
          </button>
          <button
            className="icon-button danger"
            title="삭제"
            onClick={() => save((item) => removeEmotion(item, emotion.id))}
          >
            ×
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="emotion-prompts">
          <PromptTextarea
            rows={3}
            value={emotion.prompt}
            aria-label={`${emotion.name} 프롬프트`}
            placeholder="씬 프롬프트"
            onChange={(prompt) => patch({ prompt })}
          />
          {Array.from(
            { length: Math.max(emotion.extraPrompts?.length ?? 0, opened) },
            (_, extra) => (
              <div className="emotion-extra-prompt" key={extra}>
                <span>캐릭터 {extra + 2}</span>
                <PromptTextarea
                  rows={2}
                  value={emotion.extraPrompts?.[extra] ?? ''}
                  aria-label={`${emotion.name} 캐릭터 ${extra + 2} 프롬프트`}
                  placeholder="비워 두면 이 캐릭터에는 붙이지 않습니다"
                  onChange={(prompt) => patch(withExtraPrompt(emotion, extra, prompt))}
                />
              </div>
            ),
          )}
          <div className="emotion-extra-prompt negative-field">
            <span>네거티브</span>
            <PromptTextarea
              rows={2}
              value={emotion.negative ?? ''}
              aria-label={`${emotion.name} 씬 네거티브`}
              placeholder="이 씬에서만 뺄 태그"
              onChange={(negative) => patch({ negative: negative || undefined })}
            />
          </div>
          <SceneSlotsEditor emotion={emotion} names={[]} foldable onChange={patch} />
        </div>
      )}
    </div>
  );
}

export function EmotionSetEditor({ set }: { set: EmotionSet }) {
  const library = useLibrary();
  const save = (recipe: (item: EmotionSet) => EmotionSet) =>
    updateLibrary((current) => patchItem(current, 'emotionSets', set.id, recipe));
  const others = library.emotionSets.filter((item) => item.id !== set.id);
  // 끝의 빈 칸은 저장하지 않아 화면에서만 센다.
  const [opened, setOpened] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (id: string, open = collapsed.has(id)) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });
  const visible = set.emotions.filter((emotion) => matchesScene(emotion, query));
  const allOpen = visible.every((emotion) => !collapsed.has(emotion.id));
  const add = () => {
    // 새 씬 이름이 검색어와 맞지 않으면 보이지 않는다.
    setQuery('');
    let id = '';
    save((item) => {
      const next = addEmotion(item);
      id = next.emotions.at(-1)!.id;
      return next;
    });
    revealRow(id);
  };
  return (
    <Card
      sticky
      title={`씬 (${set.emotions.length})`}
      actions={
        <>
          <SceneSearch
            value={query}
            found={visible.length}
            total={set.emotions.length}
            onChange={setQuery}
          />
          <button
            disabled={!visible.length}
            onClick={() =>
              setCollapsed(allOpen ? new Set(visible.map((emotion) => emotion.id)) : new Set())
            }
          >
            {allOpen ? '모두 접기' : '모두 펼치기'}
          </button>
          {others.length > 0 && (
            <Menu
              label="다른 모음에서 가져오기"
              items={others.map((other) => ({
                label: `${other.name} (${other.emotions.length})`,
                onSelect: () => {
                  save((item) => mergeEmotions(item, other.emotions));
                  toast(`${other.name}의 씬을 병합했습니다. 같은 이름은 덮어썼습니다.`);
                },
              }))}
            />
          )}
          <button className="accent" onClick={add}>
            ＋ 씬 추가
          </button>
        </>
      }
    >
      <div className="emotion-table">
        {set.emotions.map(
          (emotion, index) =>
            matchesScene(emotion, query) && (
              <EmotionRow
                key={emotion.id}
                emotion={emotion}
                index={index}
                last={index === set.emotions.length - 1}
                collapsed={collapsed.has(emotion.id)}
                opened={opened[emotion.id] ?? 0}
                toggle={(open) => toggle(emotion.id, open)}
                openExtra={() =>
                  setOpened((current) => ({
                    ...current,
                    [emotion.id]:
                      Math.max(emotion.extraPrompts?.length ?? 0, current[emotion.id] ?? 0) + 1,
                  }))
                }
                save={save}
              />
            ),
        )}
        {!set.emotions.length && <p className="hint">씬이 없습니다.</p>}
      </div>
    </Card>
  );
}
