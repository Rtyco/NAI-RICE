import type { AppSettings } from '../../../core/domain/types';
import { Card, Toggle } from '../../components/ui';
import { useLibrary } from '../../store';
import { patchSettings } from './patchSettings';

type NotifyKey = 'notifyWhenDone' | 'flashWhenDone' | 'taskbarProgress';

function NotifyToggle(props: { label: string; setting: NotifyKey; settings: AppSettings }) {
  return (
    <Toggle
      label={props.label}
      checked={props.settings[props.setting]}
      onChange={(value) => patchSettings((current) => ({ ...current, [props.setting]: value }))}
    />
  );
}

export function NotifyTab() {
  const settings = useLibrary().settings;
  return (
    <>
      <Card title="창이 뒤에 있을 때 생성이 끝나면">
        <NotifyToggle label="Windows 알림" setting="notifyWhenDone" settings={settings} />
        <NotifyToggle label="작업 표시줄 깜빡임" setting="flashWhenDone" settings={settings} />
      </Card>
      <Card title="생성 중">
        <NotifyToggle
          label="작업 표시줄 아이콘에 진행 막대"
          setting="taskbarProgress"
          settings={settings}
        />
      </Card>
    </>
  );
}
