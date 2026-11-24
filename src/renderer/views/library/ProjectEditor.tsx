import type { Project, ProjectMode } from '../../../core/domain/types';
import {
  AID_MODEL_MISSING,
  INPAINT_MODEL_MISSING,
  resolveProject,
} from '../../../core/model/defaults';
import {
  maxCharactersFor,
  modelLabel,
  noInpaintReason,
  supportsInpaint,
} from '../../../core/providers/NaiModels';
import { AidChip } from '../../components/AidChip';
import { CharacterChip } from '../../components/CharacterChip';
import { PositionChip } from '../../components/CharacterPositions';
import { openDialog } from '../../components/dialogStack';
import { Icon } from '../../components/Icon';
import { PromptTextarea } from '../../components/PromptTextarea';
import { PostProcessChip } from '../../components/RefineChip';
import { Card } from '../../components/ui';
import { projectRefineTarget } from '../../refineTargets';
import { openLibrary, updateProject, useLibrary, type LibrarySection } from '../../store';
import { LibraryEditorDialog } from './LibraryEditorDialog';

const MODES: Array<{ value: ProjectMode; label: string }> = [
  { value: 'reference', label: '인페인트' },
  { value: 'txt2img', label: '일반 생성' },
];

function PartRow(props: {
  label: string;
  section: LibrarySection;
  value: string;
  items: Array<{ id: string; name: string }>;
  hint?: string;
  onChange: (value: string) => void;
}) {
  const exists = props.items.some((item) => item.id === props.value);
  const edit = () => {
    if (!props.value || !exists) {
      openLibrary(props.section);
      return;
    }
    void openDialog((close) => (
      <LibraryEditorDialog section={props.section} itemId={props.value} close={close} />
    ));
  };
  return (
    <div className="project-editor-part">
      <label className="stack-field">
        {props.label}
        <div className="project-editor-select">
          <select
            value={exists ? props.value : ''}
            onChange={(event) => props.onChange(event.target.value)}
          >
            {!exists && <option value="">(없음)</option>}
            {props.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            title={`${props.label} 편집`}
            aria-label={`${props.label} 편집`}
            onClick={edit}
          >
            <Icon name="edit" size={14} />
          </button>
        </div>
      </label>
      {props.hint && <small className="hint">{props.hint}</small>}
    </div>
  );
}

export function ProjectEditor({ project }: { project: Project }) {
  const library = useLibrary();
  const resolved = resolveProject(library, project);
  const patch = (value: Partial<Project>) =>
    updateProject(project.id, (current) => ({ ...current, ...value }));
  const bannerMissing = resolved.missing.filter(
    (item) => item !== AID_MODEL_MISSING && item !== INPAINT_MODEL_MISSING,
  );
  const inpaintModel =
    project.mode === 'reference' &&
    resolved.preset &&
    !supportsInpaint(resolved.preset.generation.model)
      ? resolved.preset.generation.model
      : undefined;
  const totalScenes = resolved.emotionSet?.emotions.length ?? 0;
  const excluded = new Set(project.excludedEmotionIds);
  const checkedScenes =
    resolved.emotionSet?.emotions.filter((emotion) => !excluded.has(emotion.id)).length ?? 0;

  return (
    <>
      {(bannerMissing.length > 0 || inpaintModel) && (
        <div className="warning-box">
          ⚠
          {bannerMissing.length > 0 &&
            ` 생성에 필요한 항목이 없습니다: ${bannerMissing.join(', ')}.`}
          {inpaintModel &&
            ` ${[
              `${modelLabel(inpaintModel)}는 일반 생성 전용입니다.`,
              noInpaintReason(inpaintModel),
            ]
              .filter(Boolean)
              .join(' ')}`}
        </div>
      )}

      <Card title="생성 방식">
        <div className="segmented" role="group" aria-label="생성 방식">
          {MODES.map((item) => (
            <button
              key={item.value}
              className={project.mode === item.value ? 'active blue' : ''}
              aria-pressed={project.mode === item.value}
              onClick={() => patch({ mode: item.value })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="작업 구성">
        <div className="project-editor-grid">
          <PartRow
            label="생성 설정"
            section="presets"
            value={project.presetId}
            items={library.presets}
            onChange={(presetId) => patch({ presetId })}
          />
          <PartRow
            label="씬 모음"
            section="emotionSets"
            value={project.emotionSetId}
            items={library.emotionSets}
            onChange={(emotionSetId) => patch({ emotionSetId })}
          />
          <PartRow
            label="인페인트"
            section="references"
            value={project.referenceId}
            items={library.references}
            hint={project.mode === 'txt2img' ? '인페인트 모드 전용' : undefined}
            onChange={(referenceId) => patch({ referenceId })}
          />
        </div>
        <div className="project-editor-chips">
          <CharacterChip
            slots={project.characters}
            optional
            max={maxCharactersFor(resolved.preset?.generation.model)}
            onChange={(characters) => patch({ characters })}
          />
          <PositionChip target={{ projectId: project.id }} />
          <AidChip
            value={project}
            onChange={patch}
            model={resolved.preset?.generation.model}
            inpaint={project.mode === 'reference'}
          />
          <PostProcessChip target={projectRefineTarget(resolved)} project={project} />
        </div>
      </Card>

      <Card title="추가 프롬프트" subtitle="상위 프롬프트 뒤 · 이 작업만">
        <PromptTextarea
          rows={3}
          value={project.extraPrompt ?? ''}
          aria-label="추가 프롬프트"
          placeholder="상위 프롬프트 뒤에 붙일 태그"
          onChange={(extraPrompt) => patch({ extraPrompt: extraPrompt || undefined })}
        />
      </Card>

      {resolved.emotionSet && (
        <Card
          title="생성 체크"
          subtitle={`${checkedScenes} / ${totalScenes}개 씬 체크됨`}
          actions={
            <div className="button-row">
              <button
                disabled={checkedScenes === totalScenes}
                onClick={() => patch({ excludedEmotionIds: [] })}
              >
                모두 체크
              </button>
              <button
                disabled={checkedScenes === 0}
                onClick={() =>
                  patch({
                    excludedEmotionIds: resolved.emotionSet!.emotions.map((emotion) => emotion.id),
                  })
                }
              >
                모두 해제
              </button>
            </div>
          }
        >
          <></>
        </Card>
      )}
    </>
  );
}
