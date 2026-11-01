import type { AppSettings } from '../../../core/domain/types';
import { Card, NumberField, SelectField, Toggle } from '../../components/ui';
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

function AnlasConfirmCard() {
  const rule = useLibrary().settings.anlasConfirm;
  const patch = (value: Partial<typeof rule>) =>
    patchSettings((current) => ({
      ...current,
      anlasConfirm: { ...current.anlasConfirm, ...value },
    }));
  return (
    <Card title="Anlas 사용 확인">
      <div className="four-column-fields">
        <SelectField
          label="생성 큐에 넣기 전에 묻기"
          value={rule.mode}
          options={[
            { value: 'any', label: 'Anlas가 들 때마다' },
            { value: 'over', label: '정한 값 이상일 때' },
            { value: 'off', label: '묻지 않음' },
          ]}
          onChange={(mode) => patch({ mode })}
        />
        {rule.mode === 'over' && (
          <NumberField
            label="기준"
            value={rule.over}
            min={1}
            max={100000}
            integer
            suffix="Anlas"
            onChange={(over) => patch({ over })}
          />
        )}
      </div>
    </Card>
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
      <AnlasConfirmCard />
    </>
  );
}
