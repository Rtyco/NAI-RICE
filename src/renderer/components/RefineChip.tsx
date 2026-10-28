import { useState, type ReactNode } from 'react';
import type { Project, RefinePrompt, RefineSettings } from '../../core/domain/types';
import { autoLineFixOn, lineFixSummary } from '../../core/model/lineFix';
import { refineShortSummary, refineSummary } from '../../core/model/refine';
import type { RefineTarget } from '../refineTargets';
import { updateProject, useStore } from '../store';
import { ChecklistChip } from './ChainChip';
import { Modal } from './Dialogs';
import { openDialog } from './dialogStack';
import { Icon, type IconName } from './Icon';
import { LineFixSettingsDialog } from './LineFixDialog';
import { RefineFields } from './RefineFields';

function RefineSettingsDialog(props: { target: RefineTarget; close: () => void }) {
  const [value, setValue] = useState(props.target.settings);
  const save = () => {
    props.target.save(value);
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
      <RefineFields value={value} sources={[props.target.source]} onChange={setValue} />
      <p className="hint">{props.target.savedIn}의 다듬기 설정으로 저장됩니다.</p>
    </Modal>
  );
}

const PROMPT_ICONS: Record<RefinePrompt, IconName | undefined> = {
  source: undefined,
  'negative-only': 'prompt-negative',
  empty: 'empty',
  custom: 'text',
};

function openRefineSettings(target: RefineTarget): void {
  void openDialog((close) => <RefineSettingsDialog target={target} close={close} />);
}

function openLineFixSettings(): void {
  void openDialog((close) => <LineFixSettingsDialog close={close} />);
}

type LineFixProject = Pick<Project, 'id' | 'mode' | 'autoLineFix'>;

const setAutoLineFix = (project: LineFixProject, autoLineFix: boolean) =>
  updateProject(project.id, (current) => ({ ...current, autoLineFix }));

function RefineValue({ settings, iconClass }: { settings: RefineSettings; iconClass: string }) {
  const promptIcon = PROMPT_ICONS[settings.prompt];
  return (
    <>
      {refineShortSummary(settings)}
      {promptIcon && <Icon name={promptIcon} size={13} className={iconClass} />}
    </>
  );
}

export function RefineChip({ target }: { target: RefineTarget }) {
  const { settings, on } = target;
  return (
    <ChecklistChip
      label={{ text: '자동 다듬기', icon: 'upscale', usage: `${target.savedIn}에 저장` }}
      value={on ? refineSummary(settings) : '끔'}
      display={on ? <RefineValue settings={settings} iconClass="chain-value-icon" /> : undefined}
      items={[
        { id: 'off', name: '끔' },
        {
          id: 'on',
          name: `켬 · ${refineSummary(settings)}`,
          edit: { title: '다듬기 설정', open: () => openRefineSettings(target) },
        },
      ]}
      checked={[on ? 'on' : 'off']}
      onPick={(id) => target.setOn(id === 'on')}
      edit={{ title: '다듬기 설정', open: () => openRefineSettings(target) }}
    />
  );
}

/** 작업의 설정 줄에서 생성 뒤 구분선 지우기와 다듬기를 켠다. 구분선 지우기 값은 프로그램 설정에 있다. */
export function PostProcessChip({
  target,
  project,
}: {
  target: RefineTarget;
  project: LineFixProject;
}) {
  const lineFix = useStore((state) => state.library!.settings.lineFix);
  const lineOn = autoLineFixOn(project);
  const refineOn = target.on;
  const value =
    [lineOn && '구분선 지우기', refineOn && refineSummary(target.settings)]
      .filter(Boolean)
      .join(' · ') || '끔';
  return (
    <ChecklistChip
      label={{
        text: '자동 후처리',
        icon: lineOn && !refineOn ? 'border-line' : 'upscale',
        usage: '작업에 저장',
      }}
      value={value}
      display={
        lineOn || refineOn ? (
          <>
            {lineOn && '구분선'}
            {lineOn && refineOn && ' · '}
            {refineOn && <RefineValue settings={target.settings} iconClass="chain-value-icon" />}
          </>
        ) : undefined
      }
      multi
      items={[
        {
          id: 'line',
          name: `구분선 지우기 · ${lineFixSummary(lineFix)}`,
          disabled: project.mode === 'reference' ? undefined : '인페인트 모드에서만 씁니다.',
          edit: { title: '구분선 지우기 설정', open: openLineFixSettings },
        },
        {
          id: 'refine',
          name: `다듬기 · ${refineSummary(target.settings)}`,
          edit: { title: '다듬기 설정', open: () => openRefineSettings(target) },
        },
      ]}
      checked={[...(lineOn ? ['line'] : []), ...(refineOn ? ['refine'] : [])]}
      onPick={(id) => (id === 'line' ? setAutoLineFix(project, !lineOn) : target.setOn(!refineOn))}
    />
  );
}

function AutoRow(props: {
  label: string;
  on: boolean;
  setOn: (on: boolean) => void;
  summary: string;
  value: ReactNode;
  editTitle: string;
  onEdit: () => void;
}) {
  return (
    <div className="auto-refine-row" title={props.summary}>
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={props.on}
          onChange={(event) => props.setOn(event.target.checked)}
        />
        <span>{props.label}</span>
      </label>
      <span className="auto-refine-value">{props.value}</span>
      <button
        className="icon-button"
        title={props.editTitle}
        aria-label={props.editTitle}
        onClick={props.onEdit}
      >
        <Icon name="edit" size={14} />
      </button>
    </div>
  );
}

export function AutoRefineToggle({ target }: { target: RefineTarget }) {
  return (
    <AutoRow
      label="자동 다듬기"
      on={target.on}
      setOn={target.setOn}
      summary={refineSummary(target.settings)}
      value={<RefineValue settings={target.settings} iconClass="auto-refine-icon" />}
      editTitle="다듬기 설정"
      onEdit={() => openRefineSettings(target)}
    />
  );
}

export function AutoLineFixToggle({ project }: { project: LineFixProject }) {
  const summary = lineFixSummary(useStore((state) => state.library!.settings.lineFix));
  return (
    <AutoRow
      label="자동 구분선 지우기"
      on={autoLineFixOn(project)}
      setOn={(on) => setAutoLineFix(project, on)}
      summary={summary}
      value={summary}
      editTitle="구분선 지우기 설정"
      onEdit={openLineFixSettings}
    />
  );
}
