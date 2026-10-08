import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasLayout, Rect, Reference, ReferenceSide } from '../../core/domain/types';
import { computeLayout, CUSTOM_MAX, CUSTOM_MIN, RESOLUTION_PRESETS, snapDimension } from '../../core/imaging/CanvasLayout';
import { maskHasGeneratePixels } from '../../core/imaging/MaskBuilder';
import { cropOutside, suggestOutputRect } from '../../core/imaging/OutputCropper';
import { clampRect, expandRect } from '../../core/imaging/rects';
import { patchItem } from '../../core/model/mutations';
import { checkFreeGeneration } from '../../core/providers/NaiCost';
import { ReferenceCanvas } from '../components/ReferenceCanvas';
import { EmptyState, NumberField, PanelHeading, SelectField } from '../components/ui';
import { composeCanvas, decodeMask, layoutMaskFor, masksEqual, prepareImage } from '../lib/image';
import { errorMessage, run, scheduleSave, setPendingReference, toast, updateLibrary, useStore } from '../store';
import { fileApi, libraryApi } from '../desktop';

type Source = { dataUrl: string; name: string; changed: boolean };

type Working = {
  canvasDataUrl: string;
  width: number;
  height: number;
  backgroundMask: Uint8Array;
  detectionLabel: string;
};

const SIDES: Array<{ value: ReferenceSide; label: string }> = [
  { value: 'left', label: '왼쪽' },
  { value: 'right', label: '오른쪽' },
  { value: 'top', label: '위쪽' },
  { value: 'bottom', label: '아래쪽' },
];

/** 레이아웃을 빠르게 바꿀 때(색상 드래그, 슬라이더) 마지막 값만 다시 그린다. */
const REBUILD_DELAY_MS = 180;

function detectionText(mode: string, confidence: number): string {
  const label = mode === 'transparent' ? '투명 배경' : mode === 'solid' ? '단색 배경' : '수동 확인 필요';
  return `${label} · 신뢰도 ${Math.round(confidence * 100)}%`;
}

