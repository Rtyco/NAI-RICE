import { useState } from 'react';
import type {
  AppSettings,
  NaiTagFamily,
  QualityLevel,
  ThemeId,
  ThemeMode,
  UcPresetId,
} from '../../core/domain/types';
import {
  DEFAULT_OUTPUT_FILENAME_TEMPLATE,
  OUTPUT_FILENAME_TOKENS,
  renderOutputFilename,
  validateOutputFilenameTemplate,
} from '../../core/output/OutputFilename';
import {
  NAI_MODELS,
  NAI_TAGS,
  QUALITY_LEVEL_LABELS,
  UC_PRESET_LABELS,
} from '../../core/providers/NaiModels';
import { Modal } from '../components/Dialogs';
import { Icon, type IconName } from '../components/Icon';
import { Card, NumberField, SelectField, Toggle } from '../components/ui';
import {
  run,
  setSettingsOpen,
  toast,
  updateLibrary,
  useLibrary,
  useStore,
} from '../store';
import { MODE_LABELS, THEMES, themeSwatch } from '../theme';
import { StorageTab } from './StorageTab';
import { checkForUpdate, openUpdateDialog } from '../updates';
import { accountApi } from '../desktop';

type Tab = 'account' | 'output' | 'tags' | 'appearance' | 'storage' | 'keys' | 'info';

function patchSettings(recipe: (settings: AppSettings) => AppSettings) {
  updateLibrary((library) => ({ ...library, settings: recipe(library.settings) }));
}

function RequestDelayCard() {
  const delay = useLibrary().settings.requestDelayMs;
  const setDelay = (requestDelayMs: number) =>
    patchSettings((current) => ({ ...current, requestDelayMs }));
  return (
    <Card
      title="요청 간격"
      subtitle="NovelAI 요청 사이 대기 시간 조절"
    >
      <div className="delay-row">
        <input
          type="range"
          min={0}
          max={1000}
          step={50}
          value={delay}
          aria-label="요청 간격"
          onChange={(event) => setDelay(Number(event.target.value))}
        />
        <NumberField
          label=""
          value={delay}
          min={0}
          max={1000}
          step={50}
          integer
          suffix="ms"
          onChange={setDelay}
        />
      </div>
      <p className="hint">
        0~1000ms · 다음 요청부터 적용 · 응답 시점부터 계산합니다
      </p>
    </Card>
  );
}

function AccountTab() {
  const token = useStore((state) => state.token);
  const busy = useStore((state) => state.busy);
  const [input, setInput] = useState('');
  const quota = token.v5Quota
    ? token.v5Quota.isNegative
      ? 0
      : Math.max(0, token.v5Quota.percent)
    : undefined;
  return (
    <>
      <Card
        title="NovelAI 연결"
        subtitle="Windows 보안 저장소에 암호화 · 백업에 포함되지 않습니다"
      >
        {!token.secureStorageAvailable && (
          <div className="warning-box">
            운영체제 보안 저장소를 사용할 수 없어 토큰을 저장할 수 없습니다.
          </div>
        )}
        <div className="token-row">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={input}
            placeholder={
              token.stored ? '저장됨 · 새 토큰으로 교체' : 'NovelAI Persistent API Token'
            }
            onChange={(event) => setInput(event.target.value)}
          />
          <button
            className="accent"
            disabled={!input.trim() || !token.secureStorageAvailable || Boolean(busy)}
            onClick={() =>
              void run('토큰을 검증하는 중', async () => {
                const status = await accountApi().saveAndValidateToken(input);
                useStore.setState({ token: status });
                setInput('');
                toast(status.message ?? '토큰을 저장했습니다.');
              })
            }
          >
            검증 후 저장
          </button>
          <button
            className="danger-quiet"
            disabled={!token.stored || Boolean(busy)}
            onClick={() =>
              void run('토큰을 삭제하는 중', async () =>
                useStore.setState({ token: await accountApi().removeToken() }),
              )
            }
          >
            삭제
          </button>
        </div>
      </Card>

      <Card
        title="계정 상태"
        subtitle="생성 시와 1분마다 조회됩니다"
        actions={
          <button
            className="with-icon"
            disabled={!token.stored || Boolean(busy)}
            onClick={() =>
              void run('계정 상태를 확인하는 중', async () =>
                useStore.setState({ token: await accountApi().validateStoredToken() }),
              )
            }
          >
            <Icon name="refresh" /> 새로고침
          </button>
        }
      >
        <div className="account-cards">
          <div className="account-card">
            <span>상태</span>
            <strong>{token.valid ? '연결됨' : token.stored ? '토큰 저장됨' : '미설정'}</strong>
            <small>
              {token.checkedAt
                ? `조회 ${new Date(token.checkedAt).toLocaleTimeString()}`
                : (token.message ?? '')}
            </small>
          </div>
          <div className="account-card">
            <span>보유 Anlas</span>
            <strong>{token.anlas?.toLocaleString() ?? '—'}</strong>
          </div>
          <div className="account-card">
            <span>V5 무료 생성 할당량</span>
            <strong>{quota === undefined ? '미확인' : `${quota}%`}</strong>
            <div className="quota-track">
              <span style={{ width: `${Math.min(100, quota ?? 0)}%` }} />
            </div>
          </div>
        </div>
      </Card>

      <RequestDelayCard />

      <Card title="Anlas가 차감되는 경우">
        <p>
          • 캔버스 1024×1024 초과 또는 Steps 28 초과 (모든 모델) — 생성 전 확인
        </p>
        <p>• V5 무료 할당량(%) 소진 후</p>
        <p className="hint">
          실제 차감량은 큐와 결과의 "생성 정보"에 표시됩니다
        </p>
      </Card>
    </>
  );
}

