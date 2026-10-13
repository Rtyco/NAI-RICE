import type {
  AccountApi,
  AppApi,
  DesktopApi,
  FileApi,
  LibraryApi,
  QueueApi,
  StorageApi,
} from '../shared/ipc';

/** 화면 코드가 어떤 기능에 기대는지 드러나도록 API를 기능별로 좁혀 준다. */
const desktop = (): DesktopApi => window.referenceDesk;

export const libraryApi = (): LibraryApi => desktop();
export const fileApi = (): FileApi => desktop();
export const accountApi = (): AccountApi => desktop();
export const queueApi = (): QueueApi => desktop();
export const storageApi = (): StorageApi => desktop();
export const appApi = (): AppApi => desktop();
