import { useState, type ReactNode } from 'react';
import { Toggle } from './ui';

export function DontAskMessage(props: {
  children: ReactNode;
  onSkipChange: (skip: boolean) => void;
}) {
  const [skip, setSkip] = useState(false);
  return (
    <>
      {props.children}
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
