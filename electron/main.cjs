const { app, BrowserWindow, ipcMain, desktopCapturer, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Robust dev detection: only dev when explicitly set AND not packaged
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

function createWindow() {
  // Resolve icon path - works both in dev and packaged
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'public', 'logo.png')
    : path.join(__dirname, '..', 'public', 'logo.png');

  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'LPP2 Studio - Organizer Software',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    },
    autoHideMenuBar: true
  });

  // Enable getDisplayMedia in Electron 17+
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      if (sources && sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        callback({});
      }
    } catch (e) {
      console.error('DisplayMedia handler error:', e);
      callback({});
    }
  });

  if (isDev) {
    // Dev mode: load from Vite dev server
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    console.log('[LPP2] Loading dev server:', devServerUrl);
    mainWindow.loadURL(devServerUrl);
    // mainWindow.webContents.openDevTools(); // uncomment for debugging
  } else {
    // Production mode: load built files from dist/
    // Try multiple paths to be safe across different packaging methods
    const possiblePaths = [
      path.join(app.getAppPath(), 'dist', 'index.html'),
      path.join(__dirname, '..', 'dist', 'index.html'),
      path.join(process.resourcesPath, 'app', 'dist', 'index.html'),
    ];

    let loadPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        loadPath = p;
        break;
      }
    }

    if (loadPath) {
      console.log('[LPP2] Loading production file:', loadPath);
      mainWindow.loadFile(loadPath);
    } else {
      console.error('[LPP2] ERROR: dist/index.html not found! Tried:', possiblePaths);
      // Show error page inline instead of crashing
      mainWindow.loadURL(`data:text/html;charset=utf-8,
        <html>
        <body style="background:#0f1117;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column">
          <h1 style="color:#f87171">❌ Erro ao iniciar LPP2 Studio</h1>
          <p>Arquivo dist/index.html não encontrado.</p>
          <p style="color:#9ca3af;font-size:14px">Execute <code>npm run build:exe</code> para gerar o executável corretamente.</p>
          <p style="color:#6b7280;font-size:12px;margin-top:20px">
            isPackaged: ${app.isPackaged}<br>
            appPath: ${app.getAppPath()}<br>
            __dirname: ${__dirname}<br>
            resourcesPath: ${process.resourcesPath}
          </p>
        </body>
        </html>
      `);
    }
  }
}

// IPC: get screen sources for screen sharing with thumbnail and title
ipcMain.handle('get-screen-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 }
    });
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
  } catch (err) {
    console.error('Error fetching screen sources:', err);
    return [];
  }
});

// IPC: open file dialog
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Game Builds & Archives', extensions: ['zip', 'rar', '7z', 'exe', 'apk', 'unitypackage'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
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
