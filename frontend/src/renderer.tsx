/**
 * Renderer entry point. Runs in the browser-like "renderer" context.
 * Node integration is disabled; the main process is reached only through
 * the typed, sandboxed API exposed in preload.ts (see `window.api`).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
