import type { SceneOption } from '../../core/domain/types';
import { Icon } from './Icon';
import { PromptTextarea } from './PromptTextarea';
import { ExpandTextButton } from './TextEditorDialog';

export type OptionProps = {
  option: SceneOption;
  /** 크게 편집 창 제목 앞부분 */
  title: string;
  names: string[];
  characterCount: number;
  /** 씬 자리(없음) 또는 캐릭터 몫에서 경고할 겹친 태그 */
  repeated: (character?: number) => ReadonlySet<string>;
  patch: (patch: Partial<SceneOption>) => void;
  setCharacterPrompt: (index: number, value: string) => void;
  remove: () => void;
};

const characterName = (names: string[], index: number) => names[index] ?? `캐릭터 ${index + 1}`;

function PromptCell(props: {
  title: string;
  label: string;
  value: string;
  placeholder?: string;
  repeated: ReadonlySet<string>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="prompt-cell">
      <PromptTextarea
        rows={2}
        value={props.value}
        aria-label={props.label}
        placeholder={props.placeholder}
        repeated={props.repeated}
        onChange={props.onChange}
      />
      <ExpandTextButton
        title={props.title}
        value={props.value}
        placeholder={props.placeholder}
        onApply={props.onChange}
      />
    </div>
  );
}

function OptionCheck({ option, patch }: Pick<OptionProps, 'option' | 'patch'>) {
  return (
    <input
      type="checkbox"
      checked={option.enabled}
      title="조합에 넣기"
      onChange={(event) => patch({ enabled: event.target.checked })}
    />
  );
}

function OptionName({ option, patch }: Pick<OptionProps, 'option' | 'patch'>) {
  return (
    <input
      className="scene-option-name"
      value={option.name ?? ''}
      placeholder="후보 이름"
      aria-label="후보 이름"
      onChange={(event) => patch({ name: event.target.value || undefined })}
    />
  );
}

function RemoveOption({ remove }: Pick<OptionProps, 'remove'>) {
  return (
    <button className="icon-button danger row-remove" title="후보 삭제" onClick={remove}>
      ×
    </button>
  );
}

export function SceneOptionItem(props: OptionProps & { open: boolean; toggle: () => void }) {
  const { option, names, characterCount, open } = props;
  const filled = option.characterPrompts.filter((prompt) => prompt.trim()).length;
  const name = option.name?.trim();
  return (
    <div className={`scene-option ${option.enabled ? '' : 'off'} ${open ? 'open' : ''}`}>
      <div className="scene-option-head">
        <OptionCheck option={option} patch={props.patch} />
        <button
          className="scene-option-toggle"
          aria-expanded={open}
          title={open ? '접기' : '펼치기'}
          onClick={props.toggle}
        >
          <Icon name="chevron" size={12} className="section-chevron" />
          {!open && (
            <>
              {name && <b>{name}</b>}
              <span>{option.prompt.trim() || (name ? '' : '(빈 후보)')}</span>
              {filled > 0 && <small>+{filled}</small>}
            </>
          )}
        </button>
        {open && <OptionName option={option} patch={props.patch} />}
        <RemoveOption remove={props.remove} />
      </div>
      {open && (
        <>
          <PromptCell
            title={`${props.title} · 씬 자리`}
            label="후보 프롬프트"
            value={option.prompt}
            placeholder="씬 프롬프트 자리에 붙음"
            repeated={props.repeated()}
            onChange={(prompt) => props.patch({ prompt })}
          />
          {characterCount > 0 && (
            <div className="scene-option-chars">
              {Array.from({ length: characterCount }, (_, index) => (
                <div className="emotion-extra-prompt" key={index}>
                  <span>{characterName(names, index)}</span>
                  <PromptCell
                    title={`${props.title} · ${characterName(names, index)}`}
                    label={`${characterName(names, index)} 몫`}
                    value={option.characterPrompts[index] ?? ''}
                    placeholder="이 캐릭터 프롬프트에 붙음"
                    repeated={props.repeated(index)}
                    onChange={(value) => props.setCharacterPrompt(index, value)}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SceneOptionTable(props: {
  slot: SceneOption[];
  names: string[];
  characterCount: number;
  option: (option: SceneOption) => OptionProps;
}) {
  const characters = Array.from({ length: props.characterCount }, (_, index) => index);
  return (
    <div className="scene-option-table-wrap">
      <table className="scene-option-table">
        <colgroup>
          <col className="check" />
          <col className="name" />
          <col />
          <col className="remove" />
        </colgroup>
        <thead>
          <tr>
            <th />
            <th>이름</th>
            <th>{characters.length ? '프롬프트' : '씬 자리'}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {props.slot.map((option) => {
            const row = props.option(option);
            const scenePrompt = (
              <PromptCell
                title={`${row.title} · 씬 자리`}
                label="후보 프롬프트"
                value={option.prompt}
                repeated={row.repeated()}
                onChange={(prompt) => row.patch({ prompt })}
              />
            );
            return (
              <tr key={option.id} className={option.enabled ? '' : 'off'}>
                <td>
                  <OptionCheck option={option} patch={row.patch} />
                </td>
                <td>
                  <OptionName option={option} patch={row.patch} />
                </td>
                <td>
                  {characters.length ? (
                    <div className="scene-option-lines">
                      <div className="emotion-extra-prompt">
                        <span>씬 자리</span>
                        {scenePrompt}
                      </div>
                      {characters.map((index) => (
                        <div className="emotion-extra-prompt" key={index}>
                          <span>{characterName(props.names, index)}</span>
                          <PromptCell
                            title={`${row.title} · ${characterName(props.names, index)}`}
                            label={`${characterName(props.names, index)} 몫`}
                            value={option.characterPrompts[index] ?? ''}
                            repeated={row.repeated(index)}
                            onChange={(value) => row.setCharacterPrompt(index, value)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    scenePrompt
                  )}
                </td>
                <td>
                  <RemoveOption remove={row.remove} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
