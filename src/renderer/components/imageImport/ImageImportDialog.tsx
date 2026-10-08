import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { type ImageImportData } from '../../../core/metadata/NaiMetadata';
import { resolveProject } from '../../../core/model/defaults';
import {
  detectNaiTags,
  modelLabel,
  QUALITY_LEVEL_LABELS,
  UC_PRESET_LABELS,
} from '../../../core/providers/NaiModels';
import { applyImageImport } from '../../../core/importers/ImageImport';
import {
  currentProject,
  openLibrary,
  openProject,
  run,
  setPendingReference,
  toast,
  updateLibrary,
  useLibrary,
  useStore,
} from '../../store';
import { Modal } from '../Dialogs';

export type DroppedImage = { name: string; dataUrl: string };

function Check(props: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className={`import-option ${props.disabled ? 'disabled' : ''}`}>
      <input
        type="checkbox"
        checked={props.checked && !props.disabled}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <div>{props.children}</div>
    </label>
  );
}

function Radio<T extends string>(props: {
  value: T;
  current: T;
  disabled?: boolean;
  onChange: (value: T) => void;
  children: ReactNode;
}) {
  return (
    <label className={props.disabled ? 'disabled' : ''}>
      <input
        type="radio"
        checked={props.current === props.value}
        disabled={props.disabled}
        onChange={() => props.onChange(props.value)}
      />{' '}
      {props.children}
    </label>
  );
}

