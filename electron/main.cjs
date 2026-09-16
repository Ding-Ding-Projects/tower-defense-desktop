/**
 * The desktop main process.
 *
 * It owns the window, the update feed and nothing else. No gameplay logic lives here,
 * deliberately: the moment any does, the simulation stops being runnable headlessly
 * in a plain Node check, and that property is what every determinism proof rests on.
 *
 * The renderer gets a narrow, explicit surface and no filesystem or Node access at
 * all. Context isolation on, node integration off, sandbox on.
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');

// Squirrel fires this on install, update and uninstall to create and remove shortcuts.
// It has to be handled before anything else, or a fresh install flashes a window on
// screen while the installer is still working.
if (handleSquirrelEvent()) {
  // The process is quitting; do not continue into window creation.
} else {
  startApplication();
}

/**
 * @returns {boolean} true when the process is exiting to service an installer event
 */
function handleSquirrelEvent() {
  if (process.platform !== 'win32' || process.argv.length === 1) return false;
  const command = process.argv[1];
  if (!command.startsWith('--squirrel')) return false;

  const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  const target = path.basename(process.execPath);
  const { spawn } = require('node:child_process');

  const run = (args) => {
    try {
      spawn(updateExe, args, { detached: true }).unref();
    } catch {
      // A failed shortcut update must never prevent the installer from finishing.
    }
  };

  switch (command) {
    case '--squirrel-install':
    case '--squirrel-updated':
      run(['--createShortcut', target]);
      setTimeout(() => app.quit(), 1000);
      return true;
    case '--squirrel-uninstall':
      run(['--removeShortcut', target]);
      setTimeout(() => app.quit(), 1000);
      return true;
    case '--squirrel-obsolete':
      app.quit();
      return true;
    default:
      return false;
  }
}

function startApplication() {
  /** @type {import('electron').BrowserWindow | null} */
  let window = null;

  const createWindow = () => {
    window = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 960,
      minHeight: 600,
      // Frameless with a custom title bar drawn by the interface, per the product
      // rules. The controls below are the only way it can drive the real window.
      frame: false,
      backgroundColor: '#101418',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    window.loadFile(path.join(__dirname, '..', 'index.html'));
    window.once('ready-to-show', () => window && window.show());

    const pushState = () => {
      if (window && !window.isDestroyed()) {
        window.webContents.send('window:state', { maximized: window.isMaximized() });
      }
    };
    window.on('maximize', pushState);
    window.on('unmaximize', pushState);
    window.on('closed', () => {
      window = null;
    });
  };

  ipcMain.on('window:minimize', () => window && window.minimize());
  ipcMain.on('window:toggle-maximize', () => {
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.on('window:close', () => window && window.close());
  ipcMain.handle('window:is-maximized', () => Boolean(window && window.isMaximized()));
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.on('app:open-release-notes', () => {
    shell.openExternal('https://github.com/Ding-Ding-Projects/tower-defense-desktop/releases/latest');
  });

  ipcMain.on('update:check', () => {
    // Update checking is wired in a later release. Reporting an honest unavailable
    // state is the correct behaviour until it is; a silent no-op would leave the
    // interface showing a spinner that never resolves.
    if (window && !window.isDestroyed()) {
      window.webContents.send('update:state', {
        state: 'unavailable',
        reason: 'automatic updates are not wired up in this build',
      });
    }
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
