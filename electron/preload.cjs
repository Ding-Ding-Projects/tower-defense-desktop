/**
 * The whole bridge between the desktop shell and the page.
 *
 * Everything the interface can reach is listed here, and it is short on purpose. No
 * filesystem, no child processes, no Node modules, no generic message channel that
 * would let a later change smuggle any of those through without anybody noticing.
 *
 * The interface guards for this object being absent, so the same page runs unchanged
 * in a plain browser with the window controls visibly disabled.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('towerDefence', {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    /**
     * @param {(state: { maximized: boolean }) => void} listener
     * @returns {() => void} unsubscribe
     */
    onStateChange: (listener) => {
      const handler = (_event, state) => listener(state);
      ipcRenderer.on('window:state', handler);
      return () => ipcRenderer.removeListener('window:state', handler);
    },
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    openReleaseNotes: () => ipcRenderer.send('app:open-release-notes'),
  },
  update: {
    check: () => ipcRenderer.send('update:check'),
    /**
     * @param {(state: { state: string, reason?: string, version?: string }) => void} listener
     * @returns {() => void} unsubscribe
     */
    onStateChange: (listener) => {
      const handler = (_event, state) => listener(state);
      ipcRenderer.on('update:state', handler);
      return () => ipcRenderer.removeListener('update:state', handler);
    },
  },
});
