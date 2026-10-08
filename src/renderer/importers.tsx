import { useState } from 'react';
import {
  bundleSummary,
  mergeBundle,
  parseImportFile,
  type ImportBundle,
  type ImportOverwrites,
} from '../core/backup/Backups';
import { createProject, createReference } from '../core/model/defaults';
import { Modal, openDialog } from './components/Dialogs';
import { openLibrary, openProject, run, toast, updateLibrary, useStore } from './store';
import { fileApi, libraryApi } from './desktop';

/** 묶음을 라이브러리에 추가하고 레퍼런스 이미지를 저장한다. 새 작업이 있으면 그 작업을 연다. */
export async function applyBundle(
  bundle: ImportBundle,
  overwrites: ImportOverwrites = {},
): Promise<void> {
  const library = useStore.getState().library;
  if (!library) return;

  // SDStudio처럼 캐릭터와 감정 모음만 있는 경우 바로 쓸 수 있도록 작업을 만들어 준다.
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
    });
    bundle.references = bundle.references.map((reference) =>
      reference.id === referenceId && reference.image && saved.originalFile
        ? { ...reference, image: { ...reference.image, originalFile: saved.originalFile } }
        : reference,
    );
  }

  updateLibrary((current) => mergeBundle(current, bundle, overwrites));
  toast([bundleSummary(bundle), ...bundle.warnings.slice(0, 3)].join('\n'));

  const shown = (id: string) => overwrites[id] ?? id;
  if (bundle.projects.length) openProject(bundle.projects[0].id);
  else if (bundle.presets.length) openLibrary('presets', shown(bundle.presets[0].id));
  else if (bundle.characters.length) openLibrary('characters', shown(bundle.characters[0].id));
  else if (bundle.emotionSets.length) openLibrary('emotionSets', shown(bundle.emotionSets[0].id));
  else if (bundle.references.length) openLibrary('references', bundle.references[0].id);
  else if (bundle.pieceSets.length) openLibrary('pieceSets', shown(bundle.pieceSets[0].id));
}

type NamedGroup =
  'presets' | 'characters' | 'emotionSets' | 'references' | 'projects' | 'pieceSets';

const GROUPS: Array<{ key: NamedGroup; label: string }> = [
  { key: 'presets', label: '생성 설정' },
  { key: 'characters', label: '캐릭터' },
  { key: 'emotionSets', label: '감정 모음' },
  { key: 'references', label: '인페인트' },
  { key: 'projects', label: '작업' },
  { key: 'pieceSets', label: '프롬프트 조각' },
];

/** 기존 항목에 덮어쓸 수 있는 종류. 레퍼런스(이미지)와 작업은 항상 새로 추가한다. */
const OVERWRITABLE = new Set<NamedGroup>(['presets', 'characters', 'emotionSets', 'pieceSets']);

const SKIP = '__skip';

/** 이름이 같은 기존 항목. 이것만 덮어쓸 수 있다. */
function sameNamed(
  library: ReturnType<typeof useStore.getState>['library'],
  key: NamedGroup,
  name: string,
): Array<{ id: string; name: string }> {
  if (!library || !OVERWRITABLE.has(key)) return [];
  return library[key].filter((entry) => entry.name.trim() === name.trim());
}

/** 건너뛴 항목을 쓰는 작업. 같이 빼지 않으면 없는 항목을 가리키게 된다. */
function blockedProjects(bundle: ImportBundle, skipped: Set<string>): Set<string> {
  return new Set(
    bundle.projects
      .filter((project) =>
        [project.presetId, project.characterId, project.emotionSetId, project.referenceId].some(
          (id) => skipped.has(id),
        ),
      )
      .map((project) => project.id),
  );
}