function OutputTab() {
  const settings = useLibrary().settings;
  const template = settings.outputFilenameTemplate;
  const error = validateOutputFilenameTemplate(template);
  const preview = error
    ? ''
    : renderOutputFilename(template, {
        character: '아리아',
        emotion: '기쁨',
        emotionId: 'a1b2c3d4',
        variant: 1,
        seed: 1669366302,
        model: 'nai-diffusion-4-5-full-inpainting',
        createdAt: new Date().toISOString(),
      });
  const setTemplate = (value: string) =>
    patchSettings((current) => ({ ...current, outputFilenameTemplate: value }));
  const setExport = (value: Partial<AppSettings['export']>) =>
    patchSettings((current) => ({ ...current, export: { ...current.export, ...value } }));
  return (
    <>
      <Card title="결과 파일" subtitle="작업 폴더의 outputs/<감정 이름>/에 저장됩니다">
        <label className="stack-field">
          파일명 규칙
          <input
            className="template-input"
            value={template}
            spellCheck={false}
            onChange={(event) => setTemplate(event.target.value)}
          />
        </label>
        <div className="token-picker">
          {OUTPUT_FILENAME_TOKENS.map((token) => (
            <button key={token} type="button" onClick={() => setTemplate(`${template}${token}`)}>
              {token}
            </button>
          ))}
          <button
            type="button"
            className="link-button"
            onClick={() => setTemplate(DEFAULT_OUTPUT_FILENAME_TEMPLATE)}
          >
            기본값
          </button>
        </div>
        {error ? (
          <p className="field-error">{error}</p>
        ) : (
          <p className="hint">
            미리보기: <code>{preview}.png</code>
          </p>
        )}
        <Toggle
          label="전체 생성 캔버스를 diagnostic 폴더에 보관"
          checked={settings.keepDiagnosticCanvas}
          onChange={(keepDiagnosticCanvas) =>
            patchSettings((current) => ({ ...current, keepDiagnosticCanvas }))
          }
        />
      </Card>
      <Card title="내보내기 기본값" subtitle="">
        <div className="four-column-fields three">
          <SelectField
            label="형식"
            value={settings.export.format}
            options={[
              { value: 'png', label: 'PNG (메타데이터 유지)' },
              { value: 'webp', label: 'WebP' },
              { value: 'avif', label: 'AVIF' },
            ]}
            onChange={(format) => setExport({ format })}
          />
          <NumberField
            label="WebP·AVIF 품질"
            value={settings.export.quality}
            min={1}
            max={100}
            integer
            onChange={(quality) => setExport({ quality })}
          />
          <SelectField
            label="갤러리·내보내기 이미지"
            value={settings.export.target}
            options={[
              { value: 'favorite', label: '대표 (없으면 최신)' },
              { value: 'latest', label: '항상 최신' },
            ]}
            onChange={(target) => setExport({ target })}
          />
        </div>
      </Card>
    </>
  );
}

const FAMILY_LABELS: Record<NaiTagFamily, string> = {
  v5: 'V5',
  'v4-5-full': 'V4.5 Full',
  'v4-5-curated': 'V4.5 Curated',
  'v4-full': 'V4 Full',
  'v4-curated': 'V4 Curated',
  v3: 'Anime V3',
  'v3-furry': 'Furry V3',
};

