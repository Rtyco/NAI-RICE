import { useState } from 'react';
import type { Project } from '../../../core/domain/types';
import { Modal } from '../../components/Dialogs';
import { useLibrary, type LibrarySection } from '../../store';
import { LABELS, type Item } from './itemActions';

/** 작업에서 쓰는 항목을 지울 때, 그 작업들이 대신 쓸 항목을 고른다. 비워 두면 작업에서 다시 고르면 된다. */
export function DeleteUsedDialog(props: {
  section: LibrarySection;
  item: Item;
  users: Project[];
  close: (result: { replacementId: string } | null) => void;
}) {
  const library = useLibrary();
  const { title } = LABELS[props.section];
  const others = (library[props.section] as Item[]).filter((entry) => entry.id !== props.item.id);
  const [replacementId, setReplacementId] = useState(others[0]?.id ?? '');
  return (
    <Modal
      title={`${title} 삭제`}
      onClose={() => props.close(null)}
      footer={
        <>
          <button onClick={() => props.close(null)}>취소</button>
          <button className="danger-solid" onClick={() => props.close({ replacementId })}>
            삭제
          </button>
        </>
      }
    >
      <p>
        "{props.item.name}"을(를) 삭제합니다.
        {props.section === 'references' ? ' 이미지 폴더는 휴지통으로 이동합니다.' : ''}
      </p>
      <p>
        이 {title}을(를) 쓰는 작업 {props.users.length}개:{' '}
        <b>{props.users.map((project) => project.name).join(', ')}</b>
      </p>
      <label className="stack-field">
        이 작업들이 대신 쓸 {title}
        <select value={replacementId} onChange={(event) => setReplacementId(event.target.value)}>
          {others.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
          <option value="">(비워 두기 — 작업에서 나중에 고르기)</option>
        </select>
      </label>
    </Modal>
  );
}
