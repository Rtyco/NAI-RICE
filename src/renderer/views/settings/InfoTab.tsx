import { Icon } from '../../components/Icon';
import { Card, Toggle } from '../../components/ui';
import { useLibrary, useStore } from '../../store';
import { checkForUpdate, openUpdateDialog } from '../../updates';
import { WHATS_NEW_VERSION } from '../../../core/update/UpdateCheck';
import { openWhatsNew } from '../../whatsNew';
import { patchSettings } from './patchSettings';

/** THIRD_PARTY_NOTICES.md와 맞춘다. */
const CREDITS: Array<[string, string]> = [
  ['Electron', 'MIT'],
  ['React · React DOM', 'MIT'],
  ['Zustand', 'MIT'],
  ['Zod', 'MIT'],
  ['fflate', 'MIT'],
  ['sharp', 'Apache-2.0'],
  ['libvips (sharp 포함)', 'LGPL-3.0-or-later'],
  ['태그 목록 (dbr-e621-lists-archive · Danbooru)', 'Unlicense'],
];

export function InfoTab() {
  const version = useStore((state) => state.version);
  const update = useStore((state) => state.update);
  const busy = useStore((state) => state.busy);
  const autoCheck = useLibrary().settings.update.autoCheck;
  return (
    <>
      <Card
        title="버전"
        actions={
          <button onClick={() => void openWhatsNew()}>{WHATS_NEW_VERSION}에서 바뀐 점</button>
        }
      >
        <div className="version-row">
          <strong>NAI RICE {version}</strong>
          <span className="hint">NovelAI Reference Inpaint Character Emotions</span>
        </div>
      </Card>
      <Card title="업데이트">
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
            {update.newer && <button onClick={() => openUpdateDialog(update)}>새 버전 보기</button>}
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
