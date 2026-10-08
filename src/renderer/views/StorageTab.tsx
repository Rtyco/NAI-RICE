import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GenerationSummary, Project } from '../../core/domain/types';
import type { ProjectInspection, ProjectUsage, StorageUsage } from '../../shared/ipc';
import { Modal, confirmDialog, openDialog } from '../components/Dialogs';
import { Card } from '../components/ui';
import { fileApi, libraryApi, queueApi, storageApi } from '../desktop';
import { importJsonFromPicker } from '../importers';
import { deleteProject } from '../projectOps';
import { deleteGenerations, loadGenerations, run, toast, useLibrary, useStore } from '../store';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** 대표(★) 이미지를 뺀 결과. before가 있으면 그 날(포함) 이전에 만든 것만. */
function cleanupTargets(
  records: GenerationSummary[],
  project: Pick<Project, 'favorites'> | undefined,
  before?: string,
): GenerationSummary[] {
  const favorites = new Set(Object.values(project?.favorites ?? {}));
  const until = before ? new Date(`${before}T23:59:59.999`).toISOString() : undefined;
  return records.filter(
    (record) => !favorites.has(record.id) && (!until || record.createdAt <= until),
  );
}

/**
 * 「결과 정리」: 대표 이미지를 빼고 결과를 한꺼번에 지운다. 기본은 휴지통이고, 여기서만 영구 삭제를 고를 수
 * 있다. 지우기 전에 장수와 용량을 미리 보여 준다.
 */
