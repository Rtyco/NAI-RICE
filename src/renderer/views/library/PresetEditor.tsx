import { useState } from 'react';
import type {
  Effort,
  EmotionPosition,
  GenerationSettings,
  Preset,
  QualityLevel,
  ReferenceInsetPosition,
  SmeaMode,
  UcPresetId,
} from '../../../core/domain/types';
import {
  CUSTOM_MAX,
  CUSTOM_MIN,
  RESOLUTION_PRESETS,
  snapDimension,
} from '../../../core/imaging/CanvasLayout';
import {
  effectiveGenerationSettings,
  normalizeGenerationSettings,
} from '../../../core/model/defaults';
import { patchItem } from '../../../core/model/mutations';
import { FREE_MAX_PIXELS } from '../../../core/providers/NaiCost';
import {
  addsAutoNsfw,
  EFFORT_LABELS,
  modelInfo,
  modelLabel,
  NAI_MODELS,
  naiTagText,
  QUALITY_LEVEL_LABELS,
  qualityLevelsFor,
  SMEA_LABELS,
  supportsEffort,
  supportsInpaint,
  UC_PRESET_LABELS,
  ucPresetsFor,
  usesMedium,
} from '../../../core/providers/NaiModels';
import { Card, NumberField, PromptField, SelectField, Toggle } from '../../components/ui';
import { PROMPT_POSITIONS } from '../../promptPositions';
import { toast, updateLibrary } from '../../store';

