import { useState } from 'react';
import type { Project } from '../../core/domain/types';
import { composeRequestPrompts } from '../../core/jobs/JobBuilder';
import { readableId, type ResolvedProject } from '../../core/model/defaults';
import { uniqueName } from '../../core/model/mutations';
import { checkFreeGeneration } from '../../core/providers/NaiCost';
import { modelLabel } from '../../core/providers/NaiModels';
import { batchEmotionIds, generateEmotions } from '../actions';
import { Modal, openDialog } from '../components/Dialogs';
import { AccountMeter } from '../components/AccountMeter';
import { Icon } from '../components/Icon';
import { Menu } from '../components/ui';
import { deleteProject } from '../projectOps';
import { sectionInfo } from '../sections';
import {
  openLibrary,
  openProject,
  referenceMedia,
  run,
  toast,
  updateLibrary,
  updateProject,
  useLibrary,
  useResolvedProject,
  useStore,
  type LibrarySection,
} from '../store';
import { EmotionDetail } from './EmotionDetail';
import { GalleryView } from './GalleryView';
import { libraryApi } from '../desktop';

/** 한 줄짜리 구성 칩: 아이콘 + 이름 + 선택 상자. 편집 버튼은 마우스를 올렸을 때만 보인다. */
function ChainChip(props: {
  section: LibrarySection;
  itemId?: string;
  missing?: boolean;
  children: React.ReactNode;
}) {
  const info = sectionInfo(props.section);
  return (
    <div
      className={`chain-chip ${props.missing ? 'missing' : ''}`}
      title={[info.label, info.usage].filter(Boolean).join(' · ')}
    >
      <span className="chain-chip-label">
        <Icon name={info.icon} size={15} />
        {info.label}
      </span>
      {props.children}
      <button
        className="icon-button chain-chip-edit"
        title={`라이브러리에서 ${info.label} 편집`}
        onClick={() => openLibrary(props.section, props.itemId)}
      >
        <Icon name="edit" size={14} />
      </button>
    </div>
  );
}

/** 작업에 쓰는 라이브러리 항목 네 가지를 한 줄에서 바꾼다. 거의 바꾸지 않는 값이라 작게 둔다. */
function ChainBar({ resolved }: { resolved: ResolvedProject }) {
  const library = useLibrary();
  const { project } = resolved;
  const patch = (value: Partial<Project>) =>
    updateProject(project.id, (current) => ({ ...current, ...value }));
  const thumb = resolved.reference?.image
    ? referenceMedia(
        resolved.reference.id,
        resolved.reference.image.originalFile,
        resolved.reference.updatedAt,
      )
    : undefined;

  return (
    <div className="chain-bar">
      <ChainChip section="presets" itemId={resolved.preset?.id} missing={!resolved.preset}>
        <select
          value={project.presetId}
          onChange={(event) => patch({ presetId: event.target.value })}
        >
          {!resolved.preset && <option value={project.presetId}>(없음)</option>}
          {library.presets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </ChainChip>
      <ChainChip section="characters" itemId={resolved.character?.id} missing={!resolved.character}>
        <select
          value={project.characterId}
          onChange={(event) => {
            const character = library.characters.find((item) => item.id === event.target.value);
            if (character)
              patch({ characterId: character.id, promptSetId: character.promptSets[0].id });
          }}
        >
          {!resolved.character && <option value={project.characterId}>(없음)</option>}
          {library.characters.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {resolved.character && resolved.character.promptSets.length > 1 && (
          <>
            <span className="chain-chip-sep">/</span>
            <select
              title="캐릭터 프롬프트 세트"
              aria-label="캐릭터 프롬프트 세트"
              value={resolved.promptSet?.id}
              onChange={(event) => patch({ promptSetId: event.target.value })}
            >
              {resolved.character.promptSets.map((set) => (
                <option key={set.id} value={set.id}>
                  세트: {set.name}
                </option>
              ))}
            </select>
          </>
        )}
      </ChainChip>
      <ChainChip
        section="references"
        itemId={resolved.reference?.id}
        missing={!resolved.reference?.image}
      >
        {thumb && <img className="chain-thumb" src={thumb} alt="" />}
        <select
          value={project.referenceId}
          onChange={(event) => patch({ referenceId: event.target.value })}
        >
          {!resolved.reference && <option value={project.referenceId}>(없음)</option>}
          {library.references.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.image ? '' : ' (이미지 없음)'}
            </option>
          ))}
        </select>
      </ChainChip>
      <ChainChip
        section="emotionSets"
        itemId={resolved.emotionSet?.id}
        missing={!resolved.emotionSet}
      >
        <select
          value={project.emotionSetId}
          onChange={(event) => patch({ emotionSetId: event.target.value })}
        >
          {!resolved.emotionSet && <option value={project.emotionSetId}>(없음)</option>}
          {library.emotionSets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.emotions.length})
            </option>
          ))}
        </select>
      </ChainChip>
    </div>
  );
}

