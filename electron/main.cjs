const { app, BrowserWindow, ipcMain, desktopCapturer, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

let autoUpdater = null;
try {
  const updaterModule = require('electron-updater');
  autoUpdater = updaterModule.autoUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
} catch (e) {
  console.warn('[LPP2] electron-updater could not be loaded:', e.message);
}

// GitHub repo details for direct release checking and updates
const GITHUB_REPO_OWNER = 'RafaelLiborio';
const GITHUB_REPO_NAME = 'LPP2';

let mainWindow = null;
let downloadedUpdatePath = null;
let cachedLatestRelease = null;

// Robust dev detection: only dev when explicitly set AND not packaged
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

function createWindow() {
  // Resolve icon path - works both in dev and packaged
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'public', 'logo.png')
    : path.join(__dirname, '..', 'public', 'logo.png');

  mainWindow = new BrowserWindow({
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
      webSecurity: true
    },
    autoHideMenuBar: true
  });

  // Open devtools in case of error or key press
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    console.error('[LPP2] Failed to load:', code, desc);
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
  } else {
    // Production mode: load built files from dist/
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
      mainWindow.loadURL(`data:text/html;charset=utf-8,
        <html>
        <body style="background:#0f1117;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column">
          <h1 style="color:#f87171">❌ Erro ao iniciar LPP2 Studio</h1>
          <p>Arquivo dist/index.html não encontrado.</p>
          <p style="color:#9ca3af;font-size:14px">Execute <code>npm run build:exe</code> para gerar o executável corretamente.</p>
        </body>
        </html>
      `);
    }
  }

  // Setup auto-updater events
  setupAutoUpdaterEvents();

  // Automatic check for updates 3 seconds after startup
  setTimeout(() => {
    checkForUpdatesInternal().catch(err => {
      console.log('[LPP2 AutoUpdater] Startup check notice:', err.message);
    });
  }, 3500);

  // Periodic check every 30 minutes
  setInterval(() => {
    checkForUpdatesInternal().catch(() => {});
  }, 30 * 60 * 1000);
}

// Semver compare helper
function isNewerVersion(remoteTag, currentVersion) {
  if (!remoteTag) return false;
  const parse = (value) => {
    const match = value.replace(/^v/i, '').trim().match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
    return match ? { core: match.slice(1, 4).map(Number), pre: match[4]?.split('.') || [] } : null;
  };
  const remote = parse(remoteTag);
  const current = parse(currentVersion);
  if (!remote || !current) return false;

  for (let i = 0; i < 3; i++) {
    const r = remote.core[i];
    const c = current.core[i];
    if (r > c) return true;
    if (r < c) return false;
  }
  if (!remote.pre.length) return Boolean(current.pre.length);
  if (!current.pre.length) return false;
  for (let i = 0; i < Math.max(remote.pre.length, current.pre.length); i++) {
    if (remote.pre[i] === undefined) return true;
    if (current.pre[i] === undefined) return false;
    if (remote.pre[i] === current.pre[i]) continue;
    const rNumeric = /^\d+$/.test(remote.pre[i]);
    const cNumeric = /^\d+$/.test(current.pre[i]);
    if (rNumeric && cNumeric) return Number(remote.pre[i]) > Number(current.pre[i]);
    if (rNumeric !== cNumeric) return !rNumeric;
    return remote.pre[i] > current.pre[i];
  }
  return false;
}

const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com'
]);

function assertAllowedDownloadUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !ALLOWED_DOWNLOAD_HOSTS.has(url.hostname)) {
    throw new Error('O servidor de atualização redirecionou para um endereço não confiável.');
  }
  return url;
}

