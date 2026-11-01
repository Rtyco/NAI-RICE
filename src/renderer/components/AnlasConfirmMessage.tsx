import { useState } from 'react';
import { Toggle } from './ui';

export function AnlasConfirmMessage(props: {
  anlas: number;
  onSkipChange: (skip: boolean) => void;
}) {
  const [skip, setSkip] = useState(false);
  return (
    <>
      <p>
        예상 약 {props.anlas.toLocaleString()} Anlas가 차감됩니다. 예상값이며 실제 차감량과 다를 수
        있습니다.
      </p>
      <Toggle
        label="다시 묻지 않음"
        checked={skip}
        onChange={(value) => {
          setSkip(value);
          props.onSkipChange(value);
        }}
      />
      <p className="hint">프로그램 설정 › 알림에서 다시 켤 수 있습니다.</p>
    </>
  );
}
