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
import { Modal } from './Dialogs';
import { openDialog } from './dialogStack';

/** 창을 연 채로 캐릭터를 바꿔도 따라오도록 저장된 값을 읽는다. */
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
        icon: 'pin',
        usage: unavailable ?? '캐릭터를 캔버스 어디에 둘지 정합니다',
      }}
      edit={unavailable ? null : { title: '캐릭터 위치 정하기', open }}
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
  // `requestCenters`처럼 V4·V4.5에서는 자유 위치도 칸에 맞춰 보인다.
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
              // 표시를 잡으면 그 캐릭터, 빈 곳이면 목록에서 고른 캐릭터를 옮긴다.
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
        </>
      )}
    </Modal>
  );
}
