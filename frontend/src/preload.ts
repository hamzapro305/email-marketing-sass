// Preload runs in an isolated context with access to a limited set of Node
// APIs. It is the only place allowed to bridge the main and renderer
// processes. Everything exposed here becomes `window.api` in the renderer.
// See: https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  /** Ask the main process for the packaged app version. */
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
