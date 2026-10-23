import type { AppSettings, FocusLevel, ThemeId, ThemeMode } from '../../../core/domain/types';
import { Card, Toggle } from '../../components/ui';
import { FOCUS_PARTS } from '../../layout';
import { useLibrary } from '../../store';
import { MODE_LABELS, THEMES, themeSwatch } from '../../theme';
import { FocusPreview } from './FocusPreview';
import { patchSettings } from './patchSettings';

const FOCUS_LEVELS: Array<{ id: FocusLevel; label: string; detail: string }> = [
  { id: 'panels', label: '패널만 (기본)', detail: '사이드바·왼쪽 패널·히스토리' },
  { id: 'inputs', label: '입력 패널까지', detail: '+ 설정 줄·입력 패널' },
  { id: 'all', label: '모두', detail: '+ 생성 큐 막대' },
];

function FocusCard() {
  const layout = useLibrary().settings.layout;
  return (
    <Card title="집중 모드 (Tab)">
      <div className="focus-level-grid">
        {FOCUS_LEVELS.map((level) => (
          <button
            key={level.id}
            className={`focus-level-card ${layout.focusLevel === level.id ? 'active' : ''}`}
            aria-pressed={layout.focusLevel === level.id}
            onClick={() =>
              patchSettings((current) => ({
                ...current,
                layout: { ...current.layout, focusLevel: level.id },
              }))
            }
          >
            <FocusPreview hidden={FOCUS_PARTS[level.id]} />
            <b>{level.label}</b>
            <small>{level.detail}</small>
          </button>
        ))}
      </div>
    </Card>
  );
}

export function AppearanceTab() {
  const { appearance, layout } = useLibrary().settings;
  const set = (value: Partial<AppSettings['appearance']>) =>
    patchSettings((current) => ({ ...current, appearance: { ...current.appearance, ...value } }));
  const preview =
    appearance.mode === 'light' ? 'light' : appearance.mode === 'dark' ? 'dark' : undefined;
  return (
    <>
      <Card title="밝기">
        <div className="segmented">
          {(Object.keys(MODE_LABELS) as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              className={appearance.mode === mode ? 'active' : ''}
              onClick={() => set({ mode })}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </Card>
      <Card title="색상 프리셋">
        <div className="theme-grid">
          {(Object.keys(THEMES) as ThemeId[]).map((id) => {
            const swatch = themeSwatch(
              id,
              preview ?? (document.documentElement.dataset.mode === 'light' ? 'light' : 'dark'),
            );
            return (
              <button
                key={id}
                className={`theme-card ${appearance.theme === id ? 'active' : ''}`}
                onClick={() => set({ theme: id })}
              >
                <span className="theme-swatch" style={{ background: swatch.background }}>
                  <span style={{ background: swatch.surface }} />
                  <span style={{ background: swatch.accent }} />
                  <i style={{ color: swatch.text }}>Aa</i>
                </span>
                <b>{THEMES[id].label}</b>
              </button>
            );
          })}
        </div>
      </Card>
      <FocusCard />
      <Card title="숨긴 패널">
        <Toggle
          label="창 가장자리에 마우스를 대면 숨긴 패널 보이기"
          checked={layout.edgePeek}
          onChange={(edgePeek) =>
            patchSettings((current) => ({ ...current, layout: { ...current.layout, edgePeek } }))
          }
        />
      </Card>
    </>
  );
}
