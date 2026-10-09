import { AccountMeter } from '../components/AccountMeter';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/ui';
import {
  addSourceFromFile,
  deleteSource,
  makeReferenceFromSource,
  renameSource,
  sourceMedia,
  sourceUsers,
} from '../sourceOps';
import { openFree, updateFreeGeneration, useLibrary } from '../store';

/**
 * i2i 원본 라이브러리. 파일에서 올린 이미지와 결과에서 넣은 이미지가 모인다. 작업의 i2i 방식과 자유
 * 생성 i2i가 여기서 고르고, 인페인트 라이브러리와는 따로 둔다.
 */
export function SourcesView() {
  const library = useLibrary();
  const sources = [...library.img2imgSources].reverse();
  return (
    <section className="project-view">
      <header className="project-header">
        <h1 className="free-title">i2i 원본</h1>
        <span className="hint">i2i로 다시 그릴 이미지 {sources.length}장</span>
        <div className="header-spacer" />
        <AccountMeter />
        <button className="accent with-icon" onClick={() => void addSourceFromFile()}>
          <Icon name="plus" size={14} /> 파일에서 추가
        </button>
      </header>
      <div className="project-body sources-body animate-in">
        {sources.length === 0 ? (
          <EmptyState title="아직 i2i 원본이 없습니다">
            <p>
              「파일에서 추가」로 이미지를 넣거나, 생성 결과의 「i2i 원본에 추가」를 누르십시오.
              작업의 i2i 방식과 자유 생성 i2i에서 여기 있는 이미지를 고릅니다.
            </p>
          </EmptyState>
        ) : (
          <div className="sources-grid">
            {sources.map((source) => {
              const users = sourceUsers(library, source.id);
              return (
                <article key={source.id} className="source-card">
                  <img src={sourceMedia(source)} alt="" loading="lazy" />
                  <div className="source-card-body">
                    <b title={source.name}>{source.name}</b>
                    <small>
                      {source.width}×{source.height}
                      {source.fromRecord ? ' · 생성 결과에서' : ''}
                    </small>
                    <small className="source-users" title={users.join(', ')}>
                      {users.length ? `쓰는 곳: ${users.join(', ')}` : '아직 쓰는 곳 없음'}
                    </small>
                    <div className="source-actions">
                      <button
                        title="자유 생성을 i2i로 바꾸고 이 이미지를 원본으로 고릅니다"
                        onClick={() => {
                          updateFreeGeneration({ mode: 'img2img', sourceId: source.id });
                          openFree();
                        }}
                      >
                        자유 생성 i2i
                      </button>
                      <button
                        title="이 이미지를 참고 이미지로 쓰는 새 인페인트를 만듭니다"
                        onClick={() => void makeReferenceFromSource(source)}
                      >
                        인페인트로 만들기
                      </button>
                      <button onClick={() => void renameSource(source)}>이름 변경</button>
                      <button className="danger-quiet" onClick={() => void deleteSource(source)}>
                        삭제
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
