import { createReference } from '../../../core/model/defaults';
import { patchItem } from '../../../core/model/mutations';
import { addAidFromImage, type AidSection } from '../../aidImport';
import {
  currentProject,
  openLibrary,
  run,
  setPendingReference,
  toast,
  updateLibrary,
  useLibrary,
} from '../../store';
import { Modal } from '../Dialogs';
import type { DroppedImage } from './ImageImportDialog';

export function PlainImageDialog({ image, close }: { image: DroppedImage; close: () => void }) {
  const library = useLibrary();
  const project = currentProject();
  const reference = project
    ? library.references.find((item) => item.id === project.referenceId)
    : undefined;
  const stem = image.name.replace(/\.[^.]+$/, '');
  const assign = (mode: 'current' | 'new') => {
    let id = reference?.id;
    if (mode === 'new' || !id) {
      const created = createReference(stem);
      id = created.id;
      updateLibrary((current) => {
        let next = { ...current, references: [...current.references, created] };
        if (project)
          next = patchItem(next, 'projects', project.id, (item) => ({
            ...item,
            referenceId: created.id,
          }));
        return next;
      });
    }
    setPendingReference({ referenceId: id, dataUrl: image.dataUrl, name: image.name });
    openLibrary('references', id);
    close();
  };
  const addAid = (section: AidSection) =>
    void run('그림을 넣는 중', async () => {
      const id = await addAidFromImage(section, image, stem, project?.id);
      const label = section === 'characterReferences' ? '캐릭터 레퍼런스' : '바이브';
      if (project) toast(`새 ${label}를 만들어 작업 "${project.name}"에 넣었습니다.`);
      else openLibrary(section, id);
      close();
    });
  const linked = project ? ' (현재 작업에 연결)' : '';
  return (
    <Modal title="이미지 사용" onClose={close}>
      <div className="image-import">
        <img src={image.dataUrl} alt="" className="import-preview" />
        <div className="import-options">
          <p>이 이미지에는 NovelAI 생성 정보가 없습니다.</p>
          {reference && (
            <button className="accent" onClick={() => assign('current')}>
              현재 인페인트 "{reference.name}"의 참고 이미지 교체
            </button>
          )}
          <button onClick={() => assign('new')}>새 인페인트로 추가{linked}</button>
          <button onClick={() => addAid('characterReferences')}>
            새 캐릭터 레퍼런스로 추가{linked}
          </button>
          <button onClick={() => addAid('vibes')}>새 바이브로 추가{linked}</button>
          <button onClick={close}>취소</button>
        </div>
      </div>
    </Modal>
  );
}
