/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

interface ImportMetaEnv {
  /** Backend API base URL (e.g. https://mail.example.com/api). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
