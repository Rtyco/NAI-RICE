import type { ReactNode } from 'react';
import type { Character, CharacterPromptSet, Preset } from '../../core/domain/types';
import { projectsUsing } from '../../core/model/defaults';
import { patchItem, updatePromptSet } from '../../core/model/mutations';
import {
  resolveFreeGeneration,
  togglePromptPanel,
  updateLibrary,
  useLibrary,
  useResolvedProject,
  useStore,
} from '../store';
import { LibraryEditorDialog } from '../views/library/LibraryEditorDialog';
import { PreviewDialog } from '../views/ProjectView';
import { openDialog } from './Dialogs';
import { Icon } from './Icon';
import { PromptField } from './ui';

function editInPopup(section: 'presets' | 'characters', itemId: string) {
  void openDialog((close) => (
    <LibraryEditorDialog section={section} itemId={itemId} close={close} />
  ));
}

/** 여러 작업이 같은 항목을 쓰면 함께 바뀐다는 것을 알린다. `ownUses`는 지금 화면이 차지하는 몫이다. */
function sharedHint(uses: number, ownUses: number): string | undefined {
  const others = uses - ownUses;
  return others > 0 ? `다른 작업 ${others}개에도 함께 반영됩니다.` : undefined;
}

/**
 * 작업·자유 생성 화면 왼쪽의 프롬프트 패널. 지금 고른 생성 설정의 공통 프롬프트와 캐릭터 프롬프트 세트를
 * 라이브러리로 가지 않고 고친다. 바꾼 값은 라이브러리 항목에 바로 저장된다.
 */
export function PromptPanel(props: {
  preset?: Preset;
  character?: Character;
  promptSet?: CharacterPromptSet;
  /** 자유 생성이면 비워 둔다. 공유 안내에서 이 작업은 빼고 센다. */
  projectId?: string;
  /** 캐릭터가 없을 때 보일 안내. */
  noCharacter: string;
  footer?: ReactNode;
}) {
  const { preset, character, promptSet } = props;
  const library = useLibrary();
  const collapsed = useStore((state) => state.promptPanelCollapsed);
  const own = props.projectId ? 1 : 0;
  const presetShared =
    preset && sharedHint(projectsUsing(library, 'preset', preset.id).length, own);
  const characterShared =
    character && sharedHint(projectsUsing(library, 'character', character.id).length, own);

  const patchPreset = (value: Partial<Pick<Preset, 'commonPositive' | 'commonNegative'>>) =>
    preset &&
    updateLibrary((current) =>
      patchItem(current, 'presets', preset.id, (item) => ({ ...item, ...value })),
    );
  const patchPromptSet = (value: Partial<Pick<CharacterPromptSet, 'positive' | 'negative'>>) =>
    character &&
    promptSet &&
    updateLibrary((current) =>
      patchItem(current, 'characters', character.id, (item) =>
        updatePromptSet(item, promptSet.id, value),
      ),
    );

  if (collapsed) {
    return (
      <aside className="library-list prompt-panel collapsed" aria-label="프롬프트">
        <div className="library-list-head">
          <button
            className="icon-button library-list-toggle"
            title="프롬프트 패널 펼치기"
            aria-label="프롬프트 패널 펼치기"
            onClick={togglePromptPanel}
          >
            <Icon name="sidebar" size={18} />
          </button>
        </div>
        <div className="prompt-panel-icons">
          <button
            className="icon-button"
            title={preset ? `공통 프롬프트 · ${preset.name}` : '생성 설정 없음'}
            onClick={togglePromptPanel}
          >
            <Icon name="preset" size={18} />
          </button>
          <button
            className="icon-button"
            title={character ? `캐릭터 프롬프트 · ${character.name}` : props.noCharacter}
            onClick={togglePromptPanel}
          >
            <Icon name="character" size={18} />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="library-list prompt-panel" aria-label="프롬프트">
      <div className="library-list-head">
        <button
          className="icon-button library-list-toggle"
          title="프롬프트 패널 접기"
          aria-label="프롬프트 패널 접기"
          onClick={togglePromptPanel}
        >
          <Icon name="sidebar" size={18} />
        </button>
        <div className="library-list-title">
          <b>프롬프트</b>
          <small>고른 생성 설정과 캐릭터에 바로 저장됩니다</small>
        </div>
      </div>
      <div className="prompt-panel-body">
        <section className="prompt-panel-section">
          <div className="prompt-panel-section-head">
            <Icon name="preset" size={14} />
            <b>{preset?.name ?? '생성 설정 없음'}</b>
            {preset && (
              <button
                className="icon-button"
                title="생성 설정 편집"
                aria-label="생성 설정 편집"
                onClick={() => editInPopup('presets', preset.id)}
              >
                <Icon name="edit" size={14} />
              </button>
            )}
          </div>
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
                value={preset.commonNegative}
                rows={3}
                onChange={(commonNegative) => patchPreset({ commonNegative })}
              />
              {presetShared && <p className="hint">{presetShared}</p>}
            </>
          ) : (
            <p className="hint">위쪽에서 생성 설정을 고르십시오.</p>
          )}
        </section>

        <section className="prompt-panel-section">
          <div className="prompt-panel-section-head">
            <Icon name="character" size={14} />
            <b>
              {character
                ? character.promptSets.length > 1 && promptSet
                  ? `${character.name} / ${promptSet.name}`
                  : character.name
                : '캐릭터 없음'}
            </b>
            {character && (
              <button
                className="icon-button"
                title="캐릭터 편집"
                aria-label="캐릭터 편집"
                onClick={() => editInPopup('characters', character.id)}
              >
                <Icon name="edit" size={14} />
              </button>
            )}
          </div>
          {character && promptSet ? (
            <>
              <PromptField
                label="캐릭터 포지티브"
                value={promptSet.positive}
                rows={6}
                placeholder="외형, 복장, 정체성 등 캐릭터 전용 태그"
                onChange={(positive) => patchPromptSet({ positive })}
              />
              <PromptField
                label="캐릭터 네거티브"
                tone="negative"
                value={promptSet.negative}
                rows={3}
                onChange={(negative) => patchPromptSet({ negative })}
              />
              {characterShared && <p className="hint">{characterShared}</p>}
            </>
          ) : (
            <p className="hint">{props.noCharacter}</p>
          )}
        </section>
        {props.footer}
      </div>
    </aside>
  );
}

/** 라이브러리 화면처럼 왼쪽에 패널, 오른쪽에 화면 본문을 둔다. */
export function PromptPanelLayout(props: { panel: ReactNode; children: ReactNode }) {
  const collapsed = useStore((state) => state.promptPanelCollapsed);
  return (
    <div className={`prompt-panel-view ${collapsed ? 'panel-collapsed' : ''}`}>
      {props.panel}
      {props.children}
    </div>
  );
}

export function ProjectPromptPanel({ projectId }: { projectId: string }) {
  const resolved = useResolvedProject(projectId);
  if (!resolved) return null;
  return (
    <PromptPanel
      preset={resolved.preset}
      character={resolved.character}
      promptSet={resolved.promptSet}
      projectId={projectId}
      noCharacter="위쪽에서 캐릭터를 고르십시오."
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
  const { preset, character, promptSet } = resolveFreeGeneration(useLibrary());
  return (
    <PromptPanel
      preset={preset}
      character={character}
      promptSet={promptSet}
      noCharacter="캐릭터 없이 생성합니다. 위쪽에서 캐릭터를 고르면 여기서 고칠 수 있습니다."
    />
  );
}
