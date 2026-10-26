import { Modal } from '../../components/Dialogs';
import { loadImageFromReference, type ImageTarget } from '../../freeImageOps';
import { referenceMedia, useStore } from '../../store';

export function FreeReferencePicker({ target, close }: { target: ImageTarget; close: () => void }) {
  const references = useStore((state) => state.library!.references);
  return (
    <Modal title="인페인트에서 불러오기" onClose={close} wide>
      {references.length ? (
        <div className="reference-picks">
          {references.map((reference) => (
            <button
              key={reference.id}
              disabled={!reference.image}
              title={reference.image ? reference.name : '이미지 없음'}
              onClick={() => {
                close();
                void loadImageFromReference(target, reference);
              }}
            >
              {reference.image ? (
                <img
                  src={referenceMedia(
                    reference.id,
                    reference.image.canvasFile,
                    reference.updatedAt,
                  )}
                  alt=""
                  draggable={false}
                />
              ) : (
                <span className="reference-pick-empty" />
              )}
              <span>{reference.name || '(이름 없음)'}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="hint">라이브러리에 인페인트가 없습니다.</p>
      )}
    </Modal>
  );
}
