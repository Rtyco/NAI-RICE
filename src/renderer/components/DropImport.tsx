import { useEffect, useRef, useState } from 'react';
import { readImageMetadata } from '../../core/metadata/NaiMetadata';
import { importJsonText } from '../importers';
import { blobToDataUrl, decodePixels } from '../lib/image';
import { run } from '../store';
import { openDialog } from './Dialogs';
import { ImageImportDialog } from './imageImport/ImageImportDialog';
import { PlainImageDialog } from './imageImport/PlainImageDialog';

export async function importDroppedFile(file: File): Promise<void> {
  const name = file.name;
  if (/\.json$/i.test(name) || file.type === 'application/json') {
    await importJsonText(await file.text(), name);
    return;
  }
  if (!file.type.startsWith('image/')) throw new Error(`지원하지 않는 파일입니다: ${name}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const dataUrl = await blobToDataUrl(file);
  const data = await readImageMetadata(bytes, () => decodePixels(file)).catch(() => null);
  const image = { name, dataUrl };
  if (data)
    void openDialog((close) => <ImageImportDialog data={data} image={image} close={close} />);
  else void openDialog((close) => <PlainImageDialog image={image} close={close} />);
}

/** 창 어디에 파일을 놓아도 받는다. 감정 카드 정렬용 드래그는 무시한다. */
export function DropZone() {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    const hasFiles = (event: DragEvent) => Boolean(event.dataTransfer?.types.includes('Files'));
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current += 1;
      setActive(true);
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setActive(false);
    };
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setActive(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      void (async () => {
        for (const file of files)
          await run(`${file.name} 가져오는 중`, () => importDroppedFile(file));
      })();
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
  if (!active) return null;
  return (
    <div className="drop-overlay">
      <div>
        <b>여기에 놓기</b>
        <p>
          NovelAI 이미지 → 설정 불러오기 · 일반 이미지 → 인페인트 · JSON → 백업/SDStudio 가져오기
        </p>
      </div>
    </div>
  );
}
