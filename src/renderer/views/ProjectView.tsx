import { Fragment, useState } from 'react';
import type {
  AidMode,
  CharacterReference,
  Preset,
  Project,
  ProjectMode,
  Vibe,
} from '../../core/domain/types';
import { composeRequestPrompts } from '../../core/jobs/JobBuilder';
import {
  effectiveGenerationSettings,
  aidItems,
  generationKindFor,
  projectAid,
  projectAidMode,
  type ResolvedProject,
} from '../../core/model/defaults';
import { estimateJobAnlas, generationCostWarnings } from '../../core/providers/NaiCost';
import { patchItem } from '../../core/model/mutations';
import {
  maxCharactersFor,
  modelLabel,
  supportsInpaint,
  supportsReferenceAid,
  usesMedium,
} from '../../core/providers/NaiModels';
import { CharacterChip } from '../components/CharacterChip';
import { PositionChip } from '../components/CharacterPositions';
import { batchEmotionIds, generateEmotions } from '../actions';
import { Modal, openDialog } from '../components/Dialogs';
import { AccountMeter } from '../components/AccountMeter';
import { ChecklistChip, SizeChip, type ChecklistItem } from '../components/ChainChip';
import type { IconName } from '../components/Icon';
import { Stepper } from '../components/Stepper';
import { useShortcut } from '../useShortcut';
import { Menu } from '../components/ui';
import { deleteProject, duplicateProject, openProjectFolder } from '../projectOps';
import {
  pictureMedia,
  referenceMedia,
  updateLibrary,
  updateProject,
  useLibrary,
  useResolvedProject,
  useStore,
} from '../store';
import { EmotionDetail } from './EmotionDetail';
import { LibraryEditorDialog } from './library/LibraryEditorDialog';
import { GalleryView } from './GalleryView';

const MODES: Array<{ value: ProjectMode; label: string; title: string }> = [
  { value: 'reference', label: '인페인트', title: '참고 이미지 옆에 인페인트로 그립니다' },
  { value: 'txt2img', label: '일반 생성', title: '참고 이미지 없이 프롬프트로만 그립니다' },
];

const MAX_VARIANTS = 20;

const NO_AID = '__none';

const AID_MODES: Array<{ value: AidMode; label: string; title: string }> = [
  { value: 'character', label: '레퍼런스', title: '캐릭터 레퍼런스 하나를 씁니다' },
  { value: 'vibe', label: '바이브', title: '바이브 여러 개를 함께 씁니다' },
];

/**
 * 참고 칩. 캐릭터 레퍼런스와 바이브는 함께 쓰지 않아 칩 안의 버튼으로 방식을 고르고, 그 방식의 목록에서
 * 고른다. 캐릭터 레퍼런스는 하나, 바이브는 여럿 고른다. 방식을 바꿔도 다른 쪽에서 고른 것은 남겨 둔다.
 */