/** NovelAI처럼 이미지에 담긴 생성 정보를 항목별로 골라 원하는 곳에 불러온다. */
export function ImageImportDialog({
  data,
  image,
  close,
}: {
  data: ImageImportData;
  image: DroppedImage;
  close: () => void;
}) {
  const library = useLibrary();
  const project = currentProject();
  const resolved = project ? resolveProject(library, project) : undefined;
  const desk = data.desk;
  const stem = image.name.replace(/\.[^.]+$/, '');

  // NovelAI 원본 이미지면 프롬프트에 섞여 있는 품질 태그·UC 프리셋 문구를 떼어 낸다.
  const tags = useMemo(() => {
    if (data.qualityTags !== undefined || data.ucPreset !== undefined) {
      return {
        positive: data.commonPositive ?? '',
        negative: data.commonNegative ?? '',
        qualityTags: data.qualityTags ?? false,
        qualityLevel: data.qualityLevel ?? 'standard',
        ucPreset: data.ucPreset ?? 'none',
      };
    }
    return detectNaiTags(
      data.model,
      data.commonPositive ?? '',
      data.commonNegative ?? '',
      data.tagHints,
    );
  }, [data]);

  const hasPositive = data.commonPositive !== undefined;
  const hasNegative = data.commonNegative !== undefined;
  const settingKeys = Object.keys(data.settings);
  const [usePositive, setUsePositive] = useState(hasPositive);
  const [useNegative, setUseNegative] = useState(hasNegative);
  const [useQuality, setUseQuality] = useState(true);
  const [useUc, setUseUc] = useState(true);
  const [useSettings, setUseSettings] = useState(settingKeys.length > 0);
  const [useModel, setUseModel] = useState(Boolean(data.model));
  const [useSeed, setUseSeed] = useState(false);
  // 덮어쓸 대상은 라이브러리의 어느 항목이든 고를 수 있다. 처음에는 라이브러리 화면에서 보고 있던 항목,
  // 아니면 지금 작업이 쓰는 항목을 고른다.
  const view = useStore((state) => state.view);
  const picked = (section: string) =>
    view.kind === 'library' && view.section === section ? (view.itemId ?? '') : undefined;
  const firstOf = <T extends { id: string }>(items: T[], ...ids: Array<string | undefined>) =>
    (ids.map((id) => items.find((item) => item.id === id)).find(Boolean) ?? items[0])?.id ?? '';

  const [presetTarget, setPresetTarget] = useState<'new' | 'current'>(
    picked('presets') !== undefined ? 'current' : 'new',
  );
  const [presetTargetId, setPresetTargetId] = useState(() =>
    firstOf(library.presets, picked('presets'), resolved?.preset?.id),
  );
  const targetPreset = library.presets.find((item) => item.id === presetTargetId);
  // 새로 만드는 항목 전부에 붙는 이름. 덮어쓰는 항목은 원래 이름을 둔다.
  const [name, setName] = useState(desk?.characterName ?? stem);

  const [useCharacter, setUseCharacter] = useState(data.characters.length > 0);
  const [characterIndex, setCharacterIndex] = useState(0);
  const [characterTarget, setCharacterTarget] = useState<'new' | 'add-set' | 'overwrite-set'>(
    picked('characters') !== undefined || resolved?.character ? 'add-set' : 'new',
  );
  const [characterTargetId, setCharacterTargetId] = useState(() =>
    firstOf(library.characters, picked('characters'), resolved?.character?.id),
  );
  const targetCharacter = library.characters.find((item) => item.id === characterTargetId);
  const [promptSetTargetId, setPromptSetTargetId] = useState(resolved?.promptSet?.id ?? '');
  const targetSet =
    targetCharacter?.promptSets.find((set) => set.id === promptSetTargetId) ??
    targetCharacter?.promptSets[0];
  const [useEmotion, setUseEmotion] = useState(Boolean(desk));
  const [emotionTarget, setEmotionTarget] = useState<'current' | 'new'>(
    picked('emotionSets') !== undefined || resolved?.emotionSet ? 'current' : 'new',
  );
  const [emotionSetTargetId, setEmotionSetTargetId] = useState(() =>
    firstOf(library.emotionSets, picked('emotionSets'), resolved?.emotionSet?.id),
  );
  const targetEmotionSet = library.emotionSets.find((item) => item.id === emotionSetTargetId);
  /** 지금 작업이 쓰는 항목에는 표시를 붙인다. */
  const usedMark = (id: string, usedId?: string) => (id === usedId ? ' (현재 작업)' : '');
  const [useReference, setUseReference] = useState(false);
  const [makeProject, setMakeProject] = useState(!project);

  // 전체 선택·해제는 불러올 항목에만 적용한다. 이미지에 없는 항목은 선택해도 꺼진 채로 보인다.
  const setAll = (value: boolean) => {
    setUsePositive(value && hasPositive);
    setUseNegative(value && hasNegative);
    setUseQuality(value);
    setUseUc(value);
    setUseSettings(value && settingKeys.length > 0);
    setUseModel(value && Boolean(data.model));
    setUseSeed(value && data.seed !== undefined);
    setUseCharacter(value && data.characters.length > 0);
    setUseEmotion(value && Boolean(desk));
    setUseReference(value);
  };

  const anyPreset =
    (usePositive && hasPositive) ||
    (useNegative && hasNegative) ||
    useQuality ||
    useUc ||
    useSettings ||
    useModel ||
    useSeed;

  const apply = () =>
    void run('불러오는 중', async () => {
      const result = applyImageImport(
        library,
        { stem, data, tags, project, character: resolved?.character },
        {
          name,
          preset: anyPreset
            ? {
                overwrite: presetTarget === 'current' ? targetPreset : undefined,
                positive: usePositive,
                negative: useNegative,
                quality: useQuality,
                uc: useUc,
                settings: useSettings,
                model: useModel,
                seed: useSeed,
              }
            : undefined,
          character: useCharacter
            ? {
                index: characterIndex,
                target: characterTarget,
                character: targetCharacter,
                promptSet: targetSet,
              }
            : undefined,
          emotion: useEmotion ? { target: emotionTarget, emotionSet: targetEmotionSet } : undefined,
          reference: useReference,
          newProject: makeProject,
        },
      );
      updateLibrary(() => result.library);
      if (result.projectId) openProject(result.projectId);
      if (result.referenceId) {
        setPendingReference({
          referenceId: result.referenceId,
          dataUrl: image.dataUrl,
          name: image.name,
        });
        openLibrary('references', result.referenceId);
      }
      toast(
        result.applied.length
          ? `불러왔습니다: ${result.applied.join(', ')}`
          : '선택한 항목이 없습니다.',
      );
      close();
    });

  const settingsText = settingKeys
    .map((key) => `${key} ${String(data.settings[key as keyof typeof data.settings])}`)
    .join(' · ');

  return (
    <Modal
      title="이미지에서 설정 불러오기"
      onClose={close}
      wide
      footer={
        <>
          <button onClick={close}>취소</button>
          <button className="accent" onClick={apply}>
            불러오기
          </button>
        </>
      }
    >
      <div className="image-import">
        <div>
          <img src={image.dataUrl} alt="" className="import-preview" />
          <p className="hint">
            {desk
              ? `이 앱의 결과물 · ${desk.characterName} / ${desk.emotion.name}`
              : `NovelAI 메타데이터${data.modelLabel ? ` · ${data.modelLabel}` : ''}`}
          </p>
        </div>
        <div className="import-options">
          <label className="import-name-field">
            <b>이름</b>
            <input
              value={name}
              aria-label="새로 만드는 항목 이름"
              placeholder={desk?.characterName ?? stem}
              onChange={(event) => setName(event.target.value)}
            />
            <small className="hint">
              새로 만드는 항목에 모두 붙습니다 · 덮어쓰는 항목은 이름 그대로
            </small>
          </label>
          <div className="select-all-row">
            <span className="hint">불러올 항목 선택</span>
            <button className="link-button" onClick={() => setAll(true)}>
              전체 선택
            </button>
            <button className="link-button" onClick={() => setAll(false)}>
              전체 해제
            </button>
          </div>
          <h3>① 생성 설정</h3>
          <Check checked={usePositive} disabled={!hasPositive} onChange={setUsePositive}>
            <b>공통 포지티브</b>
            <pre className="prompt-code small">{tags.positive || '(없음)'}</pre>
          </Check>
          <Check checked={useNegative} disabled={!hasNegative} onChange={setUseNegative}>
            <b>공통 네거티브</b>
            <pre className="prompt-code small negative">{tags.negative || '(없음)'}</pre>
          </Check>
          <div className="import-row">
            <Check checked={useQuality} onChange={setUseQuality}>
              <b>
                품질 태그: {tags.qualityTags ? QUALITY_LEVEL_LABELS[tags.qualityLevel] : '꺼짐'}
              </b>
            </Check>
            <Check checked={useUc} onChange={setUseUc}>
              <b>UC 프리셋: {UC_PRESET_LABELS[tags.ucPreset]}</b>
            </Check>
          </div>
          <div className="import-row">
            <Check checked={useSettings} disabled={!settingKeys.length} onChange={setUseSettings}>
              <b>샘플링 값</b>
              <small>{settingsText || '(없음)'}</small>
            </Check>
            <Check checked={useModel} disabled={!data.model} onChange={setUseModel}>
              <b>모델</b>
              <small>{data.model ? modelLabel(data.model) : '(알 수 없음)'}</small>
            </Check>
            <Check checked={useSeed} disabled={data.seed === undefined} onChange={setUseSeed}>
              <b>Seed {data.seed ?? ''}</b>
              <small>고정 seed로 설정</small>
            </Check>
          </div>
          {anyPreset && (
            <div className="import-target">
              <Radio value="new" current={presetTarget} onChange={setPresetTarget}>
                새 생성 설정으로 추가
              </Radio>
              <Radio
                value="current"
                current={presetTarget}
                disabled={!library.presets.length}
                onChange={setPresetTarget}
              >
                기존 생성 설정에 덮어쓰기
              </Radio>
              {presetTarget === 'current' && (
                <select
                  className="import-name"
                  aria-label="덮어쓸 생성 설정"
                  value={presetTargetId}
                  onChange={(event) => setPresetTargetId(event.target.value)}
                >
                  {library.presets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {usedMark(item.id, resolved?.preset?.id)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <h3>② 캐릭터</h3>
          <Check
            checked={useCharacter}
            disabled={!data.characters.length}
            onChange={setUseCharacter}
          >
            <b>
              캐릭터 프롬프트
              {data.characters.length > 1 ? ` (${data.characters.length}명 중 선택)` : ''}
            </b>
            {data.characters.length > 1 && (
              <select
                value={characterIndex}
                onChange={(event) => setCharacterIndex(Number(event.target.value))}
              >
                {data.characters.map((item, index) => (
                  <option key={index} value={index}>
                    캐릭터 {index + 1}: {item.positive.slice(0, 40)}
                  </option>
                ))}
              </select>
            )}
            <pre className="prompt-code small">
              {data.characters[characterIndex]?.positive || '(없음)'}
            </pre>
          </Check>
          {useCharacter && data.characters.length > 0 && (
            <div className="import-target">
              <Radio value="new" current={characterTarget} onChange={setCharacterTarget}>
                새 캐릭터로 추가
              </Radio>
              <Radio
                value="add-set"
                current={characterTarget}
                disabled={!library.characters.length}
                onChange={setCharacterTarget}
              >
                기존 캐릭터에 새 프롬프트 세트로 추가
              </Radio>
              <Radio
                value="overwrite-set"
                current={characterTarget}
                disabled={!library.characters.length}
                onChange={setCharacterTarget}
              >
                기존 프롬프트 세트에 덮어쓰기
              </Radio>
              {characterTarget !== 'new' && (
                <div className="import-pick">
                  <select
                    className="import-name"
                    aria-label="대상 캐릭터"
                    value={characterTargetId}
                    onChange={(event) => {
                      setCharacterTargetId(event.target.value);
                      setPromptSetTargetId('');
                    }}
                  >
                    {library.characters.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {usedMark(item.id, resolved?.character?.id)}
                      </option>
                    ))}
                  </select>
                  {characterTarget === 'overwrite-set' && targetCharacter && (
                    <select
                      className="import-name"
                      aria-label="덮어쓸 프롬프트 세트"
                      value={targetSet?.id}
                      onChange={(event) => setPromptSetTargetId(event.target.value)}
                    >
                      {targetCharacter.promptSets.map((set) => (
                        <option key={set.id} value={set.id}>
                          세트: {set.name}
                          {usedMark(set.id, resolved?.promptSet?.id)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          {desk && (
            <>
              <h3>③ 감정</h3>
              <Check checked={useEmotion} onChange={setUseEmotion}>
                <b>감정 "{desk.emotion.name}"</b>
                <small>{desk.emotion.prompt}</small>
              </Check>
              {useEmotion && (
                <div className="import-target">
                  <Radio
                    value="current"
                    current={emotionTarget}
                    disabled={!library.emotionSets.length}
                    onChange={setEmotionTarget}
                  >
                    기존 감정 모음에 추가 (같은 이름은 덮어쓰기)
                  </Radio>
                  {emotionTarget === 'current' && (
                    <select
                      className="import-name"
                      aria-label="대상 감정 모음"
                      value={emotionSetTargetId}
                      onChange={(event) => setEmotionSetTargetId(event.target.value)}
                    >
                      {library.emotionSets.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.emotions.length})
                          {usedMark(item.id, resolved?.emotionSet?.id)}
                        </option>
                      ))}
                    </select>
                  )}
                  <Radio value="new" current={emotionTarget} onChange={setEmotionTarget}>
                    새 감정 모음으로
                  </Radio>
                </div>
              )}
            </>
          )}

          <h3>④ 인페인트</h3>
          <Check checked={useReference} onChange={setUseReference}>
            <b>이 이미지로 새 인페인트 만들기</b>
          </Check>

          <hr />
          <Check checked={makeProject} onChange={setMakeProject}>
            <b>불러온 항목으로 새 작업 만들기</b>
            <small>
              {makeProject
                ? '빠진 항목은 새로 만들어 채웁니다.'
                : project
                  ? `현재 작업 "${project.name}"이(가) 새로 만든 항목을 쓰도록 연결합니다.`
                  : '라이브러리에만 추가합니다.'}
            </small>
          </Check>
        </div>
      </div>
    </Modal>
  );
}