// Fetch GitHub latest release with redirect handling
function fetchJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const safeUrl = assertAllowedDownloadUrl(url);
    const req = https.get(safeUrl, {
      headers: {
        'User-Agent': 'LPP2-Studio-Client'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirects >= 5) return reject(new Error('Muitos redirecionamentos ao consultar a release.'));
        try { return resolve(fetchJson(new URL(res.headers.location, safeUrl).toString(), redirects + 1)); }
        catch (error) { return reject(error); }
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

// Direct GitHub Releases Checker
async function checkGitHubReleases() {
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;
  const release = await fetchJson(apiUrl);
  if (!release || !release.tag_name) {
    throw new Error('Release não encontrada no repositório');
  }

  const currentVer = app.getVersion() || '1.0.0';
  const hasUpdate = isNewerVersion(release.tag_name, currentVer);

  const exeAsset = (release.assets || []).find((asset) =>
    typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.exe') &&
    typeof asset.digest === 'string' && /^sha256:[a-f0-9]{64}$/i.test(asset.digest)
  );

  const updateInfo = {
    version: release.tag_name.replace(/^v/i, ''),
    releaseDate: release.published_at,
    releaseNotes: release.body || 'Correções de bugs e melhorias automáticas de desempenho.',
    downloadUrl: exeAsset?.browser_download_url,
    assetName: exeAsset ? path.basename(exeAsset.name) : undefined,
    sha256: exeAsset?.digest?.slice('sha256:'.length)
  };

  cachedLatestRelease = updateInfo;

  return {
    available: hasUpdate,
    updateInfo,
    currentVersion: currentVer
  };
}

// Download GitHub Release Asset with progress reporting
function downloadFileWithProgress(url, targetPath, onProgress, redirects = 0, transferredTotal = 0) {
  return new Promise((resolve, reject) => {
    let safeUrl;
    try { safeUrl = assertAllowedDownloadUrl(url); }
    catch (error) { return reject(error); }
    const file = fs.createWriteStream(targetPath);

    const request = https.get(safeUrl, {
      headers: { 'User-Agent': 'LPP2-Studio-Client' }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        return file.close(() => {
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
          if (redirects >= 5) return reject(new Error('Muitos redirecionamentos no download da atualização.'));
          try {
            resolve(downloadFileWithProgress(new URL(response.headers.location, safeUrl).toString(), targetPath, onProgress, redirects + 1, transferredTotal));
          } catch (error) { reject(error); }
        });
      }

      if (response.statusCode !== 200) {
        response.resume();
        return file.close(() => {
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
          reject(new Error(`Falha no download: HTTP ${response.statusCode}`));
        });
      }

      const total = parseInt(response.headers['content-length'] || '0', 10);
      if (total && total + transferredTotal > 1024 * 1024 * 1024) {
        response.destroy();
        return file.close(() => {
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
          reject(new Error('O instalador excede o limite de 1 GB.'));
        });
      }
      let transferred = 0;
      let lastTime = Date.now();
      let lastTransferred = 0;

      response.on('data', (chunk) => {
        transferred += chunk.length;
        if (transferred + transferredTotal > 1024 * 1024 * 1024) {
          request.destroy(new Error('O instalador excede o limite de 1 GB.'));
          return;
        }
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;
        let bytesPerSecond = 0;
        if (timeDiff >= 0.5) {
          bytesPerSecond = Math.round((transferred - lastTransferred) / timeDiff);
          lastTime = now;
          lastTransferred = transferred;
        }

        const percent = total > 0 ? Math.round((transferred / total) * 100) : 0;
        if (onProgress) {
          onProgress({ percent, transferred, total, bytesPerSecond });
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close(() => resolve(targetPath));
      });
    });

    request.on('error', (err) => {
      file.close(() => {
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        reject(err);
      });
    });

    file.on('error', (err) => {
      request.destroy();
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      reject(err);
    });
  });
}

function calculateSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function setupAutoUpdaterEvents() {
  if (!autoUpdater) return;

  autoUpdater.on('checking-for-update', () => {
    console.log('[LPP2 AutoUpdater] Verificando atualizações...');
    mainWindow?.webContents?.send('update-status', { type: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[LPP2 AutoUpdater] Nova versão disponível:', info.version);
    mainWindow?.webContents?.send('update-status', {
      type: 'available',
      info: {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : JSON.stringify(info.releaseNotes)
      }
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[LPP2 AutoUpdater] Nenhuma atualização pendente:', info?.version);
    mainWindow?.webContents?.send('update-status', { type: 'not-available', info });
  });

  autoUpdater.on('error', (err) => {
    console.warn('[LPP2 AutoUpdater] Erro no autoUpdater:', err.message);
    mainWindow?.webContents?.send('update-status', { type: 'error', error: err.message });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents?.send('update-status', {
      type: 'downloading',
      progress: {
        percent: Math.round(progressObj.percent),
        transferred: progressObj.transferred,
        total: progressObj.total,
        bytesPerSecond: progressObj.bytesPerSecond
      }
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[LPP2 AutoUpdater] Atualização baixada com sucesso!');
    mainWindow?.webContents?.send('update-status', {
      type: 'downloaded',
      info: {
        version: info.version
      }
    });
  });
}

// Unified check for updates
async function checkForUpdatesInternal() {
  try {
    // 1. Try electron-updater if packaged
    if (app.isPackaged && autoUpdater) {
      try {
        const result = await autoUpdater.checkForUpdates();
        if (result && result.updateInfo) {
          return {
            available: isNewerVersion(result.updateInfo.version, app.getVersion()),
            updateInfo: result.updateInfo,
            currentVersion: app.getVersion()
          };
        }
      } catch (err) {
        console.warn('[LPP2 AutoUpdater] autoUpdater falhou, tentando fallback GitHub:', err.message);
      }
    }

    // 2. Fallback to GitHub Releases API
    const ghResult = await checkGitHubReleases();
    if (ghResult.available) {
      mainWindow?.webContents?.send('update-status', {
        type: 'available',
        info: ghResult.updateInfo
      });
    } else {
      mainWindow?.webContents?.send('update-status', {
        type: 'not-available',
        info: ghResult.updateInfo
      });
    }
    return ghResult;
  } catch (err) {
    console.error('[LPP2 AutoUpdater] Falha ao verificar atualizações:', err.message);
    mainWindow?.webContents?.send('update-status', { type: 'error', error: err.message });
    return { available: false, error: err.message, currentVersion: app.getVersion() };
  }
}

// IPC: App Version
ipcMain.handle('get-app-version', () => {
  return app.getVersion() || '1.0.0';
});

// IPC: Open external link in default browser
ipcMain.handle('open-external-url', async (_e, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
  }
});

// IPC: Check for updates manually
ipcMain.handle('check-for-updates', async () => {
  return await checkForUpdatesInternal();
});

// IPC: Start downloading update
ipcMain.handle('start-update-download', async () => {
  try {
    // If packaged and autoUpdater is ready
    if (app.isPackaged && autoUpdater) {
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (e) {
        console.warn('[LPP2 AutoUpdater] Download via autoUpdater falhou, usando download direto:', e.message);
      }
    }

    // Direct GitHub asset download fallback
    if (!cachedLatestRelease?.downloadUrl || !cachedLatestRelease?.sha256) {
      await checkForUpdatesInternal();
    }

    if (!cachedLatestRelease?.downloadUrl || !cachedLatestRelease?.sha256) {
      throw new Error('A release não tem um instalador com hash SHA-256 verificável.');
    }

    const downloadDir = app.getPath('downloads');
    const assetName = path.basename(cachedLatestRelease.assetName || `LPP2_Studio_v${cachedLatestRelease.version}.exe`);
    if (!assetName.toLowerCase().endsWith('.exe')) throw new Error('O arquivo publicado não é um instalador Windows.');
    assertAllowedDownloadUrl(cachedLatestRelease.downloadUrl);
    const targetPath = path.join(downloadDir, assetName);

    mainWindow?.webContents?.send('update-status', {
      type: 'downloading',
      progress: { percent: 0, transferred: 0, total: 100, bytesPerSecond: 0 }
    });

    await downloadFileWithProgress(cachedLatestRelease.downloadUrl, targetPath, (progress) => {
      mainWindow?.webContents?.send('update-status', {
        type: 'downloading',
        progress
      });
    });

    const actualHash = await calculateSha256(targetPath);
    if (actualHash.toLowerCase() !== cachedLatestRelease.sha256.toLowerCase()) {
      fs.unlinkSync(targetPath);
      throw new Error('A verificação SHA-256 do instalador falhou. O arquivo foi descartado.');
    }

    downloadedUpdatePath = targetPath;

    mainWindow?.webContents?.send('update-status', {
      type: 'downloaded',
      info: {
        version: cachedLatestRelease.version,
        filePath: targetPath
      }
    });

    return { success: true, filePath: targetPath };
  } catch (err) {
    console.error('[LPP2 AutoUpdater] Erro ao baixar atualização:', err);
    mainWindow?.webContents?.send('update-status', { type: 'error', error: err.message });
    return { success: false, error: err.message };
  }
});

// IPC: Install update and restart
ipcMain.handle('install-update', async () => {
  if (app.isPackaged && autoUpdater) {
    try {
      autoUpdater.quitAndInstall(false, true);
      return;
    } catch (e) {
      console.warn('quitAndInstall fallback:', e);
    }
  }

  if (downloadedUpdatePath && fs.existsSync(downloadedUpdatePath)) {
    await shell.openPath(downloadedUpdatePath);
    setTimeout(() => {
      app.quit();
    }, 1000);
  }
});

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