function AidChip(props: { project: Project; missing: boolean }) {
  const library = useLibrary();
  const { project } = props;
  const mode = projectAidMode(project);
  const txt2img = project.mode === 'txt2img';
  const aid = projectAid(library, project);
  const patch = (value: Partial<Project>) =>
    updateProject(project.id, (current) => ({ ...current, ...value }));
  const row = (item: CharacterReference | Vibe): ChecklistItem => ({
    id: item.id,
    name: item.name,
    folder: item.folder,
    thumb: item.image ? pictureMedia(item.image.file) : '',
    hint: item.image ? undefined : '그림 없음',
  });
  const common = {
    label: {
      text: '참고',
      icon: (mode === 'character' ? 'portrait' : 'vibe') as IconName,
      usage: '캐릭터 레퍼런스나 바이브를 씁니다(V4.5 전용)',
    },
    missing: Boolean(aid) && props.missing,
    before: (
      <span className="segmented chain-chip-switch" role="group" aria-label="참고 방식">
        {AID_MODES.map((item) => {
          const blocked = item.value === 'character' && !txt2img;
          return (
            <button
              key={item.value}
              className={mode === item.value ? 'active blue' : ''}
              aria-pressed={mode === item.value}
              disabled={blocked}
              title={blocked ? '캐릭터 레퍼런스는 일반 생성에서만 씁니다' : item.title}
              onClick={() => patch({ aidMode: item.value })}
            >
              {item.label}
            </button>
          );
        })}
      </span>
    ),
  };

  if (mode === 'character') {
    const id = project.characterReferenceId;
    const selected = library.characterReferences.find((item) => item.id === id);
    return (
      <ChecklistChip
        {...common}
        section="characterReferences"
        itemId={id}
        value={id ? (selected?.name ?? '(없음)') : '쓰지 않음'}
        thumb={selected?.image ? pictureMedia(selected.image.file) : undefined}
        items={[
          { id: NO_AID, name: '쓰지 않음', noEdit: true },
          ...library.characterReferences.map(row),
        ]}
        checked={[id ?? NO_AID]}
        onPick={(picked) => patch({ characterReferenceId: picked === NO_AID ? undefined : picked })}
        editSection="characterReferences"
        pickTitle="캐릭터 레퍼런스 고르기"
        hint="한 장에 5 Anlas가 듭니다."
      />
    );
  }

  const ids = project.vibeIds;
  const names = ids.map((id) => library.vibes.find((item) => item.id === id)?.name ?? '(없음)');
  const first = library.vibes.find((item) => item.id === ids[0]);
  return (
    <ChecklistChip
      {...common}
      section="vibes"
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
        ...library.vibes.map(row),
        ...ids
          .filter((id) => !library.vibes.some((item) => item.id === id))
          .map((id) => ({ id, name: '(지워진 바이브)', noEdit: true })),
      ]}
      checked={ids}
      multi
      onPick={(id) =>
        patch({
          vibeIds: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
        })
      }
      editSection="vibes"
      pickTitle="바이브 고르기 · 여럿 고를 수 있습니다"
      empty="라이브러리에 바이브가 없습니다."
      hint="모두 빼면 쓰지 않습니다. 처음 쓰는 바이브는 인코딩에 2 Anlas가 듭니다."
    />
  );
}

function VariantsStepper({ preset }: { preset: Preset }) {
  const value = preset.generation.variantsPerEmotion;
  const change = (next: number) =>
    updateLibrary((library) =>
      patchItem(library, 'presets', preset.id, (item) => ({
        ...item,
        generation: { ...item.generation, variantsPerEmotion: next },
      })),
    );
  return (
    <span
      className="zone-field"
      title={`씬마다 만들 장수 · 생성 설정 「${preset.name}」에 저장됩니다`}
    >
      ×
      <Stepper
        value={value}
        min={1}
        max={MAX_VARIANTS}
        step={1}
        label="씬마다 만들 장수"
        onChange={change}
      />
      장
    </span>
  );
}

