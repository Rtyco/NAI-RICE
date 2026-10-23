import { useState } from 'react';
import type { GenerationSummary } from '../../core/domain/types';
import { patchItem, updateEmotion } from '../../core/model/mutations';
import { DEFAULT_GENERATION_SETTINGS } from '../../core/model/defaults';
import { moodLabel, sceneMood, suggestMood } from '../../core/providers/NaiAugment';
import { estimateJobAnlas } from '../../core/providers/NaiCost';
import { directorToolSize, runDirectorTool } from '../actions';
import { projectMedia, updateLibrary, useLibrary, useStore } from '../store';
import { Modal } from './Dialogs';
import { MoodSelect, StrengthSelect } from './MoodFields';
import { PromptTextarea } from './PromptTextarea';
import { NumberField, Toggle } from './ui';

type Row = { checked: boolean; mood: string; defry: number };

const FREE_PIXELS = 1024 * 1024;

/** 대표 이미지 한 장에 씬마다 표정을 적용한다. 고른 표정·강도는 씬 모음에 저장된다. */
export function SceneSetDialog(props: {
  projectId: string;
  record: GenerationSummary;
  close: () => void;
}) {
  const library = useLibrary();
  const token = useStore((state) => state.token);
  const project = library.projects.find((item) => item.id === props.projectId);
  const set = library.emotionSets.find((item) => item.id === project?.emotionSetId);
  const emotions = set?.emotions ?? [];
  const excluded = new Set(project?.excludedEmotionIds ?? []);
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      emotions.map((emotion) => {
        const mood = sceneMood(emotion) ?? '';
        return [
          emotion.id,
          {
            checked:
              Boolean(mood) && emotion.id !== props.record.emotionId && !excluded.has(emotion.id),
            mood,
            defry: emotion.augmentDefry ?? 0,
          },
        ];
      }),
    ),
  );
  const [toolPrompt, setToolPrompt] = useState('');
  const [shrink, setShrink] = useState(true);
  const [count, setCount] = useState(1);
  const patchRow = (id: string, value: Partial<Row>) =>
    setRows((current) => ({ ...current, [id]: { ...current[id], ...value } }));
  const targets = emotions.filter((emotion) => rows[emotion.id]?.checked && rows[emotion.id].mood);
  const allChecked = emotions.every(
    (emotion) => !rows[emotion.id]?.mood || rows[emotion.id].checked,
  );
  const oversized = props.record.width * props.record.height > FREE_PIXELS;
  const size = directorToolSize(props.record, shrink);
  const estimate =
    targets.length *
    count *
    estimateJobAnlas(
      {
        kind: 'augment',
        tool: 'emotion',
        settings: DEFAULT_GENERATION_SETTINGS,
        canvasWidth: size.width,
        canvasHeight: size.height,
      },
      token,
    );

  const submit = () => {
    if (!set) return;
    updateLibrary((current) =>
      patchItem(current, 'emotionSets', set.id, (item) =>
        targets.reduce(
          (next, emotion) =>
            updateEmotion(next, emotion.id, {
              augmentMood:
                rows[emotion.id].mood === suggestMood(emotion.name) && !emotion.augmentMood
                  ? undefined
                  : rows[emotion.id].mood,
              augmentDefry: rows[emotion.id].defry || undefined,
            }),
          item,
        ),
      ),
    );
    props.close();
    void runDirectorTool(
      props.projectId,
      [
        {
          record: props.record,
          targets: targets.map((emotion) => ({
            emotionId: emotion.id,
            emotionName: emotion.name,
            emotionPrompt: emotion.prompt,
            emotionNegative: emotion.negative,
            mood: rows[emotion.id].mood,
            defry: rows[emotion.id].defry,
          })),
        },
      ],
      { tool: 'emotion', mood: 'neutral', toolPrompt, defry: 0, shrink, count },
    );
  };

  return (
    <Modal
      title="이 이미지로 씬 표정 만들기"
      onClose={props.close}
      wide
      footer={
        <>
          <span
            className={`hint ${estimate ? 'cost-warn' : ''}`}
            title="Emotion 툴은 무료 면적 안에서 Anlas가 들지 않습니다. 예상값이며 실제 차감량과 다를 수 있습니다."
          >
            {estimate ? `예상 약 ${estimate.toLocaleString()} Anlas` : '예상 0 Anlas'}
          </span>
          <button onClick={props.close}>취소</button>
          <button className="accent" disabled={!targets.length} onClick={submit}>
            {targets.length}개 씬 × {count}장 만들기
          </button>
        </>
      }
    >
      <div className="scene-set">
        <figure className="scene-set-source">
          <img
            src={projectMedia(props.projectId, props.record.thumbFile ?? props.record.file)}
            alt=""
          />
          <figcaption>
            {props.record.emotionName} · {props.record.width}×{props.record.height}
          </figcaption>
        </figure>
        <div className="scene-set-body">
          <div className="mood-table">
            <div className="mood-table-row head">
              <input
                type="checkbox"
                checked={allChecked}
                aria-label="모두 고르기"
                onChange={() =>
                  emotions.forEach((emotion) =>
                    patchRow(emotion.id, {
                      checked: !allChecked && Boolean(rows[emotion.id]?.mood),
                    }),
                  )
                }
              />
              <span>씬</span>
              <span>표정</span>
              <span>강도</span>
            </div>
            {emotions.map((emotion) => {
              const row = rows[emotion.id];
              const suggested = suggestMood(emotion.name);
              return (
                <div className="mood-table-row" key={emotion.id}>
                  <input
                    type="checkbox"
                    checked={row.checked}
                    disabled={!row.mood}
                    onChange={(event) => patchRow(emotion.id, { checked: event.target.checked })}
                  />
                  <span className="mood-scene">
                    {emotion.name || '(이름 없음)'}
                    {emotion.id === props.record.emotionId && <em> · 이 이미지의 씬</em>}
                  </span>
                  <MoodSelect
                    value={row.mood}
                    label={`${emotion.name} 표정`}
                    emptyLabel={suggested ? `추천: ${moodLabel(suggested)}` : '표정 선택'}
                    onChange={(mood) =>
                      patchRow(emotion.id, {
                        mood: mood || suggested || '',
                        checked: Boolean(mood || suggested),
                      })
                    }
                  />
                  <StrengthSelect
                    value={row.defry}
                    label={`${emotion.name} 강도`}
                    onChange={(defry) => patchRow(emotion.id, { defry })}
                  />
                </div>
              );
            })}
          </div>
          <div className="scene-set-options">
            <label className="prompt-field director-prompt">
              <span>프롬프트 (선택, 모든 씬에 붙음)</span>
              <PromptTextarea
                rows={2}
                value={toolPrompt}
                placeholder="예: blush"
                onChange={setToolPrompt}
              />
            </label>
            <NumberField
              label="씬마다 장수"
              value={count}
              min={1}
              max={4}
              integer
              onChange={setCount}
            />
          </div>
          {oversized && (
            <Toggle
              label="무료 면적(1024×1024)을 넘으니 비율을 지켜 줄여 보내기"
              checked={shrink}
              onChange={setShrink}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
