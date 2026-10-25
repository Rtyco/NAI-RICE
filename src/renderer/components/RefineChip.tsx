import { useState } from 'react';
import type { RefinePrompt, RefineSettings } from '../../core/domain/types';
import type { ResolvedProject } from '../../core/model/defaults';
import {
  projectRefineSettings,
  refineShortSummary,
  refineSource,
  refineSummary,
} from '../../core/model/refine';
import { updateProject } from '../store';
import { ChecklistChip } from './ChainChip';
import { Modal } from './Dialogs';
import { openDialog } from './dialogStack';
import { Icon, type IconName } from './Icon';
import { RefineFields } from './RefineFields';

function RefineSettingsDialog(props: {
  projectId: string;
  initial: RefineSettings;
  source: { width: number; height: number };
  close: () => void;
}) {
  const [value, setValue] = useState(props.initial);
  const save = () => {
    updateProject(props.projectId, (current) => ({ ...current, refine: value }));
    props.close();
  };
  return (
    <Modal
      title="다듬기 설정"
      onClose={props.close}
      wide
      footer={
        <>
          <button onClick={props.close}>취소</button>
          <button className="accent" onClick={save}>
            저장
          </button>
        </>
      }
    >
      <RefineFields value={value} sources={[props.source]} onChange={setValue} />
      <p className="hint">이 작업에 저장되며 다듬기 창도 이 값으로 시작합니다.</p>
    </Modal>
  );
}

const PROMPT_ICONS: Record<RefinePrompt, IconName | undefined> = {
  source: undefined,
  'negative-only': 'prompt-negative',
  empty: 'empty',
  custom: 'pen',
};

function openRefineSettings({ project, preset, reference }: ResolvedProject): void {
  void openDialog((close) => (
    <RefineSettingsDialog
      projectId={project.id}
      initial={projectRefineSettings(project, preset, reference)}
      source={refineSource(project, preset, reference)}
      close={close}
    />
  ));
}

function setAutoRefine(projectId: string, autoRefine: boolean): void {
  updateProject(projectId, (current) => ({ ...current, autoRefine }));
}

function RefineValue({ settings, iconClass }: { settings: RefineSettings; iconClass: string }) {
  const promptIcon = PROMPT_ICONS[settings.prompt];
  return (
    <>
      {refineShortSummary(settings)}
      {promptIcon && <Icon name={promptIcon} size={13} className={iconClass} />}
    </>
  );
}

export function RefineChip({ resolved }: { resolved: ResolvedProject }) {
  const { project, preset, reference } = resolved;
  const settings = projectRefineSettings(project, preset, reference);
  return (
    <ChecklistChip
      label={{ text: '자동 다듬기', icon: 'upscale', usage: '작업에 저장' }}
      value={project.autoRefine ? refineSummary(settings) : '끔'}
      display={
        project.autoRefine ? (
          <RefineValue settings={settings} iconClass="chain-value-icon" />
        ) : undefined
      }
      items={[
        { id: 'off', name: '끔' },
        { id: 'on', name: `켬 · ${refineSummary(settings)}` },
      ]}
      checked={[project.autoRefine ? 'on' : 'off']}
      onPick={(id) => setAutoRefine(project.id, id === 'on')}
      edit={{ title: '다듬기 설정', open: () => openRefineSettings(resolved) }}
    />
  );
}

/** 생성 버튼 위. 설정 줄의 칩과 같은 값이다. */
export function AutoRefineToggle({ resolved }: { resolved: ResolvedProject }) {
  const { project, preset, reference } = resolved;
  const settings = projectRefineSettings(project, preset, reference);
  return (
    <div className="auto-refine-row" title={refineSummary(settings)}>
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={Boolean(project.autoRefine)}
          onChange={(event) => setAutoRefine(project.id, event.target.checked)}
        />
        <span>자동 다듬기</span>
      </label>
      <span className="auto-refine-value">
        <RefineValue settings={settings} iconClass="auto-refine-icon" />
      </span>
      <button
        className="icon-button"
        title="다듬기 설정"
        aria-label="다듬기 설정"
        onClick={() => openRefineSettings(resolved)}
      >
        <Icon name="edit" size={14} />
      </button>
    </div>
  );
}