function PreviewDialog({ resolved, close }: { resolved: ResolvedProject; close: () => void }) {
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
  const prompts = composeRequestPrompts(resolved.preset, resolved.promptSet, emotion?.prompt, {
    sets: library.pieceSets,
  });
  return (
    <Modal title="최종 요청 미리보기" onClose={close} wide>
      {prompts.missingPieces.length > 0 && (
        <p className="hint error-text">
          없는 프롬프트 조각: {prompts.missingPieces.join(', ')} · 생성 불가
        </p>
      )}
      <label className="stack-field">
        감정
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
        <div className="prompt-preview">
          <span>캐릭터 포지티브 + 감정</span>
          <pre className="prompt-code">{prompts.characterPrompt || '(비어 있음)'}</pre>
        </div>
        <div className="prompt-preview negative-preview">
          <span>캐릭터 네거티브</span>
          <pre className="prompt-code">{prompts.characterNegativePrompt || '(비어 있음)'}</pre>
        </div>
      </div>
      <p className="hint">
        조각은 내용으로 표시 · 한 줄 고르기 조각은 첫 줄로 표시(실제로는 이미지마다 선택)
      </p>
      <p className="hint">
        모델: {modelLabel(resolved.preset.generation.model)}
        {resolved.preset.generation.model.includes('-3-') &&
          ' · V3: 캐릭터 프롬프트를 공통 프롬프트 뒤에 합침'}
      </p>
    </Modal>
  );
}

export function ProjectView({ projectId }: { projectId: string }) {
  const resolved = useResolvedProject(projectId);
  const library = useLibrary();
  const busy = useStore((state) => state.busy);
  const detailEmotionId = useStore((state) => state.detailEmotionId);
  if (!resolved) return null;
  const { project, preset, emotionSet, reference } = resolved;
  const batch = batchEmotionIds(project.id);
  const count = batch.length * (preset?.generation.variantsPerEmotion ?? 1);
  const cost =
    preset && reference?.image
      ? checkFreeGeneration(
          preset.generation,
          reference.image.canvasWidth,
          reference.image.canvasHeight,
        )
      : undefined;
  const detail = emotionSet?.emotions.find((emotion) => emotion.id === detailEmotionId);

  const duplicateProject = () => {
    const name = uniqueName(
      `${project.name} 복사본`,
      library.projects.map((item) => item.name),
    );
    const now = new Date().toISOString();
    const copy: Project = {
      ...structuredClone(project),
      id: readableId(name, 'project'),
      name,
      favorites: {},
      createdAt: now,
      updatedAt: now,
    };
    updateLibrary((current) => ({ ...current, projects: [...current.projects, copy] }));
    openProject(copy.id);
    toast(
      `${name}을(를) 만들었습니다. 같은 생성 설정·캐릭터·감정 모음·인페인트를 사용하며 생성 결과는 따로 쌓입니다.`,
    );
  };

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
        <div className="header-spacer" />
        <AccountMeter />
        <Menu
          label="⋯"
          items={[
            {
              label: '최종 요청 미리보기',
              onSelect: () =>
                void openDialog((close) => <PreviewDialog resolved={resolved} close={close} />),
            },
            {
              label: '작업 폴더 열기',
              onSelect: () =>
                void run('폴더를 여는 중', () =>
                  libraryApi().openInExplorer({ kind: 'project', projectId: project.id }),
                ),
            },
            'divider',
            { label: '작업 복제 (같은 조합)', onSelect: duplicateProject },
            { label: '작업 삭제', danger: true, onSelect: () => void deleteProject(project) },
          ]}
        />
      </header>
      <ChainBar resolved={resolved} />
      {resolved.missing.length > 0 && (
        <div className="missing-banner">
          ⚠ 생성하려면 {resolved.missing.join(', ')}이(가) 필요합니다.
          {!reference?.image && reference && (
            <button className="link-button" onClick={() => openLibrary('references', reference.id)}>
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
            generate={
              <>
                {cost && !cost.free && (
                  <span className="pill warn" title={cost.reasons.join('\n')}>
                    Anlas 사용
                  </span>
                )}
                <button
                  className="generate-button"
                  disabled={!count || Boolean(busy) || resolved.missing.length > 0}
                  title={
                    resolved.missing.length
                      ? `필요: ${resolved.missing.join(', ')}`
                      : `체크한 감정 ${batch.length}개 × ${preset?.generation.variantsPerEmotion ?? 1}장`
                  }
                  onClick={() => void generateEmotions(project.id, batch)}
                >
                  ▶ {count ? `${count}장 생성` : '생성할 감정 없음'}
                </button>
              </>
            }
          />
        )}
      </div>
    </section>
  );
}
