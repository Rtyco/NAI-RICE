import type { FocusLevel } from '../../../core/domain/types';
import { Toggle } from '../../components/ui';
import { FOCUS_PARTS } from '../../layout';
import { useLibrary } from '../../store';
import { useUiOption, type UiOption } from '../../uiOptions';
import { FocusPreview } from './FocusPreview';
import { patchLayout } from './patchSettings';
import { SimplePreview } from './SimplePreview';

const FOCUS_LEVELS: Array<{ id: FocusLevel; label: string; detail: string }> = [
  { id: 'panels', label: '패널만 (기본)', detail: '사이드바·왼쪽 패널·히스토리' },
  { id: 'inputs', label: '입력 패널까지', detail: '+ 설정 줄·입력 패널' },
  { id: 'all', label: '모두', detail: '+ 생성 큐 막대' },
];

export function FocusLevelGrid() {
  const focusLevel = useLibrary().settings.layout.focusLevel;
  return (
    <div className="focus-level-grid">
      {FOCUS_LEVELS.map((level) => (
        <button
          key={level.id}
          className={`focus-level-card ${focusLevel === level.id ? 'active' : ''}`}
          aria-pressed={focusLevel === level.id}
          onClick={() => patchLayout({ focusLevel: level.id })}
        >
          <FocusPreview hidden={FOCUS_PARTS[level.id]} />
          <b>{level.label}</b>
          <small>{level.detail}</small>
        </button>
      ))}
    </div>
  );
}

export function EdgePeekToggle() {
  const edgePeek = useLibrary().settings.layout.edgePeek;
  return (
    <Toggle
      label="창 가장자리에 마우스를 대면 숨긴 패널 보이기"
      checked={edgePeek}
      onChange={(value) => patchLayout({ edgePeek: value })}
    />
  );
}

const SIMPLE_MODES: Array<{ simple: boolean; label: string; detail: string }> = [
  { simple: false, label: '기본', detail: '아이콘·이름·값 (창이 좁으면 줄임)' },
  { simple: true, label: '간소화', detail: '설정 줄·생성 큐 막대 버튼·모드 이름을 아이콘만' },
];

export function SimpleUiGrid() {
  const simpleUi = useUiOption('simpleUi');
  return (
    <div className="focus-level-grid two">
      {SIMPLE_MODES.map((mode) => (
        <button
          key={mode.label}
          className={`focus-level-card ${simpleUi === mode.simple ? 'active' : ''}`}
          aria-pressed={simpleUi === mode.simple}
          onClick={() => patchLayout({ simpleUi: mode.simple })}
        >
          <SimplePreview simple={mode.simple} />
          <b>{mode.label}</b>
          <small>{mode.detail}</small>
        </button>
      ))}
    </div>
  );
}

const UI_TOGGLES: Array<{ key: Exclude<UiOption, 'simpleUi'>; label: string }> = [
  { key: 'chipEdit', label: '설정 줄 칩 옆 편집 버튼' },
  { key: 'chipNames', label: '설정 줄 칩 이름 (자리가 있을 때)' },
  { key: 'chipWrap', label: '설정 줄이 넘치면 다음 줄로 넘기기 (한 줄로 줄이지 않음)' },
  { key: 'mediumFold', label: '창이 1280px보다 좁으면 히스토리를 접고 사이드바를 아이콘만 남기기' },
  { key: 'narrowOverlay', label: '좁은 창(960px 아래)에서 다시 연 패널을 이미지 위에 겹쳐 열기' },
];

function UiToggle({ option, label }: { option: UiOption; label: string }) {
  const checked = useUiOption(option);
  return (
    <Toggle
      label={label}
      checked={checked}
      onChange={(value) => patchLayout({ [option]: value })}
    />
  );
}

export function UiToggles() {
  return (
    <>
      {UI_TOGGLES.map((item) => (
        <UiToggle key={item.key} option={item.key} label={item.label} />
      ))}
    </>
  );
}