function TagsTab() {
  const [family, setFamily] = useState<NaiTagFamily>('v5');
  const entry = NAI_TAGS[family];
  const models = NAI_MODELS.filter((model) => model.family === family).map((model) => model.label);
  const tagAutocomplete = useLibrary().settings.tagAutocomplete;
  return (
    <>
      <Card title="태그 자동완성" subtitle="프롬프트를 입력할 때 단부루 태그 후보를 보여 줍니다.">
        <Toggle
          label="태그 후보 보이기"
          checked={tagAutocomplete}
          onChange={(value) => patchSettings((current) => ({ ...current, tagAutocomplete: value }))}
        />
        <p className="hint">
          두 글자부터 찾습니다. ↑↓로 고르고 Tab이나 Enter로 넣습니다. 작가 태그는 artist:를 붙여 넣고, artist:로 시작하면 작가만
          찾습니다. 태그 목록은 2025년 1월 기준입니다.
        </p>
      </Card>
      <Card
        title="품질 태그 · UC 프리셋 문구"
        subtitle=""
      >
        <div className="chip-row">
          {(Object.keys(FAMILY_LABELS) as NaiTagFamily[]).map((id) => (
            <button
              key={id}
              className={`chip ${id === family ? 'active' : ''}`}
              onClick={() => setFamily(id)}
            >
              {FAMILY_LABELS[id]}
            </button>
          ))}
        </div>
        <p className="hint">적용 모델: {models.join(', ')}</p>
      </Card>
      <Card title="Quality Tags" subtitle="공통 포지티브 끝에 붙습니다.">
        {(Object.keys(QUALITY_LEVEL_LABELS) as QualityLevel[]).map((level) => (
          <TagLine key={level} label={QUALITY_LEVEL_LABELS[level]} text={entry.quality[level]} />
        ))}
      </Card>
      <Card title="UC 프리셋" subtitle="공통 네거티브 앞에 붙습니다.">
        {(Object.keys(UC_PRESET_LABELS) as UcPresetId[])
          .filter((id) => id !== 'none')
          .map((id) => (
            <TagLine
              key={id}
              label={UC_PRESET_LABELS[id]}
              text={entry.uc[id as Exclude<UcPresetId, 'none'>]}
              negative
            />
          ))}
      </Card>
    </>
  );
}

function TagLine({ label, text, negative }: { label: string; text?: string; negative?: boolean }) {
  return (
    <div className={`tag-line ${text ? '' : 'unsupported'}`}>
      <b>{label}</b>
      {text ? (
        <pre className={`prompt-code small ${negative ? 'negative' : ''}`}>{text}</pre>
      ) : (
        <span className="hint">이 모델에서는 지원하지 않습니다 (선택 불가)</span>
      )}
    </div>
  );
}

