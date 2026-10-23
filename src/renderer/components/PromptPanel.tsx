import { useMemo, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Character, CharacterPromptSet, Preset } from '../../core/domain/types';
import {
  effectiveGenerationSettings,
  projectsUsing,
  type ResolvedCharacter,
} from '../../core/model/defaults';
import { patchItem, updatePromptSet } from '../../core/model/mutations';
import { usesMedium } from '../../core/providers/NaiModels';
import {
  cyclePromptPanel,
  historyShownOf,
  promptPanelStageOf,
  resolveFreeGeneration,
  sameCharacters,
  stageTitle,
  togglePromptGroup,
  updateLibrary,
  useResolvedProject,
  useStore,
  useStoreMemo,
} from '../store';
import { LibraryEditorDialog } from '../views/library/LibraryEditorDialog';
import { PreviewDialog } from '../views/ProjectView';
import { freeTokenScenes, projectTokenScenes, sameTokenScenes } from '../promptTokens';
import { openDialog } from './dialogStack';
import { Icon } from './Icon';
import { PanelResizer } from './PanelResizer';
import { TokenMeter } from './TokenMeter';
import { PromptField } from './ui';

function editInPopup(section: 'presets' | 'characters', itemId: string) {
  void openDialog((close) => (
    <LibraryEditorDialog section={section} itemId={itemId} close={close} />
  ));
}

/** `ownUses`는 지금 화면이 차지하는 몫 */
function sharedHint(uses: number, ownUses: number): string | undefined {
  const others = uses - ownUses;
  return others > 0 ? `다른 작업 ${others}개에도 함께 반영됩니다.` : undefined;
}

function PromptCard(props: {
  groupKey: string;
  icon: 'preset' | 'character';
  order?: number;
  title: string;
  peek: string;
  edit?: { title: string; open: () => void };
  children: ReactNode;
}) {
  const folded = useStore((state) => state.foldedPromptGroups.includes(props.groupKey));
  return (
    <section className={`prompt-card ${folded ? 'folded' : ''}`}>
      <div className="prompt-card-head">
        <button
          className="prompt-card-toggle"
          aria-expanded={!folded}
          title={folded ? '펼치기' : '접기'}
          onClick={() => togglePromptGroup(props.groupKey)}
        >
          <Icon name="chevron" size={12} className="section-chevron" />
          {props.order ? (
            <span className="prompt-panel-order">{props.order}</span>
          ) : (
            <Icon name={props.icon} size={14} />
          )}
          <span className="prompt-card-title">
            <b>{props.title}</b>
            {folded && <small>{props.peek.trim() || '(비어 있음)'}</small>}
          </span>
        </button>
        {props.edit && (
          <button
            className="icon-button"
            title={props.edit.title}
            aria-label={props.edit.title}
            onClick={props.edit.open}
          >
            <Icon name="edit" size={14} />
          </button>
        )}
      </div>
      {!folded && <div className="prompt-card-body">{props.children}</div>}
    </section>
  );
}

