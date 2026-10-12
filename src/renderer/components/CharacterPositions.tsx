import { useRef, useState, type PointerEvent } from 'react';
import type {
  CharacterCenter,
  CharacterPositionMode,
  CharacterSlot,
} from '../../core/domain/types';
import {
  canPositionCharacters,
  cellName,
  fillCenters,
  freeformPosition,
  POSITION_GRID,
  snapToGrid,
} from '../../core/model/characterPositions';
import { normalizeGenerationSettings, resolveProject } from '../../core/model/defaults';
import { modelInfo } from '../../core/providers/NaiModels';
import { resolveFreeGeneration, updateFreeGeneration, updateProject, useLibrary } from '../store';
import { ChainChip } from './ChainChip';
import { Modal, openDialog } from './Dialogs';

/** 작업이면 그 ID, 자유 생성이면 'free'. 창을 연 채로 칩에서 캐릭터를 바꿔도 따라오게 저장된 값을 읽는다. */
type Target = { projectId: string } | 'free';

type Placement = {
  slots: CharacterSlot[];
  names: string[];
  mode: CharacterPositionMode;
  model: string;
  width: number;
  height: number;
  save: (value: { slots?: CharacterSlot[]; mode?: CharacterPositionMode }) => void;
};

function usePlacement(target: Target): Placement | undefined {
  const library = useLibrary();
  if (target === 'free') {
    const { free, preset, characters } = resolveFreeGeneration(library);
    const settings = normalizeGenerationSettings(preset.generation);
    const image = free.mode === 'img2img' ? free.image : undefined;
    return {
      slots: free.characters,
      names: characters.map((item) => item.character.name),
      mode: free.positionMode,
      model: settings.model,
      width: image?.width ?? settings.width,
      height: image?.height ?? settings.height,
      save: ({ slots, mode }) =>
        updateFreeGeneration({
          ...(slots ? { characters: slots } : {}),
          ...(mode ? { positionMode: mode } : {}),
        }),
    };
  }
  const project = library.projects.find((item) => item.id === target.projectId);
  if (!project) return undefined;
  const resolved = resolveProject(library, project);
  const settings = normalizeGenerationSettings(
    resolved.preset?.generation ?? library.presets[0].generation,
  );
  const canvas = project.mode === 'reference' ? resolved.reference?.image : undefined;
  return {
    slots: project.characters,
    names: resolved.characters.map((item) => item.character.name),
    mode: project.positionMode,
    model: settings.model,
    width: canvas?.canvasWidth ?? settings.width,
    height: canvas?.canvasHeight ?? settings.height,
    save: ({ slots, mode }) =>
      updateProject(project.id, (current) => ({
        ...current,
        ...(slots ? { characters: slots } : {}),
        ...(mode ? { positionMode: mode } : {}),
      })),
  };
}

function positionUnavailable(model: string, count: number): string | undefined {
  if (canPositionCharacters(model, count)) return undefined;
  const generation = modelInfo(model)?.generation;
  if (generation === 'v3') return 'V3 모델은 캐릭터 위치를 정할 수 없습니다';
  if (generation === 'v4') return 'V4·V4.5는 캐릭터가 두 명 이상일 때 위치를 정할 수 있습니다';
  return '캐릭터를 먼저 넣으십시오';
}

/** 구성 막대의 위치 칩. 누르면 위치 창을 연다. */
export function PositionChip({ target }: { target: Target }) {
  const placement = usePlacement(target);
  if (!placement || !placement.slots.length) return null;
  const unavailable = positionUnavailable(placement.model, placement.slots.length);
  const open = () =>
    void openDialog((close) => <CharacterPositionDialog target={target} close={close} />);
  return (
    <ChainChip
      label={{
        text: '위치',
        icon: 'character',
        usage: unavailable ?? '캐릭터를 캔버스 어디에 둘지 정합니다',
      }}
    >
      <button className="chain-chip-value" disabled={Boolean(unavailable)} onClick={open}>
        {unavailable ? '정할 수 없음' : placement.mode === 'manual' ? '직접 지정' : 'AI가 정함'}
      </button>
    </ChainChip>
  );
}

const MARKER_COLORS = ['#4f9cf9', '#f97362', '#3fc88f', '#f2b84b', '#b07cf7', '#3bc4c4'];

