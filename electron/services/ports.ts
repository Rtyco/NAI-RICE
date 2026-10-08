import type { Dialog, Shell } from 'electron';
import type { GenerationRecord, Reference } from '../../src/core/domain/types';
import type {
  NovelAIImageRequest,
  NovelAIUserStatus,
} from '../../src/core/providers/NovelAIProvider';
import type { ProjectInspection, ReferenceImages } from '../../src/shared/ipc';
import type { TokenVaultStatus } from './TokenVault';

/**
 * 서비스끼리는 구체 클래스 대신 여기의 작은 인터페이스에 의존한다.
 * 실제 구현은 main.ts가 이어 붙이고, 테스트는 필요한 메서드만 가진 가짜 객체를 넘긴다.
 */

/** 인페인트 이미지를 만드는 쪽. NovelAIProvider가 구현한다. */
export interface ImageGenerator {
  generate(request: NovelAIImageRequest): Promise<Buffer>;
}

/** NovelAI 계정 상태를 조회하는 쪽. NovelAIProvider가 구현한다. */
export interface AccountChecker {
  validateToken(token: string): Promise<NovelAIUserStatus>;
}

/** 토큰을 보관하는 곳. TokenVault가 구현한다. */
export interface TokenStore {
  getStatus(): Promise<TokenVaultStatus>;
  read(): Promise<string>;
  save(token: string): Promise<void>;
  remove(): Promise<void>;
}

/** 생성 큐가 입력을 읽고 결과를 쌓는 작업 폴더. Library가 구현한다. */
export interface GenerationStore {
  resolveProjectReal(projectId: string, relative: string): Promise<string>;
  projectDir(projectId: string): string;
  emotionOutputDir(projectId: string, emotionName: string): string;
  toProjectRelative(projectId: string, absolute: string): string;
  addGeneration(record: GenerationRecord): Promise<void>;
}

/** 내보내기가 읽는 작업 폴더. Library가 구현한다. */
export interface ExportSource {
  readonly root: string;
  findGeneration(projectId: string, generationId: string): Promise<GenerationRecord>;
  listGenerations(projectId: string): Promise<GenerationRecord[]>;
  resolveProjectReal(projectId: string, relative: string): Promise<string>;
  readReferenceImages(reference: Reference): Promise<ReferenceImages | null>;
}

/** 탐색기로 열거나 휴지통으로 보낼 작업 폴더. Library가 구현한다. */
export interface WorkspaceFolders {
  readonly root: string;
  projectDir(projectId: string): string;
  referenceDir(referenceId: string): string;
  emotionOutputDir(projectId: string, emotionName: string): string;
  resolveProject(projectId: string, relative: string): string;
  findGeneration(projectId: string, generationId: string): Promise<GenerationRecord>;
  verifyReal(absolute: string): Promise<string>;
  stageGenerations(projectId: string, generationIds: string[]): Promise<string | null>;
  leftoverStaging(): Promise<string[]>;
  inspectProject(
    projectId: string,
    fix?: boolean,
  ): Promise<ProjectInspection & { staging: string | null }>;
}

/** 저장 위치를 묻는 대화상자. Electron의 dialog가 구현한다. */
export type FileDialogs = Pick<Dialog, 'showSaveDialog' | 'showOpenDialog'>;

/** 탐색기 열기·휴지통. Electron의 shell이 구현한다. */
export type DesktopShell = Pick<Shell, 'openPath' | 'trashItem' | 'showItemInFolder'>;
