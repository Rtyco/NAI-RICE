import type { Project, ReferenceAid } from '../../core/domain/types';
import { patchItem } from '../../core/model/mutations';
import { DEFAULT_REFERENCE_AID, projectAid, projectsUsing } from '../../core/model/defaults';
import { modelLabel, supportsReferenceAid } from '../../core/providers/NaiModels';
import { referenceMedia, updateLibrary, updateProject, useLibrary } from '../store';
import { ChainChip } from './ChainChip';
import { Modal, openDialog } from './Dialogs';
import { NumberField, Toggle } from './ui';

const KINDS: Array<{ value: ReferenceAid['kind']; label: string }> = [
  { value: 'none', label: '없음' },
  { value: 'character', label: '캐릭터 레퍼런스' },
  { value: 'vibe', label: '바이브' },
];

/** 참고 방식을 바꿀 때 V4.5 모델로 바꾸는 버튼이 고르는 모델. 인페인트와 일반 생성 모두 된다. */
const V45_MODEL = 'nai-diffusion-4-5-full-inpainting';

function aidLabel(kind: ReferenceAid['kind']): string {
  return KINDS.find((item) => item.value === kind)?.label ?? '없음';
}

/** 작업 구성 막대의 「참고」 칩. 캐릭터 레퍼런스·바이브로 참고 그림을 생성에 더한다. */
export function ReferenceAidChip({ project }: { project: Project }) {
  const library = useLibrary();
  const aid = projectAid(project);
  const preset = library.presets.find((item) => item.id === project.presetId);
  const reference = library.references.find((item) => item.id === project.referenceId);
  const blocked =
    aid && (!reference?.image || (preset && !supportsReferenceAid(preset.generation.model)));
  const open = () =>
    void openDialog((close) => <ReferenceAidDialog projectId={project.id} close={close} />);
  return (
    <ChainChip
      label={{
        text: '참고',
        icon: 'reference',
        usage: '캐릭터 레퍼런스나 바이브로 참고 그림을 생성에 더합니다(V4.5 전용)',
      }}
      missing={Boolean(blocked)}
      edit={{ title: '참고 방식 정하기', open }}
    >
      <button className="chain-chip-value" onClick={open}>
        {aidLabel(aid?.kind ?? 'none')}
      </button>
    </ChainChip>
  );
}

export function ReferenceAidDialog({ projectId, close }: { projectId: string; close: () => void }) {
  const library = useLibrary();
  const project = library.projects.find((item) => item.id === projectId);
  if (!project) return null;
  const value = project.referenceAid ?? DEFAULT_REFERENCE_AID;
  const inpaint = project.mode === 'reference';
  // 인페인트에서는 캐릭터 레퍼런스를 고를 수 없어, 골라 두었어도 없음으로 보인다.
  const kind = projectAid(project)?.kind ?? 'none';
  const patch = (next: Partial<ReferenceAid>) =>
    updateProject(project.id, (current) => ({
      ...current,
      referenceAid: { ...(current.referenceAid ?? DEFAULT_REFERENCE_AID), ...next },
    }));
  const preset = library.presets.find((item) => item.id === project.presetId);
  const reference = library.references.find((item) => item.id === project.referenceId);
  const wrongModel = kind !== 'none' && preset && !supportsReferenceAid(preset.generation.model);
  const sharedWith = preset ? projectsUsing(library, 'preset', preset.id).length - 1 : 0;

  return (
    <Modal title="참고 방식" onClose={close} footer={<button onClick={close}>닫기</button>}>
      <div className="segmented full" role="group" aria-label="참고 방식">
        {KINDS.map((item) => {
          const disabled = item.value === 'character' && inpaint;
          return (
            <button
              key={item.value}
              className={kind === item.value ? 'active blue' : ''}
              aria-pressed={kind === item.value}
              disabled={disabled}
              title={disabled ? '캐릭터 레퍼런스는 일반 생성에서 씁니다' : undefined}
              onClick={() => patch({ kind: item.value })}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <p className="hint">
        {kind === 'none' &&
          (inpaint
            ? '인셋만으로 그립니다. 바이브를 더하면 참고 그림의 분위기·그림체도 따라갑니다.'
            : '프롬프트로만 그립니다. 캐릭터 레퍼런스나 바이브로 참고 그림을 더할 수 있습니다.')}
        {kind === 'character' &&
          '참고 그림의 캐릭터(얼굴·머리·옷)를 따라 일반 생성 해상도로 그립니다. Opus여도 한 장에 5 Anlas가 듭니다.'}
        {kind === 'vibe' &&
          `참고 그림의 분위기·그림체를 따라갑니다${inpaint ? '(인셋과 함께)' : ''}. 처음 한 번 인코딩에 2 Anlas가 들고, 같은 그림·모델이면 다시 씁니다.`}
      </p>
      {kind === 'character' && (
        <div className="two-column-fields">
          <NumberField
            label="충실도 (Fidelity)"
            value={value.fidelity}
            min={0}
            max={1}
            step={0.05}
            onChange={(fidelity) => patch({ fidelity })}
          />
          <Toggle
            label="그림체도 따라가기 (Style Aware)"
            checked={value.styleAware}
            onChange={(styleAware) => patch({ styleAware })}
          />
        </div>
      )}
      {kind === 'vibe' && (
        <div className="two-column-fields">
          <NumberField
            label="세기 (Strength)"
            value={value.vibeStrength}
            min={0}
            max={1}
            step={0.05}
            onChange={(vibeStrength) => patch({ vibeStrength })}
          />
          <NumberField
            label="정보 추출 (Information Extracted)"
            value={value.vibeInformation}
            min={0}
            max={1}
            step={0.05}
            onChange={(vibeInformation) => patch({ vibeInformation })}
          />
        </div>
      )}
      {kind === 'vibe' && (
        <p className="hint">정보 추출 값을 바꾸면 다시 인코딩해 2 Anlas가 듭니다.</p>
      )}
      {kind !== 'none' && (
        <div className="aid-source">
          {reference?.image ? (
            <img
              src={referenceMedia(reference.id, reference.image.originalFile, reference.updatedAt)}
              alt=""
            />
          ) : (
            <span className="aid-source-empty" />
          )}
          <span className="hint">
            {reference?.image
              ? `참고 그림: 인페인트 항목 「${reference.name}」의 원본 그림`
              : '참고 그림이 없습니다. 구성 막대의 참고 그림 칩에서 그림이 있는 인페인트 항목을 고르십시오.'}
          </span>
        </div>
      )}
      {wrongModel && (
        <div className="warning-box">
          캐릭터 레퍼런스와 바이브는 V4.5 모델에서만 됩니다(V5로 보내면 실패합니다). 지금 생성 설정
          「{preset.name}」의 모델은 {modelLabel(preset.generation.model)}입니다.
          <div className="aid-model-fix">
            <button
              onClick={() =>
                updateLibrary((current) =>
                  patchItem(current, 'presets', preset.id, (item) => ({
                    ...item,
                    generation: { ...item.generation, model: V45_MODEL },
                  })),
                )
              }
            >
              {modelLabel(V45_MODEL)}로 바꾸기
            </button>
            {sharedWith > 0 && (
              <span className="hint">
                이 생성 설정을 쓰는 다른 작업 {sharedWith}개에도 반영됩니다.
              </span>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
