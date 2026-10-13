import { useState } from 'react';
import { Modal } from '../components/Dialogs';
import { Icon, type IconName } from '../components/Icon';
import { setSettingsOpen, useStore } from '../store';
import { AccountTab } from './settings/AccountTab';
import { AppearanceTab } from './settings/AppearanceTab';
import { InfoTab } from './settings/InfoTab';
import { OutputTab } from './settings/OutputTab';
import { ShortcutsTab } from './settings/ShortcutsTab';
import { StorageTab } from './settings/StorageTab';
import { TagsTab } from './settings/TagsTab';

type Tab = 'account' | 'output' | 'tags' | 'appearance' | 'storage' | 'keys' | 'info';

const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'account', label: 'NovelAI 계정 · 요청', icon: 'account' },
  { id: 'output', label: '결과 · 내보내기', icon: 'output' },
  { id: 'tags', label: '태그', icon: 'tag' },
  { id: 'appearance', label: '화면 · 테마', icon: 'palette' },
  { id: 'storage', label: '저장 공간 · 백업', icon: 'storage' },
  { id: 'keys', label: '단축키', icon: 'keyboard' },
  { id: 'info', label: '정보 · 업데이트', icon: 'info' },
];

export function SettingsModal() {
  const [tab, setTab] = useState<Tab>(() => {
    const initial = useStore.getState().settingsTab;
    return TABS.find((item) => item.id === initial)?.id ?? 'account';
  });
  return (
    <Modal title="프로그램 설정" onClose={() => setSettingsOpen(false)} wide>
      <div className="settings-layout">
        <nav className="settings-tabs">
          {TABS.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? 'active' : ''}
              onClick={() => setTab(item.id)}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'account' && <AccountTab />}
          {tab === 'output' && <OutputTab />}
          {tab === 'tags' && <TagsTab />}
          {tab === 'storage' && <StorageTab />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'keys' && <ShortcutsTab />}
          {tab === 'info' && <InfoTab />}
        </div>
      </div>
    </Modal>
  );
}
