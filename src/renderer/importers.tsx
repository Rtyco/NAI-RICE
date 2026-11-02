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
import {
  loadGenerations,
  openLibrary,
  openProject,
  run,
  toast,
  updateLibrary,
  useStore,
} from './store';
import { fileApi, libraryApi } from './desktop';

export async function applyBundle(
  bundle: ImportBundle,
  overwrites: ImportOverwrites = {},
): Promise<void> {
  const library = useStore.getState().library;
  if (!library) return;

  // SDStudio처럼 캐릭터와 씬 모음만 있으면 작업을 만들어 준다.
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

/** 결과 ID가 새로 붙어 대표 이미지도 새 ID로 옮긴다. */
async function importPackageResults(
  path: string,
  results: NonNullable<ImportBundle['results']>,
): Promise<void> {
  const { idMap, count } = await fileApi().importPackageResults({
    path,
    projectId: results.projectId,
    records: results.records,
  });
  const favorites = Object.fromEntries(
    Object.entries(results.favorites).flatMap(([emotionId, id]) =>
      idMap[id] ? [[emotionId, idMap[id]]] : [],
    ),
  );
  await finishResults(results.projectId, favorites, count);
}

async function finishResults(
  projectId: string,
  favorites: Record<string, string>,
  count: number,
): Promise<void> {
  updateLibrary((current) => ({
    ...current,
    projects: current.projects.map((project) =>
      project.id === projectId ? { ...project, favorites } : project,
    ),
  }));
  await loadGenerations(projectId);
  toast(`생성 결과 ${count}장을 가져왔습니다.`);
}

/** 합친 뒤의 라이브러리에서 씬을 찾는다(같은 이름 항목을 덮어쓰기로 골랐을 수 있다). */
async function importSDStudioResults(path: string, projectId: string): Promise<void> {
  const library = useStore.getState().library;
  const project = library?.projects.find((item) => item.id === projectId);
  const set = library?.emotionSets.find((item) => item.id === project?.emotionSetId);
  const preset = library?.presets.find((item) => item.id === project?.presetId);
  if (!library || !project || !set || !preset) return;
  const character = library.characters.find(
    (item) => item.id === project.characters[0]?.characterId,
  );
  const { count, favorites } = await fileApi().importSDStudioResults({
    path,
    projectId,
    emotions: Object.fromEntries(
      set.emotions.map((emotion) => [emotion.name, { id: emotion.id, name: emotion.name }]),
    ),
    defaults: {
      presetName: preset.name,
      characterName: character?.name ?? '',
      emotionSetName: set.name,
      settings: preset.generation,
    },
  });
  await finishResults(projectId, favorites, count);
}

export async function importPackage(path: string, fileName: string): Promise<void> {
  const library = useStore.getState().library;
  if (!library) return;
  if (!path) throw new Error(`파일 위치를 알 수 없습니다: ${fileName}`);
  const raw = await fileApi().readPackage(path);
  const sdStudio = (JSON.parse(raw) as { kind?: unknown }).kind === undefined;
  const bundle = parseImportFile(raw, fileName, library.presets[0].id);
  void openDialog((close) => (
    <ImportReviewDialog
      bundle={bundle}
      close={close}
      onImport={(chosen, kept) =>
        void run('가져오는 중', async () => {
          await applyBundle(chosen, kept);
          const results = chosen.results;
          if (results && chosen.projects.some((project) => project.id === results.projectId))
            await importPackageResults(path, results);
          else if (sdStudio && chosen.projects[0])
            await importSDStudioResults(path, chosen.projects[0].id);
        })
      }
    />
  ));
}

export function importFromPicker(): Promise<void> {
  return run('파일을 가져오는 중', async () => {
    const file = await fileApi().pickImportFile('가져올 파일 선택');
    if (!file) return;
    if (file.text === undefined) await importPackage(file.path, file.name);
    else await importJsonText(file.text, file.name);
  }).then(() => undefined);
}