/** 가져오기 전에 항목마다 새로 추가(이름 지정)·덮어쓰기·추가 안 함을 정한다. */
function ImportReviewDialog({ bundle, close }: { bundle: ImportBundle; close: () => void }) {
  const library = useStore((state) => state.library);
  const view = useStore((state) => state.view);
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      GROUPS.flatMap((group) => bundle[group.key].map((item) => [item.id, item.name])),
    ),
  );
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [overwrites, setOverwrites] = useState<ImportOverwrites>(() => {
    // 프롬프트는 조각을 세트 이름으로 부르므로, 이름이 같은 세트는 덮어쓰는 것을 기본으로 한다.
    const defaults: ImportOverwrites = Object.fromEntries(
      bundle.pieceSets.flatMap((item) => {
        const existing = sameNamed(library, 'pieceSets', item.name)[0];
        return existing ? [[item.id, existing.id]] : [];
      }),
    );
    // 라이브러리에서 보고 있는 항목과 이름이 같은 것을 하나만 가져오면 그 항목에 덮어쓰는 것을 기본으로 한다.
    if (view.kind !== 'library' || !view.itemId) return defaults;
    const key = view.section as NamedGroup;
    const items = OVERWRITABLE.has(key) ? bundle[key] : [];
    const viewed =
      items.length === 1 &&
      sameNamed(library, key, items[0].name).find((entry) => entry.id === view.itemId);
    return viewed ? { ...defaults, [items[0].id]: viewed.id } : defaults;
  });

  const blocked = blockedProjects(bundle, skipped);
  const excluded = (id: string) => skipped.has(id) || blocked.has(id);
  const total = GROUPS.reduce((sum, group) => sum + bundle[group.key].length, 0);
  const included = GROUPS.reduce(
    (sum, group) => sum + bundle[group.key].filter((item) => !excluded(item.id)).length,
    0,
  );

  const choose = (id: string, value: string) => {
    setSkipped((current) => {
      const next = new Set(current);
      if (value === SKIP) next.add(id);
      else next.delete(id);
      return next;
    });
    setOverwrites((current) => {
      const next = { ...current };
      if (value && value !== SKIP) next[id] = value;
      else delete next[id];
      return next;
    });
  };

  const confirm = () => {
    if (!included) return;
    const keep = <T extends { id: string; name: string }>(items: T[]) =>
      items
        .filter((item) => !excluded(item.id))
        .map((item) => ({ ...item, name: names[item.id]?.trim() || item.name }));
    const chosen: ImportBundle = {
      ...bundle,
      presets: keep(bundle.presets),
      characters: keep(bundle.characters),
      emotionSets: keep(bundle.emotionSets),
      references: keep(bundle.references),
      projects: keep(bundle.projects),
      pieceSets: keep(bundle.pieceSets),
      images: Object.fromEntries(Object.entries(bundle.images).filter(([id]) => !excluded(id))),
    };
    const kept = Object.fromEntries(Object.entries(overwrites).filter(([id]) => !excluded(id)));
    close();
    void run('가져오는 중', () => applyBundle(chosen, kept));
  };

  return (
    <Modal
      title={`JSON 가져오기 · ${bundle.label}`}
      onClose={close}
      footer={
        <>
          <span className="hint">
            {included}/{total}개 가져옴
          </span>
          <button onClick={close}>취소</button>
          <button className="accent" disabled={!included} onClick={confirm}>
            가져오기
          </button>
        </>
      }
    >
      <p className="hint">
        이름이 같은 항목이 있을 때만 덮어쓰기 가능 · 덮어쓰면 그 항목을 쓰는 작업에도 반영
      </p>
      {GROUPS.filter((group) => bundle[group.key].length).map((group) => (
        <section className="card" key={group.key}>
          <header className="card-head">
            <div>
              <b>
                {group.label} {bundle[group.key].length}
              </b>
            </div>
          </header>
          <div className="card-body import-names">
            {bundle[group.key].map((item, index) => {
              const targets = sameNamed(library, group.key, item.name);
              const target = overwrites[item.id];
              const isBlocked = blocked.has(item.id);
              const value = isBlocked || skipped.has(item.id) ? SKIP : (target ?? '');
              return (
                <div className={`json-import-row ${value === SKIP ? 'skipped' : ''}`} key={item.id}>
                  <select
                    aria-label={`${item.name} 가져오는 방법`}
                    value={value}
                    disabled={isBlocked}
                    onChange={(event) => choose(item.id, event.target.value)}
                  >
                    <option value="">새로 추가</option>
                    {targets.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        덮어쓰기
                        {targets.length > 1 ? `: ${entry.name} (${entry.id.slice(0, 6)})` : ''}
                      </option>
                    ))}
                    <option value={SKIP}>추가 안 함</option>
                  </select>
                  {value === SKIP ? (
                    <span className="hint">
                      {isBlocked
                        ? `${item.name} · 이 항목이 쓰는 다른 항목을 추가하지 않아 함께 제외`
                        : item.name}
                    </span>
                  ) : target ? (
                    <span className="hint">"{item.name}" 내용 교체 · 이름 유지</span>
                  ) : (
                    <input
                      autoFocus={
                        index === 0 &&
                        group.key === GROUPS.find((entry) => bundle[entry.key].length)?.key
                      }
                      value={names[item.id] ?? ''}
                      aria-label={`${group.label} 이름`}
                      onChange={(event) =>
                        setNames((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                      onKeyDown={(event) => event.key === 'Enter' && confirm()}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {bundle.warnings.length > 0 && (
        <p className="hint">{bundle.warnings.slice(0, 3).join(' · ')}</p>
      )}
    </Modal>
  );
}

export async function importJsonText(raw: string, fileName: string): Promise<void> {
  const library = useStore.getState().library;
  if (!library) return;
  const bundle = parseImportFile(raw, fileName, library.presets[0].id);
  void openDialog((close) => <ImportReviewDialog bundle={bundle} close={close} />);
}

export function importJsonFromPicker(): Promise<void> {
  return run('JSON을 가져오는 중', async () => {
    const file = await fileApi().openJsonFile('가져올 JSON 선택');
    if (file) await importJsonText(file.text, file.name);
  }).then(() => undefined);
}
