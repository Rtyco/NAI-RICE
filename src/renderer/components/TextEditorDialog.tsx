import { useState } from 'react';
import { Modal, openDialog } from './Dialogs';
import { Icon } from './Icon';
import { PromptTextarea } from './PromptTextarea';

type EditorOptions = {
  title: string;
  value: string;
  placeholder?: string;
  tone?: 'default' | 'negative';
  onApply: (value: string) => void;
};

export function TextEditorDialog({
  title,
  value,
  placeholder,
  tone,
  onApply,
  close,
}: EditorOptions & { close: () => void }) {
  const [draft, setDraft] = useState(value);
  const apply = () => {
    if (draft !== value) onApply(draft);
    close();
  };
  return (
    <Modal
      title={title}
      wide
      onClose={close}
      footer={
        <>
          <span className="hint">{draft.length.toLocaleString()}자</span>
          <button title="Esc" onClick={close}>
            취소
          </button>
          <button className="accent" title="Ctrl+Enter" onClick={apply}>
            적용
          </button>
        </>
      }
    >
      <PromptTextarea
        className={`text-editor-area ${tone === 'negative' ? 'negative' : ''}`}
        value={draft}
        placeholder={placeholder}
        autoFocus
        onChange={setDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            apply();
          }
        }}
      />
    </Modal>
  );
}

export function ExpandTextButton(props: EditorOptions) {
  return (
    <button
      type="button"
      className="icon-button expand-text-button"
      title="크게 편집"
      aria-label={`${props.title} 크게 편집`}
      onClick={(event) => {
        // 감싼 label이 클릭을 입력란으로 넘기지 않게
        event.preventDefault();
        void openDialog((close) => <TextEditorDialog {...props} close={close} />);
      }}
    >
      <Icon name="expand" size={14} />
    </button>
  );
}
