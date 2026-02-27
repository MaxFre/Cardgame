import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import path from 'path';

// Path where cards are stored (source-of-truth)
const CREATED_CARDS_DIR  = resolve(__dirname, 'src/assets/cards/CreatedCards');
const COLLECTION_FILE    = path.join(CREATED_CARDS_DIR, 'collection.json');
const LAYOUT_FILE        = path.join(CREATED_CARDS_DIR, 'layout.json');
const VFX_PRESETS_FILE   = path.join(CREATED_CARDS_DIR, 'vfx-presets.json');
const SOUNDS_FILE        = path.join(CREATED_CARDS_DIR, 'sounds.json');
// Mirror to public/ so `vite build` bundles the latest data
const PUBLIC_CARDS_DIR   = resolve(__dirname, 'public/CreatedCards');
const PUBLIC_COLLECTION  = path.join(PUBLIC_CARDS_DIR, 'collection.json');
const PUBLIC_LAYOUT      = path.join(PUBLIC_CARDS_DIR, 'layout.json');
const PUBLIC_VFX_PRESETS = path.join(PUBLIC_CARDS_DIR, 'vfx-presets.json');
const PUBLIC_SOUNDS      = path.join(PUBLIC_CARDS_DIR, 'sounds.json');

function writeWithPublicMirror(srcFile, publicFile, body) {
  fs.writeFileSync(srcFile, body, 'utf-8');
  fs.mkdirSync(path.dirname(publicFile), { recursive: true });
  fs.writeFileSync(publicFile, body, 'utf-8');
}

/** Vite plugin: save-collection API + static serving of CreatedCards */
function cardStoragePlugin() {
  return {
    name: 'card-storage',
    configureServer(server) {
      // POST /api/save-collection
      server.middlewares.use('/api/save-collection', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          try {
            JSON.parse(body);
            fs.mkdirSync(CREATED_CARDS_DIR, { recursive: true });
            writeWithPublicMirror(COLLECTION_FILE, PUBLIC_COLLECTION, body);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });

      // POST /api/save-layout — merges with existing layout.json so handSlots aren't lost
      server.middlewares.use('/api/save-layout', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          try {
            const incoming = JSON.parse(body);
            let existing = {};
            try { existing = JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf-8')); } catch { /* first write */ }
            const merged = JSON.stringify({ ...existing, ...incoming }, null, 2);
            fs.mkdirSync(CREATED_CARDS_DIR, { recursive: true });
            writeWithPublicMirror(LAYOUT_FILE, PUBLIC_LAYOUT, merged);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });

      // POST /api/save-vfx-presets
      server.middlewares.use('/api/save-vfx-presets', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          try {
            JSON.parse(body);
            fs.mkdirSync(CREATED_CARDS_DIR, { recursive: true });
            writeWithPublicMirror(VFX_PRESETS_FILE, PUBLIC_VFX_PRESETS, body);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });

      // POST /api/save-sounds — saves sound data URLs + volumes to sounds.json
      server.middlewares.use('/api/save-sounds', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          try {
            JSON.parse(body);
            fs.mkdirSync(CREATED_CARDS_DIR, { recursive: true });
            writeWithPublicMirror(SOUNDS_FILE, PUBLIC_SOUNDS, body);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });

      // POST /api/save-hand-layout — merges { handSlots, opponentHandSlots } into layout.json
      server.middlewares.use('/api/save-hand-layout', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          try {
            const incoming = JSON.parse(body);
            let existing = {};
            try { existing = JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf-8')); } catch { /* first write */ }
            const merged = JSON.stringify({ ...existing, ...incoming }, null, 2);
            fs.mkdirSync(CREATED_CARDS_DIR, { recursive: true });
            writeWithPublicMirror(LAYOUT_FILE, PUBLIC_LAYOUT, merged);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });

      // Serve /CreatedCards/* from src/assets/cards/CreatedCards/ with no-cache headers
      server.middlewares.use('/CreatedCards', (req, res, next) => {
        const filePath = path.join(CREATED_CARDS_DIR, req.url === '/' ? '' : req.url);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(fs.readFileSync(filePath));
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [cardStoragePlugin()],
  server: {
    port: 5173,
    headers: {
      // Prevent browsers from caching JS/assets during development
      'Cache-Control': 'no-store',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main:        resolve(__dirname, 'index.html'),
        editor:      resolve(__dirname, 'card-editor.html'),
        handEditor:  resolve(__dirname, 'hand-editor.html'),
        vfxEditor:   resolve(__dirname, 'vfx-editor.html'),
        soundEditor: resolve(__dirname, 'sound-editor.html'),
        animEditor:  resolve(__dirname, 'animation-editor.html'),
      },
    },
  },
});
