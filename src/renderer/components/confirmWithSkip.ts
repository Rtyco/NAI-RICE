import { createElement } from 'react';
import { confirmDialog } from './dialogStack';
import { DontAskMessage } from './DontAskMessage';

/** 취소하면 「다시 표시 안 함」을 켰어도 설정을 바꾸지 않는다. */
export async function confirmWithSkip(
  options: Parameters<typeof confirmDialog>[0],
  turnOff: () => void,
): Promise<boolean> {
  let skip = false;
  const confirmed = await confirmDialog({
    ...options,
    message: createElement(DontAskMessage, {
      onSkipChange: (value: boolean) => (skip = value),
      children: options.message,
    }),
  });
  if (confirmed && skip) turnOff();
  return confirmed;
}
