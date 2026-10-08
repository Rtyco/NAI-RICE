import { useEffect, useRef, useState } from 'react';
import { refreshAccount, run, useStore } from '../store';
import { Icon } from './Icon';

function elapsed(iso: string | undefined, now: number): string {
  if (!iso) return '조회 전';
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 10) return '방금';
  if (seconds < 60) return `${seconds}초 전`;
  return `${Math.floor(seconds / 60)}분 전`;
}

/**
 * V5 무료 할당량과 Anlas. 값이 바뀌면 잠시 강조하고 변화량을 보여 준다.
 * 생성할 때마다, 그리고 1분마다 메인 프로세스가 다시 조회해 알려 준다. 누르면 바로 다시 조회한다.
 */
export function AccountMeter() {
  const token = useStore((state) => state.token);
  const [now, setNow] = useState(() => Date.now());
  const [change, setChange] = useState<{ anlas?: number; quota?: number; key: number }>();
  const previous = useRef<{ anlas?: number; quota?: number }>({});
  const quota = token.v5Quota ? (token.v5Quota.isNegative ? 0 : token.v5Quota.percent) : undefined;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const before = previous.current;
    previous.current = { anlas: token.anlas, quota };
    const anlasDelta =
      before.anlas !== undefined && token.anlas !== undefined ? token.anlas - before.anlas : 0;
    const quotaDelta = before.quota !== undefined && quota !== undefined ? quota - before.quota : 0;
    setNow(Date.now());
    if (!anlasDelta && !quotaDelta) return;
    setChange({ anlas: anlasDelta || undefined, quota: quotaDelta || undefined, key: Date.now() });
    const timer = setTimeout(() => setChange(undefined), 8_000);
    return () => clearTimeout(timer);
  }, [token.anlas, quota, token.checkedAt]);

  if (!token.stored) return <span className="pill">NovelAI 토큰 미설정</span>;
  const signed = (value: number) =>
    value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString();
  return (
    <button
      className={`account-meter ${change ? 'changed' : ''}`}
      key={change?.key}
      title={`${token.checkedAt ? `조회 ${new Date(token.checkedAt).toLocaleTimeString()}` : '아직 조회하지 않았습니다'} · 누르면 지금 다시 조회합니다`}
      onClick={() => void run('계정 상태를 확인하는 중', refreshAccount)}
    >
      {quota !== undefined && (
        <span className="meter">
          <small>V5 무료</small>
          <b>{quota}%</b>
          <span className="quota-track mini">
            <span style={{ width: `${Math.min(100, quota)}%` }} />
          </span>
          {change?.quota && (
            <em className={change.quota > 0 ? 'up' : 'down'}>{signed(change.quota)}%</em>
          )}
        </span>
      )}
      <span className="meter">
        <small>Anlas</small>
        <b>{token.anlas?.toLocaleString() ?? '—'}</b>
        {change?.anlas && (
          <em className={change.anlas > 0 ? 'up' : 'down'}>{signed(change.anlas)}</em>
        )}
      </span>
      <small className="checked">
        <Icon name="refresh" size={12} /> {elapsed(token.checkedAt, now)}
      </small>
    </button>
  );
}
