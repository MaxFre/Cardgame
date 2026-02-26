import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const isDev = process.env.NODE_ENV !== 'production';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'CardGame',
    webPreferences: {
      contextIsolation: true,
    },
  });

  win.setMenuBarVisibility(false);

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
