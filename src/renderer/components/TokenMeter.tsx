import { usePromptTokens, type SideUsage, type TokenScene } from '../promptTokens';

export function TokenMeter({ model, scenes }: { model?: string; scenes: TokenScene[] }) {
  const state = usePromptTokens(model, scenes);
  if (!state) return null;
  return (
    <section className="token-meter" aria-label="프롬프트 토큰">
      {state.status === 'ready' ? (
        <>
          <TokenRow label="포지티브" usage={state.positive} limit={state.limit} />
          <TokenRow label="네거티브" usage={state.negative} limit={state.limit} />
        </>
      ) : (
        <p className="hint">
          {state.status === 'error'
            ? `토큰 수를 셀 수 없습니다: ${state.message}`
            : '토큰 수를 세는 중…'}
        </p>
      )}
    </section>
  );
}

function TokenRow({ label, usage, limit }: { label: string; usage: SideUsage; limit: number }) {
  const over = usage.count - limit;
  return (
    <div
      className={`token-usage ${over > 0 ? 'over' : ''}`}
      title={[
        usage.scene && `가장 긴 씬 「${usage.scene}」 기준`,
        '품질 태그·씬·캐릭터 프롬프트 포함',
        over > 0 && `한도를 ${over.toLocaleString()} 토큰 넘어 뒤쪽이 잘립니다`,
      ]
        .filter(Boolean)
        .join('\n')}
    >
      <span>{label}</span>
      <span className="token-track">
        <span style={{ width: `${Math.min(100, (usage.count / limit) * 100)}%` }} />
      </span>
      <b>
        {usage.count.toLocaleString()} / {limit.toLocaleString()}
      </b>
    </div>
  );
}
