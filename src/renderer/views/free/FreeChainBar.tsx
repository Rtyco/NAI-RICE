import { useRef } from 'react';
import type { FreeGeneration, Preset } from '../../../core/domain/types';
import { maxCharactersFor } from '../../../core/providers/NaiModels';
import { AidChip } from '../../components/AidChip';
import { ChecklistChip, SizeChip } from '../../components/ChainChip';
import { CharacterChip } from '../../components/CharacterChip';
import { PositionChip } from '../../components/CharacterPositions';
import { RefineChip } from '../../components/RefineChip';
import { TopBarToggle } from '../../components/TopBarToggle';
import { useChainBarFit } from '../../components/useHeaderFit';
import { freeRefineTarget } from '../../refineTargets';
import { updateFreeGeneration } from '../../store';

/** 접으면 같은 칩들을 화면 머리줄 안에 작게 둔다. */
export function FreeChainBar(props: {
  free: FreeGeneration;
  preset?: Preset;
  presets: Preset[];
  compact: boolean;
}) {
  const { free, preset } = props;
  const bar = useRef<HTMLDivElement>(null);
  const className = useChainBarFit(bar, props.compact);
  return (
    <div ref={bar} className={className}>
      <ChecklistChip
        section="presets"
        itemId={preset?.id}
        missing={!preset}
        value={preset?.name ?? '(없음)'}
        items={props.presets}
        checked={preset ? [preset.id] : []}
        onPick={(presetId) => updateFreeGeneration({ presetId })}
        editSection="presets"
      />
      <CharacterChip
        slots={free.characters}
        optional
        max={maxCharactersFor(preset?.generation.model)}
        onChange={(characters) => updateFreeGeneration({ characters })}
      />
      <PositionChip target="free" />
      {preset && free.mode === 'txt2img' && <SizeChip preset={preset} />}
      <AidChip
        value={free}
        onChange={updateFreeGeneration}
        model={preset?.generation.model}
        inpaint={free.mode === 'img2img' && free.inpaint}
      />
      {free.mode !== 'augment' && <RefineChip target={freeRefineTarget(free, preset)} />}
      <TopBarToggle collapsed={props.compact} />
    </div>
  );
}
