const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon-192.png'),
    titleBarStyle: 'default',
    backgroundColor: '#1a1a1a'
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Open DevTools in development (comment out for production)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  const exeDir = path.dirname(app.getPath('exe'));
  const dataDir = path.join(exeDir, 'BoxAuditPortableData');
  const dataFile = path.join(dataDir, 'box-audit-data.json');
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  } catch {}

  ipcMain.handle('load-data', () => {
    try {
      if (fs.existsSync(dataFile)) {
        const raw = fs.readFileSync(dataFile, 'utf-8');
        return JSON.parse(raw);
      }
    } catch {}
    return null;
  });

  ipcMain.handle('save-data', (event, data) => {
    try {
      fs.writeFileSync(dataFile, JSON.stringify(data), 'utf-8');
      return true;
    } catch {
      return false;
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// App termination uses default Electron lifecycle behavior
