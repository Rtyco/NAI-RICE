import type { PieceSet } from '../../../core/domain/types';
import {
  addPiece,
  patchItem,
  removePiece,
  renamePiece,
  updatePiece,
} from '../../../core/model/mutations';
import { pieceRef } from '../../../core/prompts/PromptPieces';
import { PromptTextarea } from '../../components/PromptTextarea';
import { ExpandTextButton } from '../../components/TextEditorDialog';
import { Card } from '../../components/ui';
import { toast, updateLibrary } from '../../store';

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(`복사했습니다: ${text}`);
  } catch {
    toast(`복사하지 못했습니다. 직접 입력하십시오: ${text}`, 'error');
  }
}

export function PieceSetEditor({ set }: { set: PieceSet }) {
  const save = (recipe: (item: PieceSet) => PieceSet) =>
    updateLibrary((current) => patchItem(current, 'pieceSets', set.id, recipe));
  return (
    <Card
      title={`조각 (${set.pieces.length})`}
      subtitle=""
      actions={
        <button className="accent" onClick={() => save((item) => addPiece(item).set)}>
          ＋ 조각 추가
        </button>
      }
    >
      <div className="piece-table">
        {set.pieces.map((piece) => {
          const ref = pieceRef(set.name.trim(), piece.name.trim());
          return (
            <div className="piece-row" key={piece.id}>
              <div className="piece-row-head">
                <input
                  className="emotion-name-input"
                  value={piece.name}
                  aria-label="조각 이름"
                  placeholder="조각 이름"
                  onChange={(event) =>
                    updateLibrary((current) =>
                      renamePiece(current, set.id, piece.id, event.target.value),
                    )
                  }
                />
                <button
                  className="piece-ref mono"
                  title="눌러서 참조 복사"
                  onClick={() => void copyText(ref)}
                >
                  {ref}
                </button>
                <label className="toggle-field compact">
                  <input
                    type="checkbox"
                    checked={piece.multi}
                    onChange={(event) =>
                      save((item) => updatePiece(item, piece.id, { multi: event.target.checked }))
                    }
                  />
                  줄마다 하나씩 고르기
                </label>
                <div className="row-actions">
                  <ExpandTextButton
                    title={`${piece.name || '조각'} 내용`}
                    value={piece.prompt}
                    placeholder={piece.multi ? '한 줄에 후보 하나씩' : '예: red eyes, slit pupils'}
                    onApply={(prompt) => save((item) => updatePiece(item, piece.id, { prompt }))}
                  />
                  <button
                    className="icon-button danger"
                    title="삭제"
                    onClick={() => save((item) => removePiece(item, piece.id))}
                  >
                    ×
                  </button>
                </div>
              </div>
              <PromptTextarea
                rows={piece.multi ? 3 : 2}
                value={piece.prompt}
                aria-label={`${piece.name} 내용`}
                placeholder={piece.multi ? '한 줄에 후보 하나씩' : '예: red eyes, slit pupils'}
                onChange={(prompt) => save((item) => updatePiece(item, piece.id, { prompt }))}
              />
            </div>
          );
        })}
        {!set.pieces.length && <p className="hint">조각 없음</p>}
      </div>
      <p className="hint">
        줄마다 하나씩 고르기: 이미지마다 한 줄 선택(같은 seed → 같은 줄, 빈 줄 = 넣지 않음)
      </p>
    </Card>
  );
}
