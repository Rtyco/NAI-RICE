import { useEffect } from 'react';
import type {
  Character,
  EmotionSet,
  PieceSet,
  Preset,
  Reference,
} from '../../../core/domain/types';
import { Modal } from '../../components/Dialogs';
import { openLibrary, updateLibrary, useLibrary, type LibrarySection } from '../../store';
import { ReferenceEditor } from '../ReferenceEditor';
import { CharacterEditor } from './CharacterEditor';
import { EmotionMoodEditor, EmotionSetEditor } from './EmotionSetEditor';
import { LABELS, withName, type Item } from './itemActions';
import { PieceSetEditor } from './PieceSetEditor';
import { PresetEditor } from './PresetEditor';
import { UsedBy } from './UsedBy';

/** 라이브러리 항목 하나의 편집 화면. 라이브러리 화면과 편집 팝업이 함께 쓴다. */
export function LibraryItemEditor({ section, item }: { section: LibrarySection; item: Item }) {
  if (section === 'presets') return <PresetEditor preset={item as Preset} />;
  if (section === 'characters') return <CharacterEditor character={item as Character} />;
  if (section === 'emotionSets')
    return (
      <>
        <EmotionSetEditor set={item as EmotionSet} />
        <EmotionMoodEditor set={item as EmotionSet} />
      </>
    );
  if (section === 'pieceSets') return <PieceSetEditor set={item as PieceSet} />;
  return <ReferenceEditor key={item.id} reference={item as Reference} />;
}

/**
 * 작업·자유 생성 화면에서 쓰는 라이브러리 항목을 화면을 떠나지 않고 고치는 팝업. 라이브러리 화면과 같은
 * 편집기를 쓰고, 바꾼 값은 그때그때 저장된다.
 */
export function LibraryEditorDialog(props: {
  section: LibrarySection;
  itemId: string;
  close: () => void;
}) {
  const { section, itemId, close } = props;
  const library = useLibrary();
  const item = (library[section] as Item[]).find((entry) => entry.id === itemId);
  // 다른 곳에서 지워졌으면 닫는다.
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