/** 고친 값은 라이브러리 항목에 바로 저장되어 같은 항목을 쓰는 곳이 모두 바뀐다. */
export function PromptPanel(props: {
  preset?: Preset;
  characters: ResolvedCharacter[];
  /** 자유 생성이면 없다. */
  projectId?: string;
  noCharacter: string;
  meter?: ReactNode;
  footer?: ReactNode;
}) {
  const { preset, characters } = props;
  const presetUses = useStore((state) =>
    preset ? projectsUsing(state.library!, 'preset', preset.id).length : 0,
  );
  const characterUses = useStore(
    useShallow((state) =>
      characters.map(
        ({ character }) => projectsUsing(state.library!, 'character', character.id).length,
      ),
    ),
  );
  const stage = useStore(promptPanelStageOf);
  const foldedGroups = useStore((state) => state.foldedPromptGroups);
  const own = props.projectId ? 1 : 0;
  const presetShared = preset && sharedHint(presetUses, own);
  const unusedInMedium =
    preset && usesMedium(preset.generation) ? 'Medium에서는 쓰이지 않음' : undefined;

  const patchPreset = (value: Partial<Pick<Preset, 'commonPositive' | 'commonNegative'>>) =>
    preset &&
    updateLibrary((current) =>
      patchItem(current, 'presets', preset.id, (item) => ({ ...item, ...value })),
    );
  const patchPromptSet = (
    character: Character,
    promptSet: CharacterPromptSet,
    value: Partial<Pick<CharacterPromptSet, 'positive' | 'negative'>>,
  ) =>
    updateLibrary((current) =>
      patchItem(current, 'characters', character.id, (item) =>
        updatePromptSet(item, promptSet.id, value),
      ),
    );

  return (
    <aside
      className={`library-list prompt-panel ${stage === 'hidden' ? 'stage-hidden' : ''}`}
      aria-label="프롬프트"
    >
      <div className="library-list-head">
        <button
          className="icon-button library-list-toggle"
          title={stageTitle('프롬프트 패널', 'promptPanelStage', stage, 'F7')}
          aria-label={stageTitle('프롬프트 패널', 'promptPanelStage', stage)}
          onClick={cyclePromptPanel}
        >
          <Icon name="chevron-left" size={18} />
        </button>
        <div className="library-list-title">
          <b>프롬프트</b>
        </div>
      </div>
      <div className="prompt-panel-body">
        <PromptCard
          groupKey="preset"
          icon="preset"
          title={preset?.name ?? '생성 설정 없음'}
          peek={preset?.commonPositive ?? ''}
          edit={
            preset && { title: '생성 설정 편집', open: () => editInPopup('presets', preset.id) }
          }
        >
          {preset ? (
            <>
              <PromptField
                label="공통 포지티브"
                value={preset.commonPositive}
                rows={6}
                placeholder="화풍, 품질 등 모든 캐릭터에 공통으로 쓸 태그"
                onChange={(commonPositive) => patchPreset({ commonPositive })}
              />
              <PromptField
                label="공통 네거티브"
                tone="negative"
                hint={unusedInMedium}
                value={preset.commonNegative}
                rows={3}
                onChange={(commonNegative) => patchPreset({ commonNegative })}
              />
              {presetShared && <p className="hint">{presetShared}</p>}
            </>
          ) : (
            <p className="hint">위쪽에서 생성 설정을 고르십시오.</p>
          )}
        </PromptCard>

        <div className="prompt-group">
          <div className="prompt-group-head">
            <Icon name="character" size={14} />
            <b>캐릭터 프롬프트</b>
            {characters.length > 1 && (
              <>
                <small>{characters.length}명</small>
                <button
                  className="link-button"
                  onClick={() => {
                    const keys = characters.map((item) => `character:${item.character.id}`);
                    const fold = !keys.every((key) => foldedGroups.includes(key));
                    for (const key of keys) togglePromptGroup(key, fold);
                  }}
                >
                  {characters.every((item) =>
                    foldedGroups.includes(`character:${item.character.id}`),
                  )
                    ? '모두 펴기'
                    : '모두 접기'}
                </button>
              </>
            )}
          </div>
          {characters.map(({ character, promptSet }, index) => {
            const shared = sharedHint(characterUses[index], own);
            return (
              <PromptCard
                key={`${index}-${character.id}`}
                groupKey={`character:${character.id}`}
                icon="character"
                order={characters.length > 1 ? index + 1 : undefined}
                title={
                  character.promptSets.length > 1
                    ? `${character.name} / ${promptSet.name}`
                    : character.name
                }
                peek={promptSet.positive}
                edit={{ title: '캐릭터 편집', open: () => editInPopup('characters', character.id) }}
              >
                <PromptField
                  label="캐릭터 포지티브"
                  value={promptSet.positive}
                  rows={characters.length > 1 ? 4 : 6}
                  placeholder="외형, 복장, 정체성 등 캐릭터 전용 태그"
                  onChange={(positive) => patchPromptSet(character, promptSet, { positive })}
                />
                <PromptField
                  label="캐릭터 네거티브"
                  tone="negative"
                  hint={unusedInMedium}
                  value={promptSet.negative}
                  rows={characters.length > 1 ? 2 : 3}
                  onChange={(negative) => patchPromptSet(character, promptSet, { negative })}
                />
                {shared && <p className="hint">{shared}</p>}
              </PromptCard>
            );
          })}
          {!characters.length && <p className="hint">{props.noCharacter}</p>}
        </div>
        {props.meter}
        {props.footer}
      </div>
    </aside>
  );
}

function presetModel(preset: Preset | undefined): string | undefined {
  return preset && effectiveGenerationSettings(preset.generation).model;
}

export function PromptPanelLayout(props: {
  panel: ReactNode;
  children: ReactNode;
  history: ReactNode;
}) {
  const stage = useStore(promptPanelStageOf);
  const historyCollapsed = useStore((state) => !historyShownOf(state));
  return (
    <div
      className={`prompt-panel-view panel-${stage} ${historyCollapsed ? 'history-collapsed' : ''}`}
    >
      {props.panel}
      {stage === 'open' && <PanelResizer panel="prompt-panel" />}
      {props.children}
      {props.history}
      {!historyCollapsed && <PanelResizer panel="history-panel" />}
    </div>
  );
}

/** 숨긴 패널은 자리가 없어 화면 머리줄 왼쪽 끝에서 다시 연다. */
export function PromptPanelToggle() {
  const hidden = useStore((state) => promptPanelStageOf(state) === 'hidden');
  if (!hidden) return null;
  return (
    <button
      className="icon-button"
      title={stageTitle('프롬프트 패널', 'promptPanelStage', 'hidden', 'F7')}
      aria-label={stageTitle('프롬프트 패널', 'promptPanelStage', 'hidden')}
      onClick={cyclePromptPanel}
    >
      <Icon name="prompt" size={18} />
    </button>
  );
}

export function ProjectPromptPanel({ projectId }: { projectId: string }) {
  const resolved = useResolvedProject(projectId);
  const pieceSets = useStore((state) => state.library?.pieceSets);
  const scenes = useMemo(
    () => (resolved ? projectTokenScenes(resolved, pieceSets ?? []) : []),
    [resolved, pieceSets],
  );
  if (!resolved) return null;
  return (
    <PromptPanel
      preset={resolved.preset}
      characters={resolved.characters}
      projectId={projectId}
      noCharacter="캐릭터 없이 생성합니다."
      meter={<TokenMeter model={presetModel(resolved.preset)} scenes={scenes} />}
      footer={
        <button
          className="with-icon prompt-panel-preview"
          title="씬 프롬프트까지 합친 최종 요청을 봅니다"
          onClick={() =>
            void openDialog((close) => <PreviewDialog resolved={resolved} close={close} />)
          }
        >
          <Icon name="info" size={14} /> 최종 요청 미리보기
        </button>
      }
    />
  );
}

export function FreePromptPanel() {
  const { preset, characters } = useStoreMemo(
    (state) => resolveFreeGeneration(state.library!),
    (a, b) => a.preset === b.preset && sameCharacters(a.characters, b.characters),
  );
  const scenes = useStoreMemo((state) => freeTokenScenes(state.library!), sameTokenScenes);
  return (
    <PromptPanel
      preset={preset}
      characters={characters}
      noCharacter="캐릭터 없이 생성합니다."
      meter={<TokenMeter model={presetModel(preset)} scenes={scenes} />}
    />
  );
}