function ModeSwitch({ project }: { project: Project }) {
  return (
    <div className="segmented" role="group" aria-label="생성 방식">
      {MODES.map((mode) => (
        <button
          key={mode.value}
          className={project.mode === mode.value ? 'active blue' : ''}
          aria-pressed={project.mode === mode.value}
          title={mode.title}
          onClick={() => updateProject(project.id, (current) => ({ ...current, mode: mode.value }))}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

/** 작업에 쓰는 라이브러리 항목 네 가지를 한 줄에서 바꾼다. 거의 바꾸지 않는 값이라 작게 둔다. */
function ChainBar({ resolved }: { resolved: ResolvedProject }) {
  const library = useLibrary();
  const { project } = resolved;
  const patch = (value: Partial<Project>) =>
    updateProject(project.id, (current) => ({ ...current, ...value }));
  const aid = projectAid(library, project);
  const aidMissing =
    aidItems(aid).some((item) => !item?.image) ||
    Boolean(resolved.preset && !supportsReferenceAid(resolved.preset.generation.model));
  const thumb = resolved.reference?.image
    ? referenceMedia(
        resolved.reference.id,
        resolved.reference.image.originalFile,
        resolved.reference.updatedAt,
      )
    : undefined;

  return (
    <div className="chain-bar">
      <ChecklistChip
        section="presets"
        itemId={resolved.preset?.id}
        missing={!resolved.preset}
        value={resolved.preset?.name ?? '(없음)'}
        items={library.presets}
        checked={[project.presetId]}
        onPick={(presetId) => patch({ presetId })}
        editSection="presets"
      />
      <CharacterChip
        slots={project.characters}
        optional
        max={maxCharactersFor(resolved.preset?.generation.model)}
        onChange={(characters) => patch({ characters })}
      />
      <PositionChip target={{ projectId: project.id }} />
      {project.mode === 'reference' && (
        <ChecklistChip
          section="references"
          itemId={resolved.reference?.id}
          missing={!resolved.reference?.image}
          value={resolved.reference?.name ?? '(없음)'}
          thumb={thumb}
          items={library.references.map((item) => ({
            id: item.id,
            name: item.name,
            folder: item.folder,
            thumb: item.image
              ? referenceMedia(item.id, item.image.originalFile, item.updatedAt)
              : '',
            hint: item.image ? undefined : '이미지 없음',
          }))}
          checked={[project.referenceId]}
          onPick={(referenceId) => patch({ referenceId })}
          editSection="references"
        />
      )}
      {project.mode !== 'reference' && resolved.preset && <SizeChip preset={resolved.preset} />}
      <AidChip project={project} missing={aidMissing} />
      <ChecklistChip
        section="emotionSets"
        itemId={resolved.emotionSet?.id}
        missing={!resolved.emotionSet}
        value={resolved.emotionSet?.name ?? '(없음)'}
        items={library.emotionSets.map((item) => ({
          id: item.id,
          name: item.name,
          folder: item.folder,
          hint: `씬 ${item.emotions.length}개`,
        }))}
        checked={[project.emotionSetId]}
        onPick={(emotionSetId) => patch({ emotionSetId })}
        editSection="emotionSets"
      />
    </div>
  );
}

export function PreviewDialog({ resolved, close }: { resolved: ResolvedProject; close: () => void }) {
  const library = useLibrary();
  const emotions = resolved.emotionSet?.emotions ?? [];
  const [emotionId, setEmotionId] = useState(emotions[0]?.id ?? '');
  const emotion = emotions.find((item) => item.id === emotionId);
  if (!resolved.preset || !resolved.promptSet) {
    return (
      <Modal title="최종 요청 미리보기" onClose={close}>
        <p>생성 설정과 캐릭터를 먼저 선택하십시오.</p>
      </Modal>
    );
  }
  const prompts = composeRequestPrompts(
    resolved.preset,
    resolved.characters.map((item) => item.promptSet),
    emotion,
    { sets: library.pieceSets },
    generationKindFor(resolved.project.mode),
  );
  return (
    <Modal title="최종 요청 미리보기" onClose={close} wide>
      {prompts.missingPieces.length > 0 && (
        <p className="hint error-text">
          없는 프롬프트 조각: {prompts.missingPieces.join(', ')} · 생성 불가
        </p>
      )}
      <label className="stack-field">
        씬
        <select value={emotionId} onChange={(event) => setEmotionId(event.target.value)}>
          {emotions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <div className="two-column">
        <div className="prompt-preview">
          <span>공통 포지티브 (품질 태그 포함)</span>
          <pre className="prompt-code">{prompts.prompt}</pre>
        </div>
        <div className="prompt-preview negative-preview">
          <span>공통 네거티브 (UC 프리셋 포함)</span>
          <pre className="prompt-code">{prompts.negativePrompt || '(비어 있음)'}</pre>
        </div>
        {[
          {
            prompt: prompts.characterPrompt,
            negative: prompts.characterNegativePrompt,
          },
          ...prompts.extraCharacters,
        ].map((character, index) => {
          const name =
            resolved.characters.length > 1 ? ` · ${resolved.characters[index].character.name}` : '';
          return (
            <Fragment key={index}>
              <div className="prompt-preview">
                <span>캐릭터 포지티브 + 씬{name}</span>
                <pre className="prompt-code">{character.prompt || '(비어 있음)'}</pre>
              </div>
              <div className="prompt-preview negative-preview">
                <span>캐릭터 네거티브{name}</span>
                <pre className="prompt-code">{character.negative || '(비어 있음)'}</pre>
              </div>
            </Fragment>
          );
        })}
      </div>
      <p className="hint">
        조각은 내용으로 표시 · "줄마다 하나씩 고르기" 조각은 첫 줄로 표시(실제로는 이미지마다 고름)
      </p>
      <p className="hint">
        모델: {modelLabel(resolved.preset.generation.model)}
        {usesMedium(resolved.preset.generation) && ' · Effort Medium(네거티브는 UC 프리셋만)'}
        {resolved.preset.generation.model.includes('-3-') &&
          ' · V3: 캐릭터 프롬프트를 공통 프롬프트 뒤에 합침'}
      </p>
    </Modal>
  );
}

export function ProjectView({ projectId }: { projectId: string }) {
  const resolved = useResolvedProject(projectId);
  const busy = useStore((state) => state.busy);
  const detailEmotionId = useStore((state) => state.detailEmotionId);
  const token = useStore((state) => state.token);
  const library = useLibrary();
  const openPreview = () =>
    resolved && void openDialog((close) => <PreviewDialog resolved={resolved} close={close} />);
  useShortcut('Ctrl+P', openPreview);
  if (!resolved) return null;
  const { project, preset, emotionSet, reference } = resolved;
  const batch = batchEmotionIds(project.id);
  const count = batch.length * (preset?.generation.variantsPerEmotion ?? 1);
  // 메인 프로세스가 큐에 넣을 때와 같은 식으로, 지금 설정 그대로 생성할 때의 예상 Anlas를 보여 준다.
  const generation = preset && effectiveGenerationSettings(preset.generation);
  const aid = projectAid(library, project);
  const costJob =
    project.mode !== 'reference'
      ? generation && {
          kind: project.mode,
          settings: generation,
          canvasWidth: generation.width,
          canvasHeight: generation.height,
          aid,
        }
      : generation && reference?.image
        ? {
            settings: generation,
            canvasWidth: reference.image.canvasWidth,
            canvasHeight: reference.image.canvasHeight,
            aid,
          }
        : undefined;
  const estimate = costJob && count ? estimateJobAnlas(costJob, token) * count : undefined;
  const costReasons = costJob ? generationCostWarnings([costJob], token) : [];
  const detail = emotionSet?.emotions.find((emotion) => emotion.id === detailEmotionId);

  return (
    <section className="project-view">
      <header className="project-header">
        <input
          className="project-name-input"
          value={project.name}
          aria-label="작업 이름"
          onChange={(event) =>
            updateProject(project.id, (current) => ({ ...current, name: event.target.value }))
          }
        />
        <ModeSwitch project={project} />
        <div className="header-spacer" />
        <AccountMeter />
        <Menu
          label="⋯"
          items={[
            {
              label: '최종 요청 미리보기 (Ctrl+P)',
              onSelect: openPreview,
            },
            { label: '작업 폴더 열기', onSelect: () => openProjectFolder(project.id) },
            'divider',
            { label: '작업 복제 (같은 조합)', onSelect: () => duplicateProject(project) },
            { label: '작업 삭제', danger: true, onSelect: () => void deleteProject(project) },
          ]}
        />
      </header>
      <ChainBar resolved={resolved} />
      {resolved.missing.length > 0 && (
        <div className="missing-banner">
          ⚠ 생성하려면 {resolved.missing.join(', ')}이(가) 필요합니다.
          {project.mode === 'reference' && preset && !supportsInpaint(preset.generation.model) && (
            <span>
              {' '}
              {modelLabel(preset.generation.model)}은(는) 일반 생성 전용입니다. 생성 설정에서 모델을
              바꾸거나 일반 생성으로 전환하십시오.
            </span>
          )}
          {project.mode === 'reference' && !reference?.image && reference && (
            <button
              className="link-button"
              onClick={() =>
                void openDialog((close) => (
                  <LibraryEditorDialog section="references" itemId={reference.id} close={close} />
                ))
              }
            >
              참고 이미지 설정하기 →
            </button>
          )}
        </div>
      )}
      <div className="project-body animate-in" key={detail ? `detail:${detail.id}` : 'gallery'}>
        {detail && emotionSet ? (
          <EmotionDetail resolved={resolved} emotion={detail} />
        ) : (
          <GalleryView
            resolved={resolved}
            countControl={preset && <VariantsStepper preset={preset} />}
            generate={
              <>
                {estimate !== undefined && (
                  <span
                    className={`pill ${estimate ? 'warn' : ''}`}
                    title={[
                      ...(estimate ? costReasons : ['Opus 무료 생성 기준 안입니다.']),
                      '예상값이며 실제 차감량과 다를 수 있습니다.',
                    ].join('\n')}
                  >
                    {estimate
                      ? `예상 약 ${estimate.toLocaleString()} Anlas`
                      : '예상 0 Anlas (무료)'}
                  </span>
                )}
                <button
                  className="generate-button"
                  disabled={!count || Boolean(busy) || resolved.missing.length > 0}
                  title={
                    resolved.missing.length
                      ? `필요: ${resolved.missing.join(', ')}`
                      : `체크한 씬 ${batch.length}개 × ${preset?.generation.variantsPerEmotion ?? 1}장`
                  }
                  onClick={() => void generateEmotions(project.id, batch)}
                >
                  ▶ {count ? `${count}장 생성` : '생성할 씬 없음'}
                </button>
              </>
            }
          />
        )}
      </div>
    </section>
  );
}