export function CharacterPositionDialog({ target, close }: { target: Target; close: () => void }) {
  const placement = usePlacement(target);
  const board = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  if (!placement) return null;
  const { slots, names, model } = placement;
  const freeform = freeformPosition(model);
  const unavailable = positionUnavailable(model, slots.length);
  // 요청을 만들 때(`requestCenters`)와 같게, V4·V4.5에서는 V5에서 정한 자유 위치도 칸에 맞춰 보여 준다.
  const filled = fillCenters(slots.map((slot) => slot.center));
  const centers = freeform ? filled : filled.map(snapToGrid);
  const manual = placement.mode === 'manual' && !unavailable;

  const place = (index: number, center: CharacterCenter) =>
    placement.save({
      mode: 'manual',
      slots: slots.map((slot, at) => ({
        ...slot,
        center: at === index ? center : (slot.center ?? centers[at]),
      })),
    });
  const pointAt = (event: PointerEvent<HTMLDivElement>): CharacterCenter | undefined => {
    const rect = board.current?.getBoundingClientRect();
    if (!rect) return undefined;
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    // NovelAI 웹은 0.001 단위로 반올림해 보낸다.
    const center = {
      x: Math.round(clamp((event.clientX - rect.left) / rect.width) * 1000) / 1000,
      y: Math.round(clamp((event.clientY - rect.top) / rect.height) * 1000) / 1000,
    };
    return freeform ? center : snapToGrid(center);
  };
  const current = Math.min(selected, slots.length - 1);

  return (
    <Modal title="캐릭터 위치" onClose={close} wide>
      {unavailable ? (
        <p className="hint">{unavailable}.</p>
      ) : (
        <>
          <div className="segmented position-mode" role="group" aria-label="위치 정하는 방식">
            <button
              className={!manual ? 'active blue' : ''}
              aria-pressed={!manual}
              onClick={() => placement.save({ mode: 'ai' })}
            >
              AI가 정함
            </button>
            <button
              className={manual ? 'active blue' : ''}
              aria-pressed={manual}
              onClick={() => placement.save({ mode: 'manual' })}
            >
              직접 지정
            </button>
          </div>
          <p className="hint">
            {freeform
              ? 'V5는 캔버스 어디든 놓을 수 있습니다. 표시를 끌어 옮기십시오.'
              : 'V4·V4.5는 5×5 칸 중 하나에 놓습니다. 칸을 누르거나 표시를 끌어 옮기십시오.'}
          </p>
          <div
            ref={board}
            className={`position-board ${manual ? '' : 'disabled'}`}
            style={{
              aspectRatio: `${placement.width} / ${placement.height}`,
              width: `min(100%, calc(52vh * ${placement.width / placement.height}))`,
            }}
            onPointerDown={(event) => {
              if (!manual) return;
              const center = pointAt(event);
              if (!center) return;
              // 표시를 잡으면 그 캐릭터를, 빈 곳을 누르면 목록에서 고른 캐릭터를 옮긴다.
              const marker = (event.target as HTMLElement).closest<HTMLElement>('[data-marker]');
              const index = marker ? Number(marker.dataset.marker) : current;
              setSelected(index);
              event.currentTarget.setPointerCapture(event.pointerId);
              place(index, center);
            }}
            onPointerMove={(event) => {
              if (!manual || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const center = pointAt(event);
              if (center) place(current, center);
            }}
          >
            {!freeform &&
              POSITION_GRID.map((y) =>
                POSITION_GRID.map((x) => (
                  <span
                    key={`${x}-${y}`}
                    className="position-cell"
                    style={{ left: `${(x - 0.1) * 100}%`, top: `${(y - 0.1) * 100}%` }}
                  >
                    {cellName({ x, y })}
                  </span>
                )),
              )}
            {centers.map((center, index) => (
              <span
                key={index}
                data-marker={index}
                className={`position-marker ${index === current && manual ? 'selected' : ''}`}
                title={names[index]}
                style={{
                  left: `${center.x * 100}%`,
                  top: `${center.y * 100}%`,
                  background: MARKER_COLORS[index % MARKER_COLORS.length],
                }}
              >
                {index + 1}
              </span>
            ))}
          </div>
          <ol className="position-legend">
            {centers.map((center, index) => (
              <li key={index}>
                <button
                  className={index === current && manual ? 'active' : ''}
                  disabled={!manual}
                  onClick={() => setSelected(index)}
                >
                  <i style={{ background: MARKER_COLORS[index % MARKER_COLORS.length] }}>
                    {index + 1}
                  </i>
                  {names[index] ?? '(없음)'}
                  <small>
                    {manual
                      ? freeform
                        ? `${center.x.toFixed(2)}, ${center.y.toFixed(2)}`
                        : cellName(center)
                      : 'AI가 정함'}
                  </small>
                </button>
              </li>
            ))}
          </ol>
          <p className="hint">
            목록에서 캐릭터를 고른 뒤 캔버스를 누르면 그 캐릭터가 옮겨집니다. 바꾼 위치는 바로
            저장됩니다.
          </p>
        </>
      )}
    </Modal>
  );
}
