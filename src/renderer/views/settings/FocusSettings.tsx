import type { FocusLevel } from '../../../core/domain/types';
import { Toggle } from '../../components/ui';
import { FOCUS_PARTS } from '../../layout';
import { useLibrary } from '../../store';
import { FocusPreview } from './FocusPreview';
import { patchSettings } from './patchSettings';

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
  );
}

export function EdgePeekToggle() {
  const edgePeek = useLibrary().settings.layout.edgePeek;
  return (
    <Toggle
      label="창 가장자리에 마우스를 대면 숨긴 패널 보이기"
      checked={edgePeek}
      onChange={(value) =>
        patchSettings((current) => ({
          ...current,
          layout: { ...current.layout, edgePeek: value },
        }))
      }
    />
  );
}
