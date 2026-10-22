import { useState } from 'react';
import type { ImportBundle, ImportOverwrites } from '../../core/backup/Backups';
import { useStore } from '../store';
import { Modal } from './Dialogs';

type NamedGroup =
  | 'presets'
  | 'characters'
  | 'emotionSets'
  | 'references'
  | 'characterReferences'
  | 'vibes'
  | 'projects'
  | 'pieceSets';

const GROUPS: Array<{ key: NamedGroup; label: string }> = [
  { key: 'presets', label: '생성 설정' },
  { key: 'characters', label: '캐릭터' },
  { key: 'emotionSets', label: '씬 모음' },
  { key: 'references', label: '인페인트' },
  { key: 'characterReferences', label: '캐릭터 레퍼런스' },
  { key: 'vibes', label: '바이브' },
  { key: 'projects', label: '작업' },
  { key: 'pieceSets', label: '프롬프트 조각' },
];

/** 레퍼런스와 작업은 항상 새로 추가한다. */
const OVERWRITABLE = new Set<NamedGroup>(['presets', 'characters', 'emotionSets', 'pieceSets']);

const SKIP = '__skip';

function sameNamed(
  library: ReturnType<typeof useStore.getState>['library'],
  key: NamedGroup,
  name: string,
): Array<{ id: string; name: string }> {
  if (!library || !OVERWRITABLE.has(key)) return [];
  return library[key].filter((entry) => entry.name.trim() === name.trim());
}

/** 같이 빼지 않으면 없는 항목을 가리킨다. */
function blockedProjects(bundle: ImportBundle, skipped: Set<string>): Set<string> {
  return new Set(
    bundle.projects
      .filter((project) =>
        [
          project.presetId,
          ...project.characters.map((slot) => slot.characterId),
          project.emotionSetId,
          project.referenceId,
          ...project.characterReferenceIds,
          ...project.vibeIds,
        ].some((id) => skipped.has(id)),
      )
      .map((project) => project.id),
  );
}

export function ImportReviewDialog(props: {
  bundle: ImportBundle;
  close: () => void;
  onImport: (bundle: ImportBundle, overwrites: ImportOverwrites) => void;
}) {
  const { bundle, close } = props;
  const library = useStore((state) => state.library);
  const view = useStore((state) => state.view);
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      GROUPS.flatMap((group) => bundle[group.key].map((item) => [item.id, item.name])),
    ),
  );
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [overwrites, setOverwrites] = useState<ImportOverwrites>(() => {
    // 프롬프트가 조각을 세트 이름으로 부르므로 같은 이름 세트는 덮어쓰기가 기본.
    const defaults: ImportOverwrites = Object.fromEntries(
      bundle.pieceSets.flatMap((item) => {
        const existing = sameNamed(library, 'pieceSets', item.name)[0];
        return existing ? [[item.id, existing.id]] : [];
      }),
    );
    // 보고 있는 항목과 같은 이름 하나만 가져오면 덮어쓰기가 기본.
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
      characterReferences: keep(bundle.characterReferences),
      vibes: keep(bundle.vibes),
      projects: keep(bundle.projects),
      pieceSets: keep(bundle.pieceSets),
      images: Object.fromEntries(Object.entries(bundle.images).filter(([id]) => !excluded(id))),
    };
    const kept = Object.fromEntries(Object.entries(overwrites).filter(([id]) => !excluded(id)));
    close();
    props.onImport(chosen, kept);
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
                      {isBlocked ? `${item.name} · 쓰는 항목이 빠져 함께 제외` : item.name}
                    </span>
                  ) : target ? (
                    <span className="hint">{item.name}</span>
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
