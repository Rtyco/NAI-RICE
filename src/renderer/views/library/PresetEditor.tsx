import type {
  EmotionPosition,
  GenerationSettings,
  Preset,
  QualityLevel,
  ReferenceInsetPosition,
  UcPresetId,
} from '../../../core/domain/types';
import { patchItem } from '../../../core/model/mutations';
import {
  addsAutoNsfw,
  NAI_MODELS,
  modelInfo,
  modelLabel,
  naiTagText,
  QUALITY_LEVEL_LABELS,
  qualityLevelsFor,
  UC_PRESET_LABELS,
  ucPresetsFor,
} from '../../../core/providers/NaiModels';
import { Card, NumberField, PromptField, SelectField, Toggle } from '../../components/ui';
import { toast, updateLibrary } from '../../store';

const INSET_POSITIONS: Record<ReferenceInsetPosition, string> = {
  'common-start': '공통 포지티브 맨 앞',
  'common-end': '공통 포지티브 맨 끝',
  'character-start': '캐릭터 프롬프트 맨 앞 (성별 태그 뒤)',
  'character-end': '캐릭터 프롬프트 맨 끝',
};

const EMOTION_POSITIONS: Record<EmotionPosition, string> = {
  'character-end': '캐릭터 프롬프트 맨 끝',
  'common-end': '공통 포지티브 맨 끝',
};

const SAMPLERS = [
  'k_euler_ancestral',
  'k_euler',
  'k_dpmpp_2m',
  'k_dpmpp_2m_sde',
  'k_dpmpp_2s_ancestral',
  'k_dpmpp_sde',
];

