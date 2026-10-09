import { useEffect, useState } from 'react';
import type { GenerationKind, GenerationRecord, GenerationSummary } from '../../core/domain/types';
import { modelLabel } from '../../core/providers/NaiModels';
import { libraryApi } from '../desktop';
import { projectMedia } from '../store';

const KIND_LABELS: Record<GenerationKind, string> = {
  inpaint: '인페인트',
  txt2img: '일반 생성',
  img2img: 'i2i',
  augment: '디렉터 툴',
};

/** 선택한 결과의 생성 정보. 목록에는 프롬프트가 없어서, 열 때 기록 하나를 통째로 받아 온다. */
export function RecordInfo({
  projectId,
  record,
}: {
  projectId: string;
  record: GenerationSummary;
}) {
  const [full, setFull] = useState<GenerationRecord | null>();
  useEffect(() => {
    let alive = true;
    setFull(undefined);
    libraryApi()
      .getGeneration(projectId, record.id)
      .then((value) => alive && setFull(value))
      .catch(() => alive && setFull(null));
    return () => {
      alive = false;
    };
  }, [projectId, record.id]);
  const prompt = (pick: (value: GenerationRecord) => string) =>
    full === undefined ? '불러오는 중…' : full === null ? '읽을 수 없습니다' : pick(full);
  return (
    <dl className="record-info">
      <dt>생성 시각</dt>
      <dd>{new Date(record.createdAt).toLocaleString()}</dd>
      <dt>Seed</dt>
      <dd>{record.seed}</dd>
      <dt>방식</dt>
      <dd>{KIND_LABELS[record.kind]}</dd>
      {record.inputFile && (
        <>
          <dt>입력 이미지</dt>
          <dd>
            <img
              className="record-input"
              src={projectMedia(projectId, record.inputFile)}
              alt=""
              title="NovelAI에 실제로 보낸 입력(목표 크기로 맞춘 것)"
            />
          </dd>
        </>
      )}
      <dt>모델</dt>
      <dd>{modelLabel(record.model)}</dd>
      <dt>크기</dt>
      <dd>
        {record.width}×{record.height}
      </dd>
      {record.anlasSpent !== undefined && (
        <>
          <dt>사용 Anlas</dt>
          <dd>{record.anlasSpent}</dd>
        </>
      )}
      <dt>조합</dt>
      <dd>
        {[
          record.presetName,
          `${record.characterName} / ${record.promptSetName}`,
          record.emotionSetName,
          record.referenceName,
        ]
          .filter(Boolean)
          .join(' → ')}
      </dd>
      <dt>씬 프롬프트</dt>
      <dd className="mono">{record.emotionPrompt || '—'}</dd>
      <dt>캐릭터 프롬프트</dt>
      <dd className="mono">{prompt((value) => value.characterPrompt)}</dd>
      <dt>공통 프롬프트</dt>
      <dd className="mono">{prompt((value) => value.prompt)}</dd>
      <dt>공통 네거티브</dt>
      <dd className="mono">{prompt((value) => value.negativePrompt)}</dd>
    </dl>
  );
}
