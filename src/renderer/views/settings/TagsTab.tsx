import { useState } from 'react';
import type { NaiTagFamily, QualityLevel, UcPresetId } from '../../../core/domain/types';
import {
  NAI_MODELS,
  NAI_TAGS,
  QUALITY_LEVEL_LABELS,
  UC_PRESET_LABELS,
} from '../../../core/providers/NaiModels';
import { Card, Toggle } from '../../components/ui';
import { useLibrary } from '../../store';
import { patchSettings } from './patchSettings';

const FAMILY_LABELS: Record<NaiTagFamily, string> = {
  v5: 'V5 Full',
  'v5-curated': 'V5 Curated',
  'v4-5-full': 'V4.5 Full',
  'v4-5-curated': 'V4.5 Curated',
  'v4-full': 'V4 Full',
  'v4-curated': 'V4 Curated',
  v3: 'Anime V3',
  'v3-furry': 'Furry V3',
};

export function TagsTab() {
  const [family, setFamily] = useState<NaiTagFamily>('v5');
  const entry = NAI_TAGS[family];
  const models = NAI_MODELS.filter((model) => model.family === family).map((model) => model.label);
  const tagAutocomplete = useLibrary().settings.tagAutocomplete;
  return (
    <>
      <Card title="태그 자동완성" subtitle="">
        <Toggle
          label="태그 후보 보이기"
          checked={tagAutocomplete}
          onChange={(value) => patchSettings((current) => ({ ...current, tagAutocomplete: value }))}
        />
        <p className="hint">
          artist:로 시작하면 작가 태그만 찾습니다. 태그 목록은 2026년 10월 기준입니다.
        </p>
      </Card>
      <Card title="품질 태그 · UC 프리셋 문구" subtitle="">
        <div className="chip-row">
          {(Object.keys(FAMILY_LABELS) as NaiTagFamily[]).map((id) => (
            <button
              key={id}
              className={`chip ${id === family ? 'active' : ''}`}
              onClick={() => setFamily(id)}
            >
              {FAMILY_LABELS[id]}
            </button>
          ))}
        </div>
        <p className="hint">적용 모델: {models.join(', ')}</p>
      </Card>
      <Card title="Quality Tags" subtitle="공통 포지티브 끝에 붙습니다.">
        {(Object.keys(QUALITY_LEVEL_LABELS) as QualityLevel[]).map((level) => (
          <TagLine key={level} label={QUALITY_LEVEL_LABELS[level]} text={entry.quality[level]} />
        ))}
      </Card>
      <Card title="UC 프리셋" subtitle="공통 네거티브 앞에 붙습니다.">
        {(Object.keys(UC_PRESET_LABELS) as UcPresetId[])
          .filter((id) => id !== 'none')
          .map((id) => (
            <TagLine
              key={id}
              label={UC_PRESET_LABELS[id]}
              text={entry.uc[id as Exclude<UcPresetId, 'none'>]}
              negative
            />
          ))}
      </Card>
    </>
  );
}

function TagLine({ label, text, negative }: { label: string; text?: string; negative?: boolean }) {
  return (
    <div className={`tag-line ${text ? '' : 'unsupported'}`}>
      <b>{label}</b>
      {text ? (
        <pre className={`prompt-code small ${negative ? 'negative' : ''}`}>{text}</pre>
      ) : (
        <span className="hint">이 모델에서는 지원하지 않습니다 (선택 불가)</span>
      )}
    </div>
  );
}
