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

export function RefineChip({ resolved }: { resolved: ResolvedProject }) {
  const { project, preset, reference } = resolved;
  const settings = projectRefineSettings(project, preset, reference);
  const promptIcon = PROMPT_ICONS[settings.prompt];
  const openSettings = () =>
    void openDialog((close) => (
      <RefineSettingsDialog
        projectId={project.id}
        initial={settings}
        source={refineSource(project, preset, reference)}
        close={close}
      />
    ));
  return (
    <ChecklistChip
      label={{ text: '자동 다듬기', icon: 'upscale', usage: '작업에 저장' }}
      value={project.autoRefine ? refineSummary(settings) : '끔'}
      display={
        project.autoRefine ? (
          <>
            {refineShortSummary(settings)}
            {promptIcon && <Icon name={promptIcon} size={13} className="chain-value-icon" />}
          </>
        ) : undefined
      }
      items={[
        { id: 'off', name: '끔' },
        { id: 'on', name: `켬 · ${refineSummary(settings)}` },
      ]}
      checked={[project.autoRefine ? 'on' : 'off']}
      onPick={(id) =>
        updateProject(project.id, (current) => ({ ...current, autoRefine: id === 'on' }))
      }
      edit={{ title: '다듬기 설정', open: openSettings }}
    />
  );
}