const INSET_POSITIONS: Record<ReferenceInsetPosition, string> = {
  'common-start': '공통 포지티브 맨 앞',
  'common-end': '공통 포지티브 맨 끝',
  'character-start': '캐릭터 프롬프트 맨 앞 (성별 태그 뒤)',
  'character-end': '캐릭터 프롬프트 맨 끝',
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
  const medium = usesMedium(g);
  // medium이면 고정값을 보인다. 저장된 값은 그대로다.
  const shown = effectiveGenerationSettings(g);
  const tagText = naiTagText(g.model, shown);
  const autoNsfw = addsAutoNsfw(g.model, shown.ucPreset);
  const unusedInMedium = medium ? 'Medium에서는 쓰이지 않음' : undefined;
  const { width, height, img2imgStrength, img2imgNoise } = normalizeGenerationSettings(g);
  const sizePreset = RESOLUTION_PRESETS.find(
    (item) => item.width === width && item.height === height,
  );
  const [customSize, setCustomSize] = useState(!sizePreset);

  // 새 모델에 없는 품질 태그 단계·UC 프리셋은 쓸 수 있는 값으로 맞춘다.
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
            hint={unusedInMedium}
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
                '인페인트 방식에만 붙습니다',
                g.referenceInsetPosition === 'character-start' && '성별 태그(girl, 1girl 등) 바로 뒤',
                g.referenceInsetPosition === 'common-end' && '품질 태그를 켰다면 그 바로 앞',
                '프롬프트에 직접 쓴 reference inset이 있으면 추가하지 않습니다',
              ]
                .filter(Boolean)
                .join(' · ')}
        </p>
        <div className="inset-row">
          <span className="inset-label">씬 프롬프트</span>
          <SelectField
            label="붙일 위치"
            value={g.emotionPosition}
            options={(['character-end', 'common-end'] as EmotionPosition[]).map((value) => ({
              value,
              label: PROMPT_POSITIONS[value],
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
            label: item.requestIds.inpaint ? item.label : `${item.label} (일반 생성 전용)`,
          }))}
          onChange={changeModel}
        />
        {!supportsInpaint(g.model) && (
          <p className="hint">인페인트 모델이 없어 인페인트 방식에는 쓸 수 없습니다</p>
        )}
        {isV3 && <p className="hint">V3: 캐릭터 프롬프트를 공통 프롬프트 뒤에 합쳐 보냅니다</p>}
        {isV5 && (
          <p className="hint">V5: Noise Schedule karras 고정 · 무료 할당량(%)을 먼저 씁니다</p>
        )}
        {supportsEffort(g.model) && (
          <>
            <div className="inset-row">
              <span className="inset-label">Effort</span>
              <div className="segmented" role="group" aria-label="Effort">
                {(Object.keys(EFFORT_LABELS) as Effort[]).map((effort) => (
                  <button
                    key={effort}
                    className={g.effort === effort ? 'active' : ''}
                    aria-pressed={g.effort === effort}
                    onClick={() => setting({ effort })}
                  >
                    {EFFORT_LABELS[effort]}
                  </button>
                ))}
              </div>
            </div>
            <p className="hint">
              {medium
                ? 'Medium: 사용량이 약 42% 적습니다 · Steps 14 · Euler Ancestral · UC Heavy 고정 · 직접 쓴 네거티브와 캐릭터 네거티브는 보내지 않습니다(빼고 싶은 것은 포지티브에 -3::hat:: 처럼 음수 강조)'
                : 'High: 지금까지의 방식입니다. Medium은 사용량이 약 42% 적고 몇 가지 설정이 고정됩니다'}
            </p>
          </>
        )}
      </Card>

      <Card title="일반 생성 · i2i" subtitle="인페인트 방식은 인페인트의 캔버스 크기를 씁니다">
        <SelectField
          label="해상도"
          value={customSize || !sizePreset ? 'custom' : sizePreset.id}
          options={[
            ...RESOLUTION_PRESETS.map((item) => ({
              value: item.id,
              label: `${item.label} (무료)`,
            })),
            { value: 'custom' as const, label: '직접 입력' },
          ]}
          onChange={(id) => {
            const preset = RESOLUTION_PRESETS.find((item) => item.id === id);
            setCustomSize(!preset);
            if (preset) setting({ width: preset.width, height: preset.height });
          }}
        />
        {(customSize || !sizePreset) && (
          <div className="two-column-fields">
            <NumberField
              label="가로"
              value={width}
              min={CUSTOM_MIN}
              max={CUSTOM_MAX}
              step={64}
              integer
              suffix="px"
              onChange={(value) => setting({ width: snapDimension(value) })}
            />
            <NumberField
              label="세로"
              value={height}
              min={CUSTOM_MIN}
              max={CUSTOM_MAX}
              step={64}
              integer
              suffix="px"
              onChange={(value) => setting({ height: snapDimension(value) })}
            />
          </div>
        )}
        {width * height > FREE_MAX_PIXELS && (
          <p className="field-error">
            {width}×{height}는 1024×1024보다 넓어 Opus 구독에서도 Anlas가 사용됩니다.
          </p>
        )}
        <div className="two-column-fields">
          <NumberField
            label="i2i 세기 (Strength)"
            value={img2imgStrength}
            min={0.01}
            max={0.99}
            step={0.05}
            onChange={(img2imgStrength) => setting({ img2imgStrength })}
          />
          <NumberField
            label="i2i 노이즈 (Noise)"
            value={img2imgNoise}
            min={0}
            max={0.99}
            step={0.05}
            onChange={(img2imgNoise) => setting({ img2imgNoise })}
          />
        </div>
        <p className="hint">
          세기가 낮을수록 원본을 많이 남깁니다. 0.3~0.5에서 얼굴과 구도가 유지됩니다.
        </p>
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
            value={shown.ucPreset}
            disabled={medium}
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
            value={shown.steps}
            disabled={medium}
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
            value={shown.cfgRescale}
            disabled={medium}
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
            value={shown.sampler}
            disabled={medium}
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
          {isV3 && (
            <SelectField
              label="SMEA (일반 생성)"
              value={g.smea}
              options={(Object.keys(SMEA_LABELS) as SmeaMode[]).map((value) => ({
                value,
                label: SMEA_LABELS[value],
              }))}
              onChange={(smea) => setting({ smea })}
            />
          )}
        </div>
        <div className="inset-row">
          {model?.varietySigma ? (
            <Toggle
              label="Variety+"
              checked={g.variety}
              onChange={(variety) => setting({ variety })}
            />
          ) : (
            <span className="inset-label">Variety+ 없음 (V5)</span>
          )}
          {isV3 && (
            <Toggle
              label="Decrisp"
              checked={g.decrisp}
              onChange={(decrisp) => setting({ decrisp })}
            />
          )}
        </div>
        <p className="hint">
          {[
            model?.varietySigma &&
              'Variety+: 구도가 잡힐 때까지 Prompt Guidance를 늦게 걸어 결과가 더 다양해집니다',
            isV3 && 'SMEA: 큰 해상도에서 형태를 안정시킵니다. 유료일 때 1.2배(DYN 1.4배)가 듭니다',
            isV3 && 'Decrisp: Guidance가 높을 때 생기는 지나친 대비를 줄입니다',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {shown.steps > 28 && (
          <p className="field-error">Steps가 28을 넘으면 Opus 구독에서도 Anlas가 사용됩니다.</p>
        )}
        {medium && (
          <p className="hint">
            Effort Medium이라 Steps·Sampler·CFG Rescale이 고정되어 있습니다. 모델 카드에서 High로
            바꾸면 원래 값으로 돌아옵니다.
          </p>
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
            label="씬별 생성 수"
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
