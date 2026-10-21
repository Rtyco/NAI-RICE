import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Card, NumberField, Toggle } from '../../components/ui';
import { run, toast, useLibrary, useStore } from '../../store';
import { accountApi } from '../../desktop';
import { patchSettings } from './patchSettings';

function RequestDelayCard() {
  const delay = useLibrary().settings.requestDelayMs;
  const setDelay = (requestDelayMs: number) =>
    patchSettings((current) => ({ ...current, requestDelayMs }));
  return (
    <Card title="요청 간격" subtitle="">
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

export function AccountTab() {
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
      <Card title="NovelAI 연결">
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
