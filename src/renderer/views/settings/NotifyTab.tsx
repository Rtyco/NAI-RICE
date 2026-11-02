import type { AppSettings } from '../../../core/domain/types';
import { Card, NumberField, SelectField, Toggle } from '../../components/ui';
import { useLibrary } from '../../store';
import { patchSettings } from './patchSettings';

type NotifyKey =
  'notifyWhenDone' | 'flashWhenDone' | 'taskbarProgress' | 'confirmResultDelete' | 'notifyEnqueued';

function NotifyToggle(props: { label: string; setting: NotifyKey; settings: AppSettings }) {
  return (
    <Toggle
      label={props.label}
      checked={props.settings[props.setting]}
      onChange={(value) => patchSettings((current) => ({ ...current, [props.setting]: value }))}
    />
  );
}

function AnlasConfirmFields({ rule }: { rule: AppSettings['anlasConfirm'] }) {
  const patch = (value: Partial<typeof rule>) =>
    patchSettings((current) => ({
      ...current,
      anlasConfirm: { ...current.anlasConfirm, ...value },
    }));
  return (
    <div className="four-column-fields">
      <SelectField
        label="Anlas 사용 확인"
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
  );
}

export function NotifyTab() {
  const settings = useLibrary().settings;
  return (
    <>
      <Card title="생성 완료 알림 (창이 뒤에 있을 때)">
        <NotifyToggle label="Windows 알림" setting="notifyWhenDone" settings={settings} />
        <NotifyToggle
          label="작업 표시줄 아이콘 깜박임"
          setting="flashWhenDone"
          settings={settings}
        />
      </Card>
      <Card title="생성 진행">
        <NotifyToggle
          label="작업 표시줄 아이콘에 진행률 표시"
          setting="taskbarProgress"
          settings={settings}
        />
      </Card>
      <Card title="확인 창">
        <AnlasConfirmFields rule={settings.anlasConfirm} />
        <NotifyToggle
          label="생성 결과 삭제 확인 (휴지통으로 이동)"
          setting="confirmResultDelete"
          settings={settings}
        />
      </Card>
      <Card title="안내">
        <NotifyToggle label="생성 큐 등록 알림" setting="notifyEnqueued" settings={settings} />
        <Toggle
          label="업데이트 후 바뀐 점 표시"
          checked={settings.update.showWhatsNew}
          onChange={(showWhatsNew) =>
            patchSettings((current) => ({
              ...current,
              update: { ...current.update, showWhatsNew },
            }))
          }
        />
      </Card>
    </>
  );
}
