import { SoundManager, SOUND_KEYS } from '../game/SoundManager.js';

// ── Metadata per sound key ─────────────────────────────────────────────────

const SLOT_META = {
  hit:       { name: 'Attack Hit',     desc: 'Plays on clash when two minions collide.',        icon: '⚔️',  color: '#ef4444' },
  death:     { name: 'Card Death',     desc: 'Plays when a minion dies and fades out.',          icon: '💀',  color: '#7c3aed' },
  summon:    { name: 'Summon',         desc: 'Plays when a minion is placed on the field.',      icon: '✨',  color: '#3b82f6' },
  draw:      { name: 'Draw Card',      desc: 'Plays each time a card is drawn from the deck.',  icon: '🃏',  color: '#10b981' },
  endTurn:   { name: 'End Turn',       desc: 'Plays when the End Turn button is clicked.',       icon: '⏭️',  color: '#f59e0b' },
  battlecry: { name: 'Battlecry',      desc: 'Plays when a battlecry triggers on summon.',       icon: '📣',  color: '#f97316' },
  morale:    { name: 'Morale Change',  desc: 'Plays on morale gain or drain effects.',           icon: '🏳️', color: '#ec4899' },
  heal:      { name: 'Heal',           desc: 'Plays when a friendly minion is healed.',          icon: '💚',  color: '#22c55e' },
  destroy:   { name: 'Destroy Spell',  desc: 'Plays when a destroy spell targets a minion.',    icon: '💥',  color: '#6b7280' },
  spell:     { name: 'Spell Cast',     desc: 'Plays on attack buffs and other spell effects.',  icon: '🔮',  color: '#8b5cf6' },
};

// ── AudioContext for waveform decoding ────────────────────────────────────

let _ac = null;
function getAC() {
  if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
  return _ac;
}

// ── Waveform drawing ─────────────────────────────────────────────────────

async function drawWaveform(canvas, dataUrl, color) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
  const H = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
  ctx.clearRect(0, 0, W, H);

  try {
    const res    = await fetch(dataUrl);
    const ab     = await res.arrayBuffer();
    const ac     = getAC();
    const decoded = await ac.decodeAudioData(ab);
    const data   = decoded.getChannelData(0);
    const step   = Math.max(1, Math.floor(data.length / W));

    ctx.fillStyle  = color + '99';
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;

    const midY = H / 2;
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const i   = x * step;
      const max = data.slice(i, i + step).reduce((a, v) => Math.max(a, Math.abs(v)), 0);
      const h   = max * midY * 0.95;
      ctx.moveTo(x, midY - h);
      ctx.lineTo(x, midY + h);
    }
    ctx.stroke();
  } catch {
    // Failed to decode — just show a flat line
    ctx.strokeStyle = color + '55';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
  }
}

// ── Status helpers ────────────────────────────────────────────────────────

function formatSize(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// Estimate data URL byte size (roughly 3/4 of base64 chars after removing prefix)
function dataUrlSize(url) {
  const b64 = url.split(',')[1] ?? '';
  return Math.round(b64.length * 0.75);
}

// ── Build a slot card ─────────────────────────────────────────────────────

function buildSlotCard(key) {
  const meta = SLOT_META[key];
  const info = SoundManager.getCustomInfo()[key];
  const hasCustom = info.hasCustom;
  const volume = info.volume;

  const card = document.createElement('div');
  card.className = 'slot-card';
  card.style.setProperty('--accent', meta.color);
  card.dataset.key = key;

  // ── Header
  card.innerHTML = `
    <div class="slot-header">
      <div class="slot-icon" style="background:${meta.color}22;color:${meta.color}">${meta.icon}</div>
      <div>
        <div class="slot-name">${meta.name}</div>
        <div class="slot-desc">${meta.desc}</div>
      </div>
      <span class="status-tag ${hasCustom ? 'status-custom' : 'status-builtin'}" id="status-${key}">
        ${hasCustom ? 'Custom' : 'Built-in'}
      </span>
    </div>

    <div class="drop-zone ${hasCustom ? 'has-file' : ''}" id="drop-${key}" title="Click or drag an audio file here">
      <input type="file" accept="audio/*" id="file-${key}" />
      <div class="drop-icon">${hasCustom ? '🎵' : '⬆️'}</div>
      <div id="drop-label-${key}">${hasCustom ? _filename(key) : 'Drop audio file here or click to browse'}</div>
      <div class="file-info" id="file-info-${key}">${hasCustom ? formatSize(dataUrlSize(stored)) : ''}</div>
    </div>

    <div class="waveform-wrap" id="wave-wrap-${key}" style="${hasCustom ? '' : 'display:none'}">
      <canvas class="waveform" id="wave-${key}"></canvas>
    </div>

    <div class="controls">
      <button class="btn-test" data-key="${key}">▶ Test</button>
      <button class="btn-clear" data-key="${key}" style="${hasCustom ? '' : 'display:none'}" id="clear-${key}">🗑 Clear</button>
      <span class="vol-label">Vol</span>
      <input type="range" min="0" max="1" step="0.01"
             value="${volume}" id="vol-${key}" style="accent-color:${meta.color}" />
      <span class="vol-display" id="vol-val-${key}">${Math.round(volume * 100)}%</span>
    </div>`;

  // Draw waveform if there's already a file
  if (hasCustom) {
    requestAnimationFrame(() => {
      const canvas = card.querySelector(`#wave-${key}`);
      const dataUrl = SoundManager.getCustomInfo()[key]?.dataUrl ?? null;
      if (canvas && dataUrl) drawWaveform(canvas, dataUrl, meta.color);
    });
  }

  return card;
}

function _filename(key) {
  return SoundManager.getCustomInfo()[key]?.fname ?? 'Custom file';
}

// ── Wire up events on a card ──────────────────────────────────────────────

function wireCard(card) {
  const key  = card.dataset.key;
  const meta = SLOT_META[key];
  const drop = card.querySelector(`#drop-${key}`);
  const fileInput = card.querySelector(`#file-${key}`);

  // Drag/drop
  drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(key, file);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) handleFile(key, file);
  });

  // Test button
  card.querySelector('.btn-test').addEventListener('click', () => SoundManager.play(key));

  // Clear button
  const clearBtn = card.querySelector(`#clear-${key}`);
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      await SoundManager.clearCustom(key);
      updateCardUI(key, false);
    });
  }

  // Volume slider
  const volSlider = card.querySelector(`#vol-${key}`);
  const volDisplay = card.querySelector(`#vol-val-${key}`);
  volSlider.addEventListener('input', () => {
    const v = parseFloat(volSlider.value);
    volDisplay.textContent = Math.round(v * 100) + '%';
    SoundManager.setKeyVolume(key, v);
  });
}

