import { useState } from 'react';
import type { RefinePrompt, RefineSettings } from '../../core/domain/types';
import { refineShortSummary, refineSummary } from '../../core/model/refine';
import type { RefineTarget } from '../refineTargets';
import { ChecklistChip } from './ChainChip';
import { Modal } from './Dialogs';
import { openDialog } from './dialogStack';
import { Icon, type IconName } from './Icon';
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
  custom: 'pen',
};

function openRefineSettings(target: RefineTarget): void {
  void openDialog((close) => <RefineSettingsDialog target={target} close={close} />);
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

export function AutoRefineToggle({ target }: { target: RefineTarget }) {
  return (
    <div className="auto-refine-row" title={refineSummary(target.settings)}>
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={target.on}
          onChange={(event) => target.setOn(event.target.checked)}
        />
        <span>자동 다듬기</span>
      </label>
      <span className="auto-refine-value">
        <RefineValue settings={target.settings} iconClass="auto-refine-icon" />
      </span>
      <button
        className="icon-button"
        title="다듬기 설정"
        aria-label="다듬기 설정"
        onClick={() => openRefineSettings(target)}
      >
        <Icon name="edit" size={14} />
      </button>
    </div>
  );
}