export function PresetEditor({ preset }: { preset: Preset }) {
  const patch = (value: Partial<Omit<Preset, 'id'>>) =>
    updateLibrary((library) =>
      patchItem(library, 'presets', preset.id, (item) => ({ ...item, ...value })),
    );
  const setting = (value: Partial<GenerationSettings>) =>
    patch({ generation: { ...preset.generation, ...value } });
  const g = preset.generation;
  const model = modelInfo(g.model);
  const isV5 = model?.generation === 'v5';
  const isV3 = model?.generation === 'v3';
  const levels = qualityLevelsFor(g.model);
  const ucPresets = ucPresetsFor(g.model);
  const tagText = naiTagText(g.model, g);
  const autoNsfw = addsAutoNsfw(g.model, g.ucPreset);

  // 모델을 바꿀 때 새 모델에 없는 품질 태그 단계·UC 프리셋은 쓸 수 있는 값으로 맞춘다.
  const changeModel = (next: string) => {
    const value: Partial<GenerationSettings> = { model: next };
    const changed: string[] = [];
    if (!qualityLevelsFor(next).includes(g.qualityLevel)) {
      value.qualityLevel = 'standard';
      if (g.qualityTags) changed.push('품질 태그 Light → Standard');
    }
    if (!ucPresetsFor(next).includes(g.ucPreset)) {
      value.ucPreset = 'none';
      changed.push(`UC 프리셋 ${UC_PRESET_LABELS[g.ucPreset]} → 없음`);
    }
    setting(value);
    if (changed.length)
      toast(`${modelLabel(next)}에는 없는 값이라 바꿨습니다: ${changed.join(', ')}`);
  };

  return (
    <>
      <Card title="공통 프롬프트" subtitle="">
        <div className="two-column">
          <PromptField
            label="공통 포지티브"
            hint={
              g.referenceInset && g.referenceInsetPosition.startsWith('common')
                ? 'reference inset 자동 추가'
                : undefined
            }
            value={preset.commonPositive}
            rows={5}
            placeholder="화풍, 품질 등 모든 캐릭터에 공통으로 쓸 태그"
            onChange={(commonPositive) => patch({ commonPositive })}
          />
          <PromptField
            label="공통 네거티브"
            tone="negative"
            value={preset.commonNegative}
            rows={5}
            onChange={(commonNegative) => patch({ commonNegative })}
          />
        </div>
        <div className="inset-row">
          <Toggle
            label="reference inset 자동 추가"
            checked={g.referenceInset}
            onChange={(referenceInset) => setting({ referenceInset })}
          />
          <SelectField
            label="넣을 위치"
            value={g.referenceInsetPosition}
            options={(Object.keys(INSET_POSITIONS) as ReferenceInsetPosition[]).map((value) => ({
              value,
              label: INSET_POSITIONS[value],
            }))}
            onChange={(referenceInsetPosition) => setting({ referenceInsetPosition })}
          />
        </div>
        <p className="hint">
          {!g.referenceInset
            ? '넣지 않음'
            : [
                g.referenceInsetPosition === 'character-start' && '성별 태그(girl, 1girl 등) 바로 뒤',
                g.referenceInsetPosition === 'common-end' && '품질 태그를 켰다면 그 바로 앞',
                '프롬프트에 직접 쓴 reference inset이 있으면 추가하지 않습니다',
              ]
                .filter(Boolean)
                .join(' · ')}
        </p>
        <div className="inset-row">
          <span className="inset-label">감정 프롬프트</span>
          <SelectField
            label="붙일 위치"
            value={g.emotionPosition}
            options={(Object.keys(EMOTION_POSITIONS) as EmotionPosition[]).map((value) => ({
              value,
              label: EMOTION_POSITIONS[value],
            }))}
            onChange={(emotionPosition) => setting({ emotionPosition })}
          />
        </div>
        {g.emotionPosition === 'character-end' && (
          <p className="hint">V4 이상에서 그 캐릭터에만 적용</p>
        )}
      </Card>

      <Card title="모델" subtitle="품질 태그·UC 프리셋 문구는 모델에 따라 달라집니다">
        <SelectField
          label="모델"
          value={g.model}
          options={NAI_MODELS.map((item) => ({
            value: item.id,
            label: `${item.label} Inpainting`,
          }))}
          onChange={changeModel}
        />
        {isV3 && <p className="hint">V3: 캐릭터 프롬프트를 공통 프롬프트 뒤에 합쳐 보냅니다</p>}
        {isV5 && (
          <p className="hint">V5: Noise Schedule karras 고정 · 무료 할당량(%)을 먼저 씁니다</p>
        )}
      </Card>

      <Card title="품질 태그 · UC 프리셋" subtitle="">
        <div className="tag-row">
          <SelectField
            label="Quality Tags (공통 포지티브 끝에 추가)"
            value={g.qualityTags ? g.qualityLevel : 'off'}
            options={[
              { value: 'off', label: '끄기' },
              ...(Object.keys(QUALITY_LEVEL_LABELS) as QualityLevel[]).map((level) => ({
                value: level,
                label: levels.includes(level)
                  ? QUALITY_LEVEL_LABELS[level]
                  : `${QUALITY_LEVEL_LABELS[level]} (V5 전용)`,
                disabled: !levels.includes(level),
              })),
            ]}
            onChange={(value) =>
              setting(
                value === 'off'
                  ? { qualityTags: false }
                  : { qualityTags: true, qualityLevel: value },
              )
            }
          />
          <SelectField
            label="UC 프리셋 (공통 네거티브 앞에 추가)"
            value={g.ucPreset}
            options={(Object.keys(UC_PRESET_LABELS) as UcPresetId[]).map((value) => ({
              value,
              label: ucPresets.includes(value)
                ? UC_PRESET_LABELS[value]
                : `${UC_PRESET_LABELS[value]} (이 모델에 없음)`,
              disabled: !ucPresets.includes(value),
            }))}
            onChange={(ucPreset) => setting({ ucPreset })}
          />
        </div>
        {(tagText.quality || tagText.uc) && (
          <div className="tag-preview">
            {tagText.quality && (
              <p>
                <span>추가되는 품질 태그</span>
                <code>{tagText.quality}</code>
              </p>
            )}
            {tagText.uc && (
              <p className="negative">
                <span>추가되는 UC</span>
                <code>{autoNsfw ? `nsfw, ${tagText.uc}` : tagText.uc}</code>
              </p>
            )}
            {autoNsfw && (
              <p>
                <span />
                <small>포지티브에 nsfw가 없을 때만 nsfw를 붙입니다. NovelAI 웹과 같습니다.</small>
              </p>
            )}
          </div>
        )}
      </Card>

      <Card title="샘플링" subtitle="">
        <div className="four-column-fields">
          <NumberField
            label="Steps"
            value={g.steps}
            min={1}
            max={model?.maxSteps ?? 50}
            integer
            onChange={(steps) => setting({ steps })}
          />
          <NumberField
            label="Prompt Guidance"
            value={g.promptGuidance}
            min={0}
            max={model?.maxScale ?? 10}
            step={0.1}
            onChange={(promptGuidance) => setting({ promptGuidance })}
          />
          <NumberField
            label="CFG Rescale"
            value={g.cfgRescale}
            min={0}
            max={1}
            step={0.02}
            onChange={(cfgRescale) => setting({ cfgRescale })}
          />
          <NumberField
            label="Inpaint Strength"
            value={g.inpaintStrength}
            min={0}
            max={1}
            step={0.05}
            onChange={(inpaintStrength) => setting({ inpaintStrength })}
          />
        </div>
        <div className="four-column-fields">
          <SelectField
            label="Sampler"
            value={g.sampler}
            options={(SAMPLERS.includes(g.sampler) ? SAMPLERS : [g.sampler, ...SAMPLERS]).map(
              (value) => ({ value, label: value }),
            )}
            onChange={(sampler) => setting({ sampler })}
          />
          <SelectField
            label="Noise Schedule"
            value={isV5 ? 'karras' : g.noiseSchedule}
            options={['karras', 'exponential', 'polyexponential', ...(isV3 ? ['native'] : [])].map(
              (value) => ({ value, label: value }),
            )}
            onChange={(noiseSchedule) => setting({ noiseSchedule })}
          />
        </div>
        {g.steps > 28 && (
          <p className="field-error">Steps가 28을 넘으면 Opus 구독에서도 Anlas가 사용됩니다.</p>
        )}
      </Card>

      <Card title="Seed · 생성 수" subtitle="">
        <div className="four-column-fields">
          <SelectField
            label="Seed 방식"
            value={g.seedMode}
            options={[
              { value: 'random-per-job', label: '작업별 무작위' },
              { value: 'fixed', label: '고정 (변형마다 +1)' },
            ]}
            onChange={(seedMode) => setting({ seedMode })}
          />
          {g.seedMode === 'fixed' ? (
            <NumberField
              label="Seed"
              value={g.fixedSeed ?? 0}
              min={0}
              max={4294967295}
              integer
              onChange={(fixedSeed) => setting({ fixedSeed })}
            />
          ) : (
            <span />
          )}
          <NumberField
            label="감정별 생성 수"
            value={g.variantsPerEmotion}
            min={1}
            max={20}
            integer
            onChange={(variantsPerEmotion) => setting({ variantsPerEmotion })}
          />
        </div>
      </Card>
    </>
  );
}
