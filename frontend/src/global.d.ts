import type { Api } from './preload';

declare global {
  interface Window {
    /** Secure bridge exposed by preload.ts. */
    api: Api;
  }
}

export {};
