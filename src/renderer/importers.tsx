import {
  bundleSummary,
  mergeBundle,
  parseImportFile,
  type ImportBundle,
  type ImportOverwrites,
} from '../core/backup/Backups';
import { createProject, createReference } from '../core/model/defaults';
import { openDialog } from './components/dialogStack';
import { ImportReviewDialog } from './components/ImportReviewDialog';
import { openLibrary, openProject, run, toast, updateLibrary, useStore } from './store';
import { fileApi, libraryApi } from './desktop';

export async function applyBundle(
  bundle: ImportBundle,
  overwrites: ImportOverwrites = {},
): Promise<void> {
  const library = useStore.getState().library;
  if (!library) return;

  // SDStudio처럼 캐릭터와 감정 모음만 있으면 작업을 만들어 준다.
  if (
    !bundle.projects.length &&
    bundle.characters.length === 1 &&
    bundle.emotionSets.length === 1
  ) {
    const character = bundle.characters[0];
    const reference = createReference(character.name);
    bundle.references.push(reference);
    bundle.projects.push(
      createProject(character.name, {
        presetId: bundle.presets[0]?.id ?? library.presets[0].id,
        character,
        emotionSetId: bundle.emotionSets[0].id,
        referenceId: reference.id,
      }),
    );
  }

  for (const [referenceId, images] of Object.entries(bundle.images)) {
    const saved = await libraryApi().saveReferenceImages({
      referenceId,
      originalDataUrl: images.original,
      canvasDataUrl: images.canvas,
      maskDataUrl: images.mask,
      paintDataUrl: images.paint ?? null,
    });
    bundle.references = bundle.references.map((reference) =>
      reference.id === referenceId && reference.image && saved.originalFile
        ? { ...reference, image: { ...reference.image, originalFile: saved.originalFile } }
        : reference,
    );
  }

  // 내용 해시 이름이라 다시 저장해도 이름이 같다.
  for (const dataUrl of Object.values(bundle.pictures)) await libraryApi().addPicture(dataUrl);

  updateLibrary((current) => mergeBundle(current, bundle, overwrites));
  toast([bundleSummary(bundle), ...bundle.warnings.slice(0, 3)].join('\n'));

  const shown = (id: string) => overwrites[id] ?? id;
  if (bundle.projects.length) openProject(bundle.projects[0].id);
  else if (bundle.presets.length) openLibrary('presets', shown(bundle.presets[0].id));
  else if (bundle.characters.length) openLibrary('characters', shown(bundle.characters[0].id));
  else if (bundle.emotionSets.length) openLibrary('emotionSets', shown(bundle.emotionSets[0].id));
  else if (bundle.references.length) openLibrary('references', bundle.references[0].id);
  else if (bundle.characterReferences.length)
    openLibrary('characterReferences', bundle.characterReferences[0].id);
  else if (bundle.vibes.length) openLibrary('vibes', bundle.vibes[0].id);
  else if (bundle.pieceSets.length) openLibrary('pieceSets', shown(bundle.pieceSets[0].id));
}

export async function importJsonText(raw: string, fileName: string): Promise<void> {
  const library = useStore.getState().library;
  if (!library) return;
  const bundle = parseImportFile(raw, fileName, library.presets[0].id);
  void openDialog((close) => (
    <ImportReviewDialog
      bundle={bundle}
      close={close}
      onImport={(chosen, kept) => void run('가져오는 중', () => applyBundle(chosen, kept))}
    />
  ));
}

export function importJsonFromPicker(): Promise<void> {
  return run('JSON을 가져오는 중', async () => {
    const file = await fileApi().openJsonFile('가져올 JSON 선택');
    if (file) await importJsonText(file.text, file.name);
  }).then(() => undefined);
}