function AppearanceTab() {
  const appearance = useLibrary().settings.appearance;
  const set = (value: Partial<AppSettings['appearance']>) =>
    patchSettings((current) => ({ ...current, appearance: { ...current.appearance, ...value } }));
  const preview =
    appearance.mode === 'light' ? 'light' : appearance.mode === 'dark' ? 'dark' : undefined;
  return (
    <>
      <Card
        title="밝기"
        subtitle=""
      >
        <div className="segmented">
          {(Object.keys(MODE_LABELS) as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              className={appearance.mode === mode ? 'active' : ''}
              onClick={() => set({ mode })}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </Card>
      <Card
        title="색상 프리셋"
        subtitle=""
      >
        <div className="theme-grid">
          {(Object.keys(THEMES) as ThemeId[]).map((id) => {
            const swatch = themeSwatch(
              id,
              preview ?? (document.documentElement.dataset.mode === 'light' ? 'light' : 'dark'),
            );
            return (
              <button
                key={id}
                className={`theme-card ${appearance.theme === id ? 'active' : ''}`}
                onClick={() => set({ theme: id })}
              >
                <span className="theme-swatch" style={{ background: swatch.background }}>
                  <span style={{ background: swatch.surface }} />
                  <span style={{ background: swatch.accent }} />
                  <i style={{ color: swatch.text }}>Aa</i>
                </span>
                <b>{THEMES[id].label}</b>
              </button>
            );
          })}
        </div>
      </Card>
    </>
  );
}

/** 배포 파일에 들어 있는 라이브러리. 자세한 내용은 THIRD_PARTY_NOTICES.md와 같이 맞춘다. */
const CREDITS: Array<[string, string]> = [
  ['Electron', 'MIT'],
  ['React · React DOM', 'MIT'],
  ['Zustand', 'MIT'],
  ['Zod', 'MIT'],
  ['fflate', 'MIT'],
  ['sharp', 'Apache-2.0'],
  ['libvips (sharp 포함)', 'LGPL-3.0-or-later'],
  ['태그 목록 (a1111-sd-webui-tagcomplete · Danbooru)', 'MIT'],
];

function InfoTab() {
  const version = useStore((state) => state.version);
  const update = useStore((state) => state.update);
  const busy = useStore((state) => state.busy);
  const autoCheck = useLibrary().settings.update.autoCheck;
  return (
    <>
      <Card title="버전">
        <div className="version-row">
          <strong>NAI RICE {version}</strong>
          <span className="hint">NovelAI Reference Inpaint Character Emotions</span>
        </div>
      </Card>
      <Card title="업데이트" subtitle="GitHub의 최신 릴리스와 비교합니다.">
        <div className="button-row">
          <button
            className="accent with-icon"
            disabled={Boolean(busy)}
            onClick={() => void checkForUpdate(true)}
          >
            <Icon name="refresh" /> 지금 확인
          </button>
          <Toggle
            label="프로그램을 열 때 자동으로 확인"
            checked={autoCheck}
            onChange={(value) =>
              patchSettings((current) => ({
                ...current,
                update: { ...current.update, autoCheck: value },
              }))
            }
          />
        </div>
        {update && (
          <div className={`update-result ${update.newer ? 'newer' : ''}`}>
            <b>{update.message}</b>
            {update.newer && (
              <button onClick={() => openUpdateDialog(update)}>새 버전 보기</button>
            )}
          </div>
        )}
      </Card>
      <Card title="출처">
        <p>
          NAI RICE는 <b>SD Studio</b>(원작 sunho, 이어서 개발 Dd154663 · MIT)에서 파생됐습니다.
          프롬프트 조각 문법과 파일 형식은 SD Studio를 따릅니다.
        </p>
        <dl className="credit-list">
          {CREDITS.map(([name, license]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{license}</dd>
            </div>
          ))}
        </dl>
        <p className="hint">라이선스 전문: 설치 폴더의 THIRD_PARTY_NOTICES.md</p>
      </Card>
    </>
  );
}

const SHORTCUTS: Array<{ title: string; keys: Array<[string, string]> }> = [
  {
    title: '화면 이동',
    keys: [
      ['F1', '작업 (보던 작업 또는 마지막으로 연 작업)'],
      ['F2', '생성 설정'],
      ['F3', '캐릭터'],
      ['F4', '감정 모음'],
      ['F5', '인페인트'],
      ['F6', '프롬프트 조각'],
      ['Ctrl+Tab / Ctrl+Shift+Tab', '다음·이전 작업'],
    ],
  },
  {
    title: '전체',
    keys: [
      ['F11', '전체 화면 켜기·끄기'],
      ['Ctrl++ / Ctrl+-', '화면 확대·축소'],
      ['Ctrl+0', '화면 크기 되돌리기'],
      ['Ctrl+N', '새 작업'],
      ['Ctrl+O', 'JSON 가져오기'],
      ['Ctrl+S', '지금 저장 (평소에도 자동 저장)'],
      ['Ctrl+,', '프로그램 설정'],
      ['Ctrl+B', '사이드바 접기·펴기'],
      ['Ctrl+W', '창 닫기'],
      ['Esc', '열린 창·메뉴 닫기'],
    ],
  },
  {
    title: '프롬프트 입력',
    keys: [
      ['Ctrl+Enter', '크게 보기 창에서 적용'],
      ['↑ / ↓', '태그 후보 고르기'],
      ['Tab / Enter', '고른 태그 넣기'],
      ['Esc', '태그 후보 닫기'],
    ],
  },
  {
    title: '감정 상세',
    keys: [
      ['← / →', '이전·다음 결과'],
      ['Ctrl+클릭 / Shift+클릭', '결과 여러 장 선택'],
      ['Delete', '고른 결과 삭제 (휴지통)'],
      ['PageUp / PageDown', '이전·다음 감정'],
      ['Esc', '갤러리로 돌아가기'],
    ],
  },
  {
    title: '인페인트 마스크',
    keys: [
      ['Ctrl+Z', '되돌리기'],
      ['Ctrl+Y / Ctrl+Shift+Z', '다시 실행'],
    ],
  },
];

function ShortcutsTab() {
  return (
    <>
      {SHORTCUTS.map((group) => (
        <Card key={group.title} title={group.title}>
          <dl className="shortcut-list">
            {group.keys.map(([keys, action]) => (
              <div key={keys + action}>
                <dt>
                  {keys.split(' / ').map((combo, index) => (
                    <span key={combo}>
                      {index > 0 && ' / '}
                      <kbd>{combo}</kbd>
                    </span>
                  ))}
                </dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </>
  );
}

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
  const [tab, setTab] = useState<Tab>('account');
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