function CleanupDialog({
  projectIds,
  close,
  onDone,
}: {
  projectIds: string[];
  close: () => void;
  onDone: () => void;
}) {
  const projects = useLibrary().projects;
  const [records, setRecords] = useState<Record<string, GenerationSummary[]>>();
  const [useDate, setUseDate] = useState(false);
  const [before, setBefore] = useState(() => new Date().toISOString().slice(0, 10));
  const [permanent, setPermanent] = useState(false);
  const [measure, setMeasure] = useState<{ count: number; bytes: number }>();

  useEffect(() => {
    let alive = true;
    void Promise.all(
      projectIds.map(async (id) => [id, await libraryApi().listGenerations(id)] as const),
    ).then((entries) => alive && setRecords(Object.fromEntries(entries)));
    return () => {
      alive = false;
    };
  }, [projectIds]);

  const targets = useMemo(() => {
    if (!records) return undefined;
    return Object.fromEntries(
      projectIds.map((id) => [
        id,
        cleanupTargets(
          records[id] ?? [],
          projects.find((project) => project.id === id),
          useDate ? before : undefined,
        ),
      ]),
    );
  }, [records, projectIds, projects, useDate, before]);

  useEffect(() => {
    if (!targets) return;
    let alive = true;
    setMeasure(undefined);
    const timer = setTimeout(() => {
      void Promise.all(
        Object.entries(targets).map(([id, list]) =>
          list.length
            ? storageApi().measureGenerations(
                id,
                list.map((record) => record.id),
              )
            : { count: 0, bytes: 0 },
        ),
      ).then((parts) => {
        if (!alive) return;
        setMeasure({
          count: parts.reduce((sum, part) => sum + part.count, 0),
          bytes: parts.reduce((sum, part) => sum + part.bytes, 0),
        });
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [targets]);

  const total = records ? Object.values(records).reduce((sum, list) => sum + list.length, 0) : 0;
  const kept = measure ? total - measure.count : 0;
  const name =
    projectIds.length === 1
      ? (projects.find((project) => project.id === projectIds[0])?.name ?? projectIds[0])
      : `작업 ${projectIds.length}개`;

  const apply = async () => {
    if (!targets || !measure?.count) return;
    if (permanent) {
      const ok = await confirmDialog({
        title: '영구 삭제',
        message: (
          <p>
            결과 {measure.count}장({formatBytes(measure.bytes)})을 휴지통을 거치지 않고 바로
            지웁니다. 되돌릴 수 없습니다.
          </p>
        ),
        confirmLabel: '영구 삭제',
        danger: true,
      });
      if (!ok) return;
    }
    close();
    await run('결과를 정리하는 중', async () => {
      for (const [id, list] of Object.entries(targets)) {
        if (list.length)
          await deleteGenerations(
            id,
            list.map((record) => record.id),
            { permanent },
          );
      }
      toast(
        `결과 ${measure.count}장(${formatBytes(measure.bytes)})을 ${permanent ? '영구 삭제' : '휴지통으로 이동'}했습니다.`,
      );
    });
    onDone();
  };

  return (
    <Modal
      title={`결과 정리 · ${name}`}
      onClose={close}
      footer={
        <>
          <button onClick={close}>취소</button>
          <button className="danger-solid" disabled={!measure?.count} onClick={() => void apply()}>
            {measure ? `${measure.count}장 ${permanent ? '영구 삭제' : '삭제'}` : '계산 중…'}
          </button>
        </>
      }
    >
      <p>
        대표(★) 이미지를 뺀 생성 결과를 지웁니다. 결과 이미지와 썸네일, 같은 결과의 전체 캔버스가
        함께 지워집니다.
      </p>
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={useDate}
          onChange={(event) => setUseDate(event.target.checked)}
        />
        <span>이 날짜까지 만든 결과만</span>
        <input
          type="date"
          value={before}
          disabled={!useDate}
          onChange={(event) => setBefore(event.target.value)}
        />
      </label>
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={permanent}
          onChange={(event) => setPermanent(event.target.checked)}
        />
        <span>휴지통을 거치지 않고 바로 지우기 (되돌릴 수 없음)</span>
      </label>
      <p className="cleanup-preview">
        {!records || !measure
          ? '계산하는 중…'
          : measure.count
            ? `결과 ${total}장 중 ${measure.count}장 · ${formatBytes(measure.bytes)}를 지웁니다. ${kept}장은 남습니다.`
            : '지울 결과가 없습니다.'}
      </p>
    </Modal>
  );
}

function ProjectRow({
  usage,
  project,
  onChanged,
}: {
  usage: ProjectUsage;
  project?: Project;
  onChanged: () => void;
}) {
  const [inspection, setInspection] = useState<ProjectInspection>();
  const { bytes } = usage;
  const inspect = () =>
    void run('기록과 파일을 점검하는 중', async () =>
      setInspection(await storageApi().inspectProject(usage.projectId)),
    );
  const repair = () =>
    void run('점검 결과를 정리하는 중', async () => {
      const fixed = await storageApi().repairProject(usage.projectId);
      toast(
        `기록 없는 파일 ${fixed.orphanFiles}개를 휴지통으로 보내고, 이미지가 없는 기록 ${fixed.missingRecords}개를 뺐습니다.`,
      );
      setInspection(undefined);
      if (useStore.getState().generations[usage.projectId]) await loadGenerations(usage.projectId);
      onChanged();
    });
  const problems = inspection ? inspection.orphanFiles + inspection.missingRecords : 0;

  return (
    <>
      <tr>
        <td>
          {project ? (
            <b>{project.name}</b>
          ) : (
            <span className="hint" title={usage.projectId}>
              라이브러리에 없는 폴더
            </span>
          )}
        </td>
        <td className="num">{usage.records.toLocaleString()}장</td>
        <td className="num">{formatBytes(bytes.outputs)}</td>
        <td className="num">{formatBytes(bytes.diagnostic)}</td>
        <td
          className="num"
          title={`썸네일 ${formatBytes(bytes.thumbs)} · 입력 ${formatBytes(bytes.inputs)}`}
        >
          {formatBytes(bytes.thumbs + bytes.inputs + bytes.other + bytes.trash)}
        </td>
        <td className="num">
          <b>{formatBytes(usage.total)}</b>
        </td>
        <td className="actions">
          {project ? (
            <>
              <button
                disabled={!usage.records}
                onClick={() =>
                  void openDialog((close) => (
                    <CleanupDialog
                      projectIds={[usage.projectId]}
                      close={close}
                      onDone={onChanged}
                    />
                  ))
                }
              >
                결과 정리…
              </button>
              <button onClick={inspect}>점검</button>
            </>
          ) : (
            <button
              className="danger-quiet"
              onClick={() =>
                void deleteProject({ id: usage.projectId, name: usage.projectId }).then(onChanged)
              }
            >
              휴지통으로
            </button>
          )}
        </td>
      </tr>
      {inspection && (
        <tr className="inspection-row">
          <td colSpan={7}>
            {problems ? (
              <>
                기록 없는 파일 {inspection.orphanFiles}개({formatBytes(inspection.orphanBytes)}) ·
                이미지가 없는 기록 {inspection.missingRecords}개{' '}
                <button onClick={repair}>정리</button>
              </>
            ) : (
              '기록과 파일이 모두 맞습니다.'
            )}
            <button className="link-button" onClick={() => setInspection(undefined)}>
              닫기
            </button>
          </td>
        </tr>
      )}
      {bytes.trash > 0 && (
        <tr className="inspection-row">
          <td colSpan={7}>
            휴지통으로 보내지 못한 결과 {formatBytes(bytes.trash)}가 남아 있습니다. 다음에
            프로그램을 열 때 다시 보냅니다.
          </td>
        </tr>
      )}
    </>
  );
}

export function StorageTab() {
  const root = useStore((state) => state.root);
  const library = useLibrary();
  const [usage, setUsage] = useState<StorageUsage>();
  const refresh = useCallback(() => {
    setUsage(undefined);
    storageApi()
      .storageUsage()
      .then(setUsage)
      .catch((error: unknown) => toast(`사용량을 계산하지 못했습니다: ${String(error)}`, 'error'));
  }, []);
  useEffect(refresh, [refresh]);

  const projectTotal = usage?.projects.reduce((sum, item) => sum + item.total, 0) ?? 0;
  const known = usage?.projects.filter((item) =>
    library.projects.some((project) => project.id === item.projectId),
  );

  return (
    <>
      <Card
        title="작업 폴더"
        subtitle="자동 저장 · 실행할 때마다 library.json을 backups 폴더에 백업합니다."
      >
        <div className="path-row">
          <code>{root}</code>
          <button
            onClick={() =>
              void run('폴더를 여는 중', () => libraryApi().openInExplorer({ kind: 'root' }))
            }
          >
            폴더 열기
          </button>
        </div>
      </Card>
      <Card title="사용량" subtitle="이 화면을 열 때 계산합니다.">
        {!usage ? (
          <p className="hint">계산하는 중…</p>
        ) : (
          <>
            <p className="storage-summary">
              생성 결과 <b>{formatBytes(projectTotal)}</b> · 인페인트{' '}
              {formatBytes(usage.references)} · 백업 {formatBytes(usage.backups)} · 내보내기{' '}
              {formatBytes(usage.exports)}
            </p>
            {usage.projects.length ? (
              <div className="storage-table-wrap">
                <table className="storage-table">
                  <thead>
                    <tr>
                      <th>작업</th>
                      <th className="num">결과</th>
                      <th className="num">이미지</th>
                      <th className="num">전체 캔버스</th>
                      <th className="num">기타</th>
                      <th className="num">합계</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {[...usage.projects]
                      .sort((a, b) => b.total - a.total)
                      .map((item) => (
                        <ProjectRow
                          key={item.projectId}
                          usage={item}
                          project={library.projects.find(
                            (project) => project.id === item.projectId,
                          )}
                          onChanged={refresh}
                        />
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="hint">아직 생성 결과가 없습니다.</p>
            )}
            <div className="button-row">
              <button
                disabled={!known?.some((item) => item.records)}
                onClick={() =>
                  void openDialog((close) => (
                    <CleanupDialog
                      projectIds={known!
                        .filter((item) => item.records)
                        .map((item) => item.projectId)}
                      close={close}
                      onDone={refresh}
                    />
                  ))
                }
              >
                모든 작업 결과 정리…
              </button>
              <button className="link-button" onClick={refresh}>
                다시 계산
              </button>
            </div>
          </>
        )}
      </Card>
      <Card title="앱 캐시 · 생성 큐" subtitle="">
        <div className="storage-line">
          <span>
            화면 캐시 <b>{usage ? formatBytes(usage.app.cache) : '…'}</b>
            <small className="hint"> 지워도 필요하면 다시 만들어집니다.</small>
          </span>
          <button
            onClick={() =>
              void run('캐시를 비우는 중', async () => {
                const freed = await storageApi().clearAppCache();
                toast(`캐시 ${formatBytes(freed)}를 비웠습니다.`);
                refresh();
              })
            }
          >
            캐시 비우기
          </button>
        </div>
        <div className="storage-line">
          <span>
            생성 큐 기록 <b>{usage ? formatBytes(usage.app.queue) : '…'}</b>
            <small className="hint"> 완료·취소 기록은 최근 300개만 남습니다.</small>
          </span>
          <button
            onClick={() =>
              void run('큐 기록을 비우는 중', async () => {
                await queueApi().clearFinished();
                toast('완료·취소·실패한 큐 기록을 비웠습니다.');
                refresh();
              })
            }
          >
            끝난 기록 비우기
          </button>
        </div>
      </Card>
      <Card title="백업 · 공유" subtitle="">
        <div className="button-row">
          <button
            className="accent"
            onClick={() =>
              void run('전체 백업을 만드는 중', async () => {
                const saved = await fileApi().exportLibrary(library);
                if (saved) toast(`전체 백업을 저장했습니다: ${saved}`);
              })
            }
          >
            전체 백업 (생성 설정·캐릭터·감정 모음·인페인트·작업)
          </button>
          <button onClick={() => void importJsonFromPicker()}>JSON 가져오기</button>
        </div>
        <p className="hint">생성 이미지는 JSON에 포함되지 않습니다</p>
      </Card>
    </>
  );
}
