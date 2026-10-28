import type { Dialog, Shell } from 'electron';
import type {
  AppSettings,
  GenerationKind,
  GenerationRecord,
  Reference,
} from '../../src/core/domain/types';
import type {
  NovelAIImageRequest,
  NovelAIUserStatus,
  NovelAIVibeRequest,
} from '../../src/core/providers/NovelAIProvider';
import type { ImageDataSource, ProjectInspection, ReferenceImages } from '../../src/shared/ipc';
import type { StoredAccounts, TokenVaultStatus } from './TokenVault';

/** 서비스는 구체 클래스 대신 이 인터페이스에 의존한다. main.ts가 잇고, 테스트는 가짜 객체를 넘긴다. */

export interface ImageGenerator {
  /** 보통 한 장, 배경 제거는 세 장. */
  generate(request: NovelAIImageRequest): Promise<Buffer[]>;
  encodeVibe?(request: NovelAIVibeRequest): Promise<Buffer>;
}

export interface AccountChecker {
  validateToken(token: string): Promise<NovelAIUserStatus>;
}

export interface TokenStore {
  getStatus(): Promise<TokenVaultStatus>;
  accounts(): Promise<StoredAccounts>;
  /** `id`가 없으면 사용 중인 계정 */
  read(id?: string): Promise<string>;
  add(name: string, token: string): Promise<string>;
  rename(id: string, name: string): Promise<void>;
  setActive(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface GenerationStore {
  /** 라이브러리를 읽기 전이면 없고, 그때는 PNG. */
  readonly settings?: Pick<AppSettings, 'storageFormat'>;
  resolveProjectReal(projectId: string, relative: string): Promise<string>;
  projectDir(projectId: string): string;
  emotionOutputDir(projectId: string, kind: GenerationKind, folder: string): string;
  toProjectRelative(projectId: string, absolute: string): string;
  addGeneration(record: GenerationRecord): Promise<void>;
  readVibe(key: string): Promise<Buffer | undefined>;
  writeVibe(key: string, data: Buffer): Promise<void>;
}

export interface ExportSource {
  readonly root: string;
  findGeneration(projectId: string, generationId: string): Promise<GenerationRecord>;
  listGenerations(projectId: string): Promise<GenerationRecord[]>;
  resolveProjectReal(projectId: string, relative: string): Promise<string>;
  readReferenceImages(reference: Reference): Promise<ReferenceImages | null>;
  readImageDataUrl(source: ImageDataSource): Promise<string>;
}

export interface WorkspaceFolders {
  readonly root: string;
  projectDir(projectId: string): string;
  referenceDir(referenceId: string): string;
  emotionOutputDir(projectId: string, kind: GenerationKind, folder: string): string;
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

export type FileDialogs = Pick<Dialog, 'showSaveDialog' | 'showOpenDialog'>;

export type DesktopShell = Pick<Shell, 'openPath' | 'trashItem' | 'showItemInFolder'>;
