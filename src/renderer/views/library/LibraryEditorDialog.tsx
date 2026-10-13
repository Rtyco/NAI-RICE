import { useEffect } from 'react';
import type {
  Character,
  CharacterReference,
  EmotionSet,
  PieceSet,
  Preset,
  Reference,
  Vibe,
} from '../../../core/domain/types';
import { Modal } from '../../components/Dialogs';
import { openLibrary, updateLibrary, useLibrary, type LibrarySection } from '../../store';
import { ReferenceEditor } from '../ReferenceEditor';
import { CharacterReferenceEditor, VibeEditor } from './AidItemEditor';
import { CharacterEditor } from './CharacterEditor';
import { EmotionSetEditor } from './EmotionSetEditor';
import { LABELS, withName, type Item } from './itemActions';
import { PieceSetEditor } from './PieceSetEditor';
import { PresetEditor } from './PresetEditor';
import { UsedBy } from './UsedBy';

/** 라이브러리 화면과 편집 팝업이 함께 쓴다. */
export function LibraryItemEditor({ section, item }: { section: LibrarySection; item: Item }) {
  if (section === 'presets') return <PresetEditor preset={item as Preset} />;
  if (section === 'characters') return <CharacterEditor character={item as Character} />;
  if (section === 'emotionSets') return <EmotionSetEditor set={item as EmotionSet} />;
  if (section === 'pieceSets') return <PieceSetEditor set={item as PieceSet} />;
  if (section === 'characterReferences')
    return <CharacterReferenceEditor item={item as CharacterReference} />;
  if (section === 'vibes') return <VibeEditor item={item as Vibe} />;
  return <ReferenceEditor key={item.id} reference={item as Reference} />;
}

/** 바꾼 값은 그때그때 저장된다. */
export function LibraryEditorDialog(props: {
  section: LibrarySection;
  itemId: string;
  close: () => void;
}) {
  const { section, itemId, close } = props;
  const library = useLibrary();
  const item = (library[section] as Item[]).find((entry) => entry.id === itemId);
  useEffect(() => {
    if (!item) close();
  }, [item, close]);
  if (!item) return null;
  const label = LABELS[section];
  return (
    <Modal
      title={`${label.title} 편집`}
      onClose={close}
      large
      footer={
        <>
          <span className="hint">
            바꾼 내용은 바로 저장되고, 이 {label.title}을(를) 쓰는 모든 작업에 반영됩니다.
          </span>
          <button
            onClick={() => {
              close();
              openLibrary(section, item.id);
            }}
          >
            라이브러리에서 열기
          </button>
          <button className="accent" onClick={close}>
            닫기
          </button>
        </>
      }
    >
      <header className="library-editor-head">
        <input
          className="project-name-input"
          value={item.name}
          aria-label="이름"
          onChange={(event) =>
            updateLibrary((current) => withName(current, section, item.id, event.target.value))
          }
        />
      </header>
      <UsedBy section={section} id={item.id} />
      <div className={`library-editor-body ${section === 'references' ? 'fill' : ''}`}>
        <LibraryItemEditor section={section} item={item} />
      </div>
    </Modal>
  );
}
