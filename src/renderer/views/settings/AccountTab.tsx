import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Card, NumberField, Toggle } from '../../components/ui';
import { run, toast, useLibrary, useStore } from '../../store';
import { accountApi } from '../../desktop';
import { shownV5Quota } from '../../../core/providers/NaiCost';
import type { AccountSummary, TokenStatus } from '../../../shared/ipc';
import { patchSettings } from './patchSettings';

function RequestDelayCard() {
  const delay = useLibrary().settings.requestDelayMs;
  const setDelay = (requestDelayMs: number) =>
    patchSettings((current) => ({ ...current, requestDelayMs }));
  return (
    <Card title="요청 간격">
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
    </Card>
  );
}

function StreamingCard() {
  const streaming = useLibrary().settings.streaming;
  return (
    <Card title="스트리밍">
      <Toggle
        label="생성 과정 보기 (스트리밍)"
        checked={streaming}
        onChange={(value) => patchSettings((current) => ({ ...current, streaming: value }))}
      />
    </Card>
  );
}

/** 이름은 칸을 떠날 때 저장한다. */
function AccountRow({ account, busy }: { account: AccountSummary; busy: boolean }) {
  const [name, setName] = useState(account.name);
  const quota = shownV5Quota(account);
  const apply = (label: string, call: () => Promise<TokenStatus>) =>
    void run(label, async () => useStore.setState({ token: await call() }));
  return (
    <div className={`account-row ${account.active ? 'active' : ''}`}>
      {account.active ? (
        <span className="account-active">사용 중</span>
      ) : (
        <button
          disabled={busy}
          onClick={() => apply('계정을 바꾸는 중', () => accountApi().setActiveAccount(account.id))}
        >
          사용
        </button>
      )}
      <input
        value={name}
        aria-label="계정 이름"
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (name.trim() && name !== account.name)
            apply('이름을 바꾸는 중', () => accountApi().renameAccount(account.id, name));
          else setName(account.name);
        }}
      />
      <span className="account-row-value" title="V5 무료 생성 할당량">
        V5 {quota === undefined ? '—' : `${quota}%`}
      </span>
      <span className="account-row-value">{account.anlas?.toLocaleString() ?? '—'} Anlas</span>
      <button
        className="danger-quiet"
        disabled={busy}
        onClick={() => apply('토큰을 삭제하는 중', () => accountApi().removeAccount(account.id))}
      >
        삭제
      </button>
    </div>
  );
}

export function AccountTab() {
  const token = useStore((state) => state.token);
  const busy = useStore((state) => state.busy);
  const [input, setInput] = useState('');
  const [name, setName] = useState('');
  const rotation = useLibrary().settings.accountRotation;
  const quota = shownV5Quota(token);
  return (
    <>
      <Card title="NovelAI 계정">
        {!token.secureStorageAvailable && (
          <div className="warning-box">
            운영체제 보안 저장소를 사용할 수 없어 토큰을 저장할 수 없습니다.
          </div>
        )}
        {(token.accounts ?? []).map((account) => (
          <AccountRow key={account.id} account={account} busy={Boolean(busy)} />
        ))}
        <div className="token-row">
          <input
            value={name}
            placeholder={`계정 ${(token.accounts?.length ?? 0) + 1}`}
            aria-label="계정 이름"
            onChange={(event) => setName(event.target.value)}
          />
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={input}
            placeholder="NovelAI Persistent API Token"
            aria-label="NovelAI 토큰"
            onChange={(event) => setInput(event.target.value)}
          />
          <button
            className="accent"
            disabled={!input.trim() || !token.secureStorageAvailable || Boolean(busy)}
            onClick={() =>
              void run('토큰을 검증하는 중', async () => {
                const status = await accountApi().addAccount(name, input);
                useStore.setState({ token: status });
                setInput('');
                setName('');
                toast(status.message ?? '계정을 저장했습니다.');
              })
            }
          >
            검증 후 추가
          </button>
        </div>
        <Toggle
          label="V5 무료 할당량을 다 쓰면 다음 계정으로 바꾸기"
          checked={rotation}
          onChange={(value) => patchSettings((current) => ({ ...current, accountRotation: value }))}
        />
      </Card>

      <Card
        title="계정 상태"
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
      <StreamingCard />

      <Card title="Anlas가 차감되는 경우">
        <p>• 캔버스 1024×1024 초과 또는 Steps 28 초과 (모든 모델) — 생성 전 확인</p>
        <p>• V5 무료 할당량(%) 소진 후</p>
      </Card>
    </>
  );
}
