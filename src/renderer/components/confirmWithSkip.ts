import { createElement } from 'react';
import { confirmDialog } from './dialogStack';
import { DontAskMessage } from './DontAskMessage';

/** 「다시 묻지 않음」을 켜고 확인했을 때만 `turnOff`를 부른다. 취소하면 설정은 그대로다. */
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
