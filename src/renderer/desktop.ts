import type {
  AccountApi,
  AppApi,
  DesktopApi,
  FileApi,
  LibraryApi,
  QueueApi,
  StorageApi,
} from '../shared/ipc';

/**
 * preload가 연 API를 기능별로 좁혀 돌려준다. 화면 코드는 window.referenceDesk 전체 대신
 * 필요한 부분만 받아, 어떤 기능에 기대는지가 드러나게 한다.
 */
const desktop = (): DesktopApi => window.referenceDesk;

export const libraryApi = (): LibraryApi => desktop();
export const fileApi = (): FileApi => desktop();
export const accountApi = (): AccountApi => desktop();
export const queueApi = (): QueueApi => desktop();
export const storageApi = (): StorageApi => desktop();
export const appApi = (): AppApi => desktop();