export function ReferenceEditor({ reference }: { reference: Reference }) {
  const pendingReference = useStore((state) => state.pendingReference);
  const presets = useStore((state) => state.library?.presets ?? []);
  const [loading, setLoading] = useState(Boolean(reference.image));
  const [source, setSource] = useState<Source | null>(null);
  const [layout, setLayout] = useState<CanvasLayout>(reference.layout);
  const [working, setWorking] = useState<Working | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [referenceRect, setReferenceRect] = useState<Rect>(reference.image?.referenceRect ?? { x: 0, y: 0, width: 1, height: 1 });
  const [outputRect, setOutputRect] = useState<Rect>(reference.image?.outputRect ?? { x: 0, y: 0, width: 1, height: 1 });
  const [expansionPx, setExpansionPx] = useState(reference.maskExpansionPx);
  // 재구성은 비동기로 끝나므로 그때의 확장 값을 ref로 읽는다.
  const expansionRef = useRef(expansionPx);
  expansionRef.current = expansionPx;
  const [threshold, setThreshold] = useState(reference.backgroundThreshold);
  const [initialMask, setInitialMask] = useState<Uint8Array>();
  const [mask, setMask] = useState<{ data: Uint8Array; url: string }>();
  const savedMask = useRef<Uint8Array | undefined>(undefined);
  const dirty = useRef(false);
  const rebuildTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rebuildSeq = useRef(0);

  // 저장된 레퍼런스 불러오기
  useEffect(() => {
    if (!reference.image) return;
    let active = true;
    void (async () => {
      try {
        const image = reference.image!;
        const images = await libraryApi().readReferenceImages(reference);
        if (!images || !active) return;
        const loadedMask = await decodeMask(images.maskDataUrl, image.canvasWidth, image.canvasHeight);
        let backgroundMask: Uint8Array;
        let detectionLabel = '저장된 마스크';
        if (reference.layout.mode === 'auto') {
          backgroundMask = layoutMaskFor(reference.layout);
        } else {
          const prepared = await prepareImage(images.canvasDataUrl, reference.backgroundThreshold);
          backgroundMask = prepared.backgroundMask;
          detectionLabel = `저장된 마스크 · ${detectionText(prepared.detection.mode, prepared.detection.confidence)}`;
        }
        if (!active) return;
        savedMask.current = loadedMask;
        setSource({ dataUrl: images.originalDataUrl, name: image.originalName, changed: false });
        setWorking({
          canvasDataUrl: images.canvasDataUrl,
          width: image.canvasWidth,
          height: image.canvasHeight,
          backgroundMask,
          detectionLabel,
        });
        setInitialMask(loadedMask);
        // 예전 버전에서 저장한 크롭이 보호 영역과 겹치면 바깥으로 맞추고 저장한다.
        const blocked = expandRect(image.referenceRect, reference.maskExpansionPx, image.canvasWidth, image.canvasHeight);
        const fitted = cropOutside(image.outputRect, blocked);
        if (JSON.stringify(fitted) !== JSON.stringify(image.outputRect)) {
          setOutputRect(fitted);
          dirty.current = true;
        }
      } catch (error) {
        toast(`인페인트를 불러올 수 없습니다: ${errorMessage(error)}`, 'error');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // 레퍼런스가 바뀌면 컴포넌트가 새로 마운트된다(key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rebuild = useCallback(async (nextSource: Source, nextLayout: CanvasLayout, nextThreshold: number) => {
    const sequence = (rebuildSeq.current += 1);
    setRebuilding(true);
    try {
      if (nextLayout.mode === 'auto') {
        const composed = await composeCanvas(nextSource.dataUrl, nextLayout);
        if (sequence !== rebuildSeq.current) return;
        setWorking({
          canvasDataUrl: composed.canvasDataUrl,
          width: composed.width,
          height: composed.height,
          backgroundMask: composed.backgroundMask,
          detectionLabel: '자동 구성',
        });
        setReferenceRect(composed.referenceRect);
        // 보호 영역(레퍼런스 + 확장)을 먼저 정하고, 결과 크롭은 그 바깥만 쓴다.
        const blocked = expandRect(composed.referenceRect, expansionRef.current, composed.width, composed.height);
        setOutputRect(cropOutside(composed.outputRect, blocked));
      } else {
        const prepared = await prepareImage(nextSource.dataUrl, nextThreshold);
        if (sequence !== rebuildSeq.current) return;
        const rect = prepared.detection.referenceRect;
        setWorking({
          canvasDataUrl: prepared.canvasDataUrl,
          width: prepared.width,
          height: prepared.height,
          backgroundMask: prepared.backgroundMask,
          detectionLabel: detectionText(prepared.detection.mode, prepared.detection.confidence),
        });
        setReferenceRect(rect);
        const blocked = expandRect(rect, expansionRef.current, prepared.width, prepared.height);
        setOutputRect(suggestOutputRect(blocked, prepared.width, prepared.height, 1));
      }
      setInitialMask(undefined);
      dirty.current = true;
    } catch (error) {
      toast(`캔버스를 만들 수 없습니다: ${errorMessage(error)}`, 'error');
    } finally {
      if (sequence === rebuildSeq.current) setRebuilding(false);
    }
  }, []);

  const scheduleRebuild = useCallback(
    (nextSource: Source | null, nextLayout: CanvasLayout, nextThreshold: number) => {
      clearTimeout(rebuildTimer.current);
      if (!nextSource) return;
      rebuildTimer.current = setTimeout(() => void rebuild(nextSource, nextLayout, nextThreshold), REBUILD_DELAY_MS);
    },
    [rebuild],
  );
  useEffect(() => () => clearTimeout(rebuildTimer.current), []);

  const applySource = useCallback(
    (dataUrl: string, name: string) => {
      const next = { dataUrl, name, changed: true };
      setSource(next);
      void rebuild(next, layout, threshold);
    },
    [layout, threshold, rebuild],
  );

  // 드래그앤드롭으로 들어온 이미지
  useEffect(() => {
    if (!pendingReference || pendingReference.referenceId !== reference.id || loading) return;
    setPendingReference(undefined);
    applySource(pendingReference.dataUrl, pendingReference.name);
  }, [pendingReference, reference.id, loading, applySource]);

  const changeLayout = (patch: Partial<CanvasLayout>) => {
    const next = { ...layout, ...patch };
    setLayout(next);
    dirty.current = true;
    scheduleRebuild(source, next, threshold);
  };

  const handleMaskChange = useCallback((data: Uint8Array, url: string) => {
    setMask({ data, url });
    if (!masksEqual(data, savedMask.current)) dirty.current = true;
  }, []);

  // 자동 저장
  const latest = useRef({ source, layout, working, referenceRect, outputRect, expansionPx, threshold, mask });
  latest.current = { source, layout, working, referenceRect, outputRect, expansionPx, threshold, mask };

  useEffect(() => {
    if (!dirty.current || rebuilding) return;
    scheduleSave(
      `reference:${reference.id}`,
      async () => {
        const value = latest.current;
        if (value.working && value.mask && value.source && value.mask.data.length === value.working.width * value.working.height) {
          const result = await libraryApi().saveReferenceImages({
            referenceId: reference.id,
            originalDataUrl: value.source.changed ? value.source.dataUrl : undefined,
            canvasDataUrl: value.working.canvasDataUrl,
            maskDataUrl: value.mask.url,
          });
          if (value.source.changed) setSource({ ...value.source, changed: false });
          savedMask.current = value.mask.data;
          updateLibrary((library) =>
            patchItem(library, 'references', reference.id, (item) => ({
              ...item,
              image: {
                originalFile: result.originalFile ?? item.image?.originalFile ?? 'original.png',
                canvasFile: 'canvas.png',
                maskFile: 'mask.png',
                originalName: value.source!.name,
                canvasWidth: value.working!.width,
                canvasHeight: value.working!.height,
                referenceRect: value.referenceRect,
                outputRect: value.outputRect,
              },
              layout: value.layout,
              maskExpansionPx: value.expansionPx,
              backgroundThreshold: value.threshold,
              updatedAt: new Date().toISOString(),
            })),
          );
        } else {
          updateLibrary((library) =>
            patchItem(library, 'references', reference.id, (item) => ({ ...item, layout: value.layout })),
          );
        }
        dirty.current = false;
      },
      800,
    );
  }, [reference.id, rebuilding, source, layout, working, referenceRect, outputRect, expansionPx, threshold, mask]);

  const pickImage = () =>
    void run('이미지를 여는 중', async () => {
      const file = await fileApi().openImageFile();
      if (file) applySource(file.dataUrl, file.name);
    });

  if (loading) return <p className="hint pad">인페인트를 불러오는 중…</p>;

  const free = working
    ? checkFreeGeneration({ steps: Math.min(...presets.map((preset) => preset.generation.steps), 28) }, working.width, working.height)
    : undefined;
  const maskOk = mask ? maskHasGeneratePixels(mask.data) : false;
  const auto = layout.mode === 'auto';

  return (
    <div className="canvas-view">
      <aside className="canvas-settings">
        <PanelHeading title="참고 이미지" subtitle="" />
        <button className="import-card" onClick={pickImage}>
          <span className="file-icon image">IMG</span>
          <span>
            <b>{source ? source.name : '이미지 선택'}</b>
            <small>{source ? '클릭해서 교체 · 창에 드롭해도 됩니다' : 'PNG, JPG, WebP · 창에 드롭해도 됩니다'}</small>
          </span>
        </button>

        <PanelHeading title="캔버스 구성" />
        <div className="segmented full">
          <button className={auto ? 'active' : ''} onClick={() => changeLayout({ mode: 'auto' })}>
            자동 구성
          </button>
          <button className={!auto ? 'active' : ''} onClick={() => changeLayout({ mode: 'prepared' })}>
            직접 준비한 캔버스
          </button>
        </div>
        {auto ? (
          <>
            <SelectField
              label="해상도 (NovelAI에 보내는 전체 캔버스)"
              value={layout.resolution}
              options={[
                ...RESOLUTION_PRESETS.map((item) => ({ value: item.id, label: `${item.label} (무료)` })),
                { value: 'custom' as const, label: '커스텀' },
              ]}
              onChange={(resolution) => {
                const preset = RESOLUTION_PRESETS.find((item) => item.id === resolution);
                changeLayout(preset ? { resolution, width: preset.width, height: preset.height } : { resolution });
              }}
            />
            {layout.resolution === 'custom' && (
              <div className="two-column-fields">
                <NumberField
                  label="가로"
                  value={layout.width}
                  min={CUSTOM_MIN}
                  max={CUSTOM_MAX}
                  step={64}
                  integer
                  suffix="px"
                  onChange={(width) => changeLayout({ width: snapDimension(width) })}
                />
                <NumberField
                  label="세로"
                  value={layout.height}
                  min={CUSTOM_MIN}
                  max={CUSTOM_MAX}
                  step={64}
                  integer
                  suffix="px"
                  onChange={(height) => changeLayout({ height: snapDimension(height) })}
                />
              </div>
            )}
            <SelectField
              label="참고 이미지 위치"
              value={layout.referenceSide}
              options={SIDES}
              onChange={(referenceSide) => changeLayout({ referenceSide })}
            />
            <label className="stack-field">
              참고 영역 비율 · {Math.round(layout.referenceRatio * 100)}% (나머지가 결과 크기)
              <input
                type="range"
                min={20}
                max={80}
                step={5}
                value={Math.round(layout.referenceRatio * 100)}
                onChange={(event) => changeLayout({ referenceRatio: Number(event.target.value) / 100 })}
              />
            </label>
            <div className="two-column-fields">
              <SelectField
                label="이미지 맞춤"
                value={layout.fit}
                options={[
                  { value: 'contain', label: '전체 보이기' },
                  { value: 'cover', label: '꽉 채우기' },
                ]}
                onChange={(fit) => changeLayout({ fit })}
              />
              <SelectField
                label="세로 맞춤"
                value={layout.anchor}
                options={[
                  { value: 'top', label: '상단' },
                  { value: 'center', label: '중앙' },
                  { value: 'bottom', label: '하단' },
                ]}
                onChange={(anchor) => changeLayout({ anchor })}
              />
              <label className="stack-field">
                배경색
                <input type="color" value={layout.background} onChange={(event) => changeLayout({ background: event.target.value })} />
              </label>
            </div>
          </>
        ) : (
          <>
            <p className="hint">참고 그림과 빈 칸이 이미 배치된 이미지를 씁니다. 배경을 감지해 보호할 영역을 찾습니다.</p>
            <NumberField
              label="배경 임계값"
              value={threshold}
              min={4}
              max={64}
              integer
              onChange={(value) => {
                setThreshold(value);
                scheduleRebuild(source, layout, value);
              }}
            />
          </>
        )}

        <PanelHeading title="마스크·결과" />
        <NumberField
          label="보호 영역 확장"
          value={expansionPx}
          min={0}
          max={64}
          integer
          suffix="px"
          onChange={(value) => {
            setExpansionPx(value);
            if (working) {
              // 자동 구성은 생성 영역 전체에서 다시 자르고, 직접 준비한 캔버스는 지금 크롭에서 겹치는 부분만 뺀다.
              const base = layout.mode === 'auto' ? computeLayout(layout, 1, 1).generationArea : outputRect;
              setOutputRect(cropOutside(base, expandRect(referenceRect, value, working.width, working.height)));
            }
            dirty.current = true;
          }}
        />
        <p className="hint">참고 그림 둘레를 이만큼 더 보호합니다. 결과(파란 영역)는 그 바깥에서 자릅니다.</p>
        {working && (
          <div className="crop-grid">
            <span>결과 크롭 (파란 영역)</span>
            {(['x', 'y', 'width', 'height'] as const).map((key) => (
              <NumberField
                key={key}
                label={key.toUpperCase()}
                value={Math.round(outputRect[key])}
                min={key === 'width' || key === 'height' ? 16 : 0}
                max={key === 'x' || key === 'width' ? working.width : working.height}
                integer
                onChange={(value) => {
                  setOutputRect(clampRect({ ...outputRect, [key]: value }, working.width, working.height, 16));
                  dirty.current = true;
                }}
              />
            ))}
          </div>
        )}

        {working && (
          <div className={`info-box ${free?.free ? 'ok' : 'warn'}`}>
            <b>
              전송 캔버스 {working.width}×{working.height} → 저장되는 결과 {Math.round(outputRect.width)}×{Math.round(outputRect.height)}
            </b>
            <p>NovelAI에는 전체 캔버스를 보내고, 결과는 파란 영역만 잘라 저장합니다.</p>
            {free?.free ? <p>Opus 무료 크기 기준(1024×1024 이하 면적)을 충족합니다.</p> : free?.reasons.map((reason) => <p key={reason}>⚠ {reason}</p>)}
            {!maskOk && <p>⚠ 생성 영역(청록색)이 비어 있습니다.</p>}
          </div>
        )}
      </aside>

      <section className="canvas-panel">
        {working ? (
          <ReferenceCanvas
            key={`${working.width}x${working.height}`}
            imageDataUrl={working.canvasDataUrl}
            width={working.width}
            height={working.height}
            backgroundMask={working.backgroundMask}
            referenceRect={referenceRect}
            outputRect={outputRect}
            expansionPx={expansionPx}
            initialMask={initialMask}
            detectionLabel={rebuilding ? '다시 구성하는 중…' : working.detectionLabel}
            onReferenceRectChange={(rect) => {
              setReferenceRect(rect);
              setOutputRect((current) =>
                cropOutside(current, expandRect(rect, expansionPx, working.width, working.height)),
              );
              setInitialMask(undefined);
              dirty.current = true;
            }}
            onOutputRectChange={(rect) => {
              setOutputRect(rect);
              dirty.current = true;
            }}
            onMaskChange={handleMaskChange}
            onRedetect={() => source && void rebuild(source, layout, threshold)}
          />
        ) : (
          <EmptyState title="참고 이미지가 필요합니다">
            <p>캐릭터 이미지 한 장을 선택하면 NovelAI 무료 해상도에 맞춰 참고 이미지와 생성 영역을 자동으로 배치합니다.</p>
            <button className="accent" onClick={pickImage}>
              이미지 선택
            </button>
          </EmptyState>
        )}
      </section>
    </div>
  );
}