// ── Handle a dropped / selected audio file ────────────────────────────────

async function handleFile(key, file) {
  const meta = SLOT_META[key];
  const reader = new FileReader();
  reader.onload = async e => {
    const dataUrl = e.target.result;
    // Persist + decode (fname stored in SoundManager now)
    const vol = parseFloat(document.getElementById(`vol-${key}`)?.value ?? '1');
    await SoundManager.setCustom(key, dataUrl, vol, file.name);
    updateCardUI(key, true, { name: file.name, size: file.size, dataUrl, color: meta.color });
  };
  reader.readAsDataURL(file);
}

// ── Update card UI after load/clear ──────────────────────────────────────

function updateCardUI(key, hasCustom, info = {}) {
  const meta      = SLOT_META[key];
  const dropZone  = document.getElementById(`drop-${key}`);
  const dropLabel = document.getElementById(`drop-label-${key}`);
  const fileInfo  = document.getElementById(`file-info-${key}`);
  const waveWrap  = document.getElementById(`wave-wrap-${key}`);
  const canvas    = document.getElementById(`wave-${key}`);
  const clearBtn  = document.getElementById(`clear-${key}`);
  const statusTag = document.getElementById(`status-${key}`);
  const dropIcon  = dropZone?.querySelector('.drop-icon');

  if (hasCustom) {
    dropZone?.classList.add('has-file');
    if (dropIcon) dropIcon.textContent = '🎵';
    if (dropLabel) dropLabel.textContent = info.name ?? _filename(key);
    if (fileInfo)  fileInfo.textContent  = info.size ? formatSize(info.size) : '';
    if (waveWrap)  waveWrap.style.display = '';
    if (canvas && info.dataUrl) drawWaveform(canvas, info.dataUrl, info.color ?? meta.color);
    if (clearBtn)  clearBtn.style.display = '';
    if (statusTag) { statusTag.textContent = 'Custom'; statusTag.className = 'status-tag status-custom'; }
  } else {
    dropZone?.classList.remove('has-file');
    if (dropIcon) dropIcon.textContent = '⬆️';
    if (dropLabel) dropLabel.textContent = 'Drop audio file here or click to browse';
    if (fileInfo)  fileInfo.textContent  = '';
    if (waveWrap)  waveWrap.style.display = 'none';
    if (clearBtn)  clearBtn.style.display = 'none';
    if (statusTag) { statusTag.textContent = 'Built-in'; statusTag.className = 'status-tag status-builtin'; }
  }
}

// ── Master volume toolbar ─────────────────────────────────────────────────

const masterSlider = document.getElementById('masterVol');
const masterVal    = document.getElementById('masterVolVal');
const muteBtn      = document.getElementById('muteBtn');
const clearAllBtn  = document.getElementById('clearAllBtn');

masterSlider.addEventListener('input', () => {
  const v = parseFloat(masterSlider.value);
  masterVal.textContent = Math.round(v * 100) + '%';
  SoundManager.setVolume(v);
});

muteBtn.addEventListener('click', () => {
  const nowMuted = SoundManager.isMuted;
  SoundManager.mute(!nowMuted);
  muteBtn.textContent = nowMuted ? '🔇 Mute' : '🔊 Unmute';
});

clearAllBtn.addEventListener('click', async () => {
  if (!confirm('Remove all custom sounds and revert to built-in?')) return;
  await Promise.all(SOUND_KEYS.map(key => SoundManager.clearCustom(key)));
  SOUND_KEYS.forEach(key => updateCardUI(key, false));
});

// ── Init ──────────────────────────────────────────────────────────────────

(async () => {
  await SoundManager.loadAllCustom();

  const grid = document.getElementById('grid');
  for (const key of SOUND_KEYS) {
    const card = buildSlotCard(key);
    grid.appendChild(card);
    wireCard(card);
  }
})();
