import type { AppSettings, ThemeId, ThemeMode } from '../../../core/domain/types';
import { confirmDialog } from '../../components/dialogStack';
import { Card, SelectField } from '../../components/ui';
import { resetLayout } from '../../layout';
import { resetPanelWidths } from '../../panelWidths';
import { resetSidebarSections, toast, useLibrary } from '../../store';
import { MODE_LABELS, THEMES, themeSwatch } from '../../theme';
import { EdgePeekToggle, FocusLevelGrid, SimpleUiGrid, UiToggles } from './FocusSettings';
import { patchLayout, patchSettings } from './patchSettings';

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
      <Card title="집중 모드 (Tab)">
        <FocusLevelGrid />
      </Card>
      <Card title="UI 간소화">
        <SimpleUiGrid />
      </Card>
      <Card title="화면 요소">
        <UiToggles />
      </Card>
      <Card title="숨긴 패널">
        <EdgePeekToggle />
      </Card>
      <Card title="씬 상세 조합 프롬프트">
        <SelectField
          label="칸을 열 때 펼쳐 둘 후보"
          value={layout.comboOptions}
          options={[
            { value: 'first', label: '첫 후보만' },
            { value: 'all', label: '모두' },
            { value: 'none', label: '모두 접기' },
          ]}
          onChange={(comboOptions) => patchLayout({ comboOptions })}
        />
      </Card>
      <Card title="화면 배치">
        <div>
          <button onClick={() => void resetScreenLayout()}>화면 배치 초기화</button>
        </div>
      </Card>
    </>
  );
}

async function resetScreenLayout(): Promise<void> {
  const ok = await confirmDialog({
    title: '화면 배치 초기화',
    message: (
      <p>
        숨긴 패널과 설정 줄을 모두 펼치고, 패널 폭·사이드바 구역 접기·떠 있는 창 위치를 처음 상태로
        되돌립니다.
      </p>
    ),
    confirmLabel: '초기화',
  });
  if (!ok) return;
  resetLayout();
  resetPanelWidths();
  resetSidebarSections();
  toast('화면 배치를 초기화했습니다.');
}
