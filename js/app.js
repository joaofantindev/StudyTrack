/* ================= storage ================= */
const K = {
  tasks: 'studytrack.tasks',
  notes: 'studytrack.notes',
  prefs: 'studytrack.prefs',
  subjects: 'studytrack.subjects',
  jobs: 'studytrack.jobs',
  history: 'studytrack.history',
  wallpaper: 'studytrack.wallpaper'
};

const load = (k, fallback) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch { toast('Falha ao salvar no localStorage', 'warn'); }
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const shiftISO = days => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const parseISO = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const daysUntil = s => Math.round((parseISO(s) - parseISO(todayISO())) / 86400000);

const fmtDate = s => {
  const d = typeof s === 'number' ? new Date(s) : parseISO(s);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};
const fmtDateTime = ts => new Date(ts).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
});

const PRIOS = { alta: { label: 'Alta', weight: 0, color: 'var(--accent)' },
                media: { label: 'Média', weight: 1, color: 'var(--warn)' },
                baixa: { label: 'Baixa', weight: 2, color: 'var(--muted)' } };

const SUBJECT_COLORS = ['#e02b2b','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#8b5cf6','#ec4899','#64748b'];

const SUBJECTS_DEFAULT = [
  'JavaScript','HTML & CSS','Python','Java','Banco de Dados','DevOps','Algoritmos','English','Git','Outros'
];

const JOB_STATUS = {
  ativo: { label: 'Ativo', color: 'var(--accent)' },
  pausado: { label: 'Pausado', color: 'var(--warn)' },
  concluido: { label: 'Concluído', color: 'var(--ok)' }
};

const DAY = 86400000;
const HISTORY_DAYS = 7;
const HISTORY_MAX = 400;
const WALL_MAX_SIZE = 1920;

/* ================= state ================= */
const defaultPrefs = {
  theme: 'zabbix',
  accent: '#e02b2b',
  density: 'normal',
  motion: 'on',
  font: 'system',
  notesMode: 'split',
  accentCustom: false,
  subjectColors: {}
};

let tasks = load(K.tasks, []);
let notes = load(K.notes, []);
let prefs = Object.assign({}, defaultPrefs, load(K.prefs, {}));
let jobs = load(K.jobs, []);
let history = load(K.history, []);
let wallpaper = load(K.wallpaper, null);

const slug = name => String(name || '').trim().toLowerCase();

function migrateSubjects() {
  const set = new Set(SUBJECTS_DEFAULT);
  tasks.forEach(t => t.subject && set.add(t.subject));
  const list = Array.from(set);
  save(K.subjects, list);
  return list;
}

let subjects = (() => {
  const stored = load(K.subjects, null);
  if (Array.isArray(stored) && stored.length) {
    return Array.from(new Set(stored.map(s => String(s).trim()).filter(Boolean)));
  }
  return migrateSubjects();
})();

const findSubject = name => subjects.find(s => s.toLowerCase() === slug(name));

jobs = (Array.isArray(jobs) ? jobs : []).map(j => ({
  id: j.id || uid(),
  title: j.title || 'Trabalho',
  company: j.company || '',
  status: JOB_STATUS[j.status] ? j.status : 'ativo',
  due: j.due || '',
  desc: j.desc || '',
  items: (Array.isArray(j.items) ? j.items : []).map(normalizeItem).filter(Boolean),
  links: (Array.isArray(j.links) ? j.links : []).map(l => ({
    id: l.id || uid(),
    label: l.label || l.url || 'link',
    url: l.url || ''
  })).filter(l => l.url),
  note: { content: (j.note && j.note.content) || '', updatedAt: (j.note && j.note.updatedAt) || Date.now() },
  createdAt: j.createdAt || Date.now(),
  updatedAt: j.updatedAt || Date.now()
}));

tasks.forEach(t => { if (!Array.isArray(t.subtasks)) t.subtasks = []; });
history = (Array.isArray(history) ? history : []).filter(h => h && h.id && h.title);

let ui = {
  view: 'dashboard',
  search: '',
  filters: { subject: '', priority: '', status: 'pending', overdue: false, sort: 'smart' },
  editingTaskId: null,
  activeNoteId: notes[0]?.id || null,
  editingSubject: null,
  subjectSearch: '',
  activeJobId: jobs[0]?.id || null,
  jobSearch: '',
  jobNoteLoadedFor: null,
  jobFilters: { priority: '', status: 'pending' },
  jobFilterStatus: 'todos',
  editingJobId: null,
  editingItemId: null,
  editingItemJobId: null,
  openGroups: new Set(),
  confirmAction: null
};

const persistAll = () => {
  save(K.tasks, tasks);
  save(K.notes, notes);
  save(K.prefs, prefs);
  save(K.subjects, subjects);
  save(K.jobs, jobs);
  save(K.history, history);
};
const persistTasks = () => save(K.tasks, tasks);
const persistNotes = () => save(K.notes, notes);
const persistSubjects = () => save(K.subjects, subjects);
const persistJobs = () => save(K.jobs, jobs);
const persistHistory = () => save(K.history, history);

/* ================= dom ================= */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const el = id => document.getElementById(id);

/* ================= toast ================= */
const TOAST_ICONS = {
  ok: '<path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8h.01M11 12h1v5h1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  warn: '<path d="M12 4l9 16H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
};

function toast(msg, kind = 'info') {
  const box = el('toasts');
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.innerHTML = `<svg viewBox="0 0 24 24">${TOAST_ICONS[kind] || TOAST_ICONS.info}</svg><span></span>`;
  node.querySelector('span').textContent = msg;
  box.appendChild(node);
  while (box.children.length > 4) box.firstElementChild.remove();
  setTimeout(() => {
    node.style.transition = 'opacity .2s,transform .2s';
    node.style.opacity = '0';
    node.style.transform = 'translateX(20px)';
    setTimeout(() => node.remove(), 220);
  }, 2600);
}

function setStatus(msg) { el('status-left').textContent = msg; }

/* ================= modal ================= */
const openModal = id => {
  el(id).classList.add('is-open');
  el('backdrop').classList.add('is-open');
};
const closeModals = () => {
  $$('.modal').forEach(m => m.classList.remove('is-open'));
  el('backdrop').classList.remove('is-open');
};

function confirmAction(title, text, cb) {
  el('confirm-title').textContent = title;
  el('confirm-text').textContent = text;
  ui.confirmAction = cb;
  openModal('confirm-modal');
}

/* ================= theme / prefs ================= */
const THEMES = [
  { id:'zabbix', name:'Zabbix Red', desc:'preto e vermelho' },
  { id:'midnight', name:'Midnight', desc:'azul escuro' },
  { id:'matrix', name:'Matrix', desc:'verde terminal' },
  { id:'amber', name:'Amber', desc:'âmbar' },
  { id:'violet', name:'Violet', desc:'roxo' },
  { id:'paper', name:'Paper', desc:'claro' }
];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [parseInt(n.slice(0,2),16), parseInt(n.slice(2,4),16), parseInt(n.slice(4,6),16)];
}
const shade = (hex, amt) => {
  const [r,g,b] = hexToRgb(hex);
  const f = c => Math.max(0, Math.min(255, Math.round(c + amt)));
  return `#${[f(r),f(g),f(b)].map(c => c.toString(16).padStart(2,'0')).join('')}`;
};

const relLum = rgb => {
  const f = c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};
const contrastWith = (rgb, ref) => {
  const a = relLum(rgb), b = relLum(ref);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const toHex = rgb => '#' + rgb.map(c =>
  Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');

function readableFill(hex) {
  let rgb = hexToRgb(hex);
  if (contrastWith(rgb, [255, 255, 255]) >= 4.5) return hex;
  for (let i = 0; i < 30 && rgb.some(c => c > 0); i++) rgb = rgb.map(c => c * 0.92);
  return toHex(rgb);
}

function applyPrefs() {
  document.documentElement.dataset.theme = prefs.theme;
  document.documentElement.dataset.density = prefs.density;
  document.documentElement.dataset.motion = prefs.motion;
  document.documentElement.dataset.font = prefs.font;
  document.documentElement.style.setProperty('--accent', prefs.accent);
  document.documentElement.style.setProperty('--accent-fill', readableFill(prefs.accent));
  document.documentElement.style.setProperty('--accent-2', shade(prefs.accent, 45));
  el('accent-picker').value = prefs.accent;
  el('accent-picker-2').value = prefs.accent;
  el('opt-compact').checked = prefs.density === 'compact';
  el('opt-motion').checked = prefs.motion === 'on';
  el('opt-font').value = prefs.font;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', prefs.theme === 'paper' ? '#f2f3f6' : '#0c0c0e');
  if (el('editor-body')) setNotesMode(prefs.notesMode);
  renderThemeGrid();
}

const THEME_ACCENT = {
  zabbix: '#e02b2b', midnight: '#3b82f6', matrix: '#22c55e',
  amber: '#f59e0b', violet: '#8b5cf6', paper: '#d40d0d'
};

function setTheme(id) {
  prefs.theme = id;
  if (!prefs.accentCustom) prefs.accent = THEME_ACCENT[id] || THEME_ACCENT.zabbix;
  applyPrefs();
  persistAll();
  renderAll();
  toast(`Tema "${THEMES.find(t => t.id === id).name}" aplicado`, 'ok');
}

function renderThemeGrid() {
  const accent = THEME_ACCENT;
  const bg = { zabbix:'#111114', midnight:'#0c101c', matrix:'#070d0b', amber:'#18150e', violet:'#120e1c', paper:'#ffffff' };
  el('theme-grid').innerHTML = THEMES.map(t => `
    <button class="theme-card ${t.id === prefs.theme ? 'is-active' : ''}" data-theme-id="${t.id}">
      <div class="theme-prev" style="background:${bg[t.id]}">
        <div class="side" style="background:${bg[t.id]};box-shadow:inset 0 0 0 1px ${accent[t.id]}33"></div>
        <div class="main">
          <div class="bar" style="background:${accent[t.id]}"></div>
          <div class="bar" style="background:${accent[t.id]}55"></div>
          <div class="bar w60" style="background:${accent[t.id]}33"></div>
        </div>
      </div>
      <div class="meta">
        <strong>${t.name}</strong>
        <small>${t.desc}</small>
      </div>
    </button>`).join('');
}

/* ================= wallpaper ================= */
const kb = bytes => bytes > 1048576
  ? `${(bytes / 1048576).toFixed(1)} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function applyWallpaperVars() {
  const root = document.documentElement;
  const on = !!(wallpaper && wallpaper.url);
  root.dataset.wall = on ? 'on' : 'off';
  if (on) {
    root.style.setProperty('--wallpaper', `url("${wallpaper.url}")`);
    root.style.setProperty('--wall-veil', String(wallpaper.veil ?? 0.35));
    root.style.setProperty('--wall-alpha', `${wallpaper.alpha ?? 90}%`);
    root.style.setProperty('--wall-blur', `${wallpaper.blur ?? 3}px`);
  } else {
    ['--wallpaper', '--wall-veil', '--wall-alpha', '--wall-blur'].forEach(p => root.style.removeProperty(p));
  }
}

function renderWallpaperUI() {
  const box = el('wall-preview');
  const on = !!(wallpaper && wallpaper.url);
  if (box) {
    box.classList.toggle('is-hidden', !on);
    if (on) {
      box.innerHTML = `
        <img src="${wallpaper.url}" alt="Plano de fundo atual">
        <div class="wall-info">
          <strong>${escapeHtml(wallpaper.name || 'wallpaper')}</strong>
          <small>${wallpaper.w}&times;${wallpaper.h} · ${kb(wallpaper.size || 0)} · enviado ${fmtDateTime(wallpaper.setAt || Date.now())}</small>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="wall-remove">Remover</button>`;
    } else {
      box.innerHTML = '';
    }
  }
  const range = id => { const n = el(id); if (n) n.disabled = !on; return n; };
  const veil = range('wall-veil');
  const alpha = range('wall-alpha');
  const blur = range('wall-blur');
  if (veil) veil.value = Math.round((wallpaper?.veil ?? 0.35) * 100);
  if (alpha) alpha.value = wallpaper?.alpha ?? 90;
  if (blur) blur.value = wallpaper?.blur ?? 3;
  if (el('wall-veil-val')) el('wall-veil-val').textContent = `${Math.round((wallpaper?.veil ?? 0.35) * 100)}%`;
  if (el('wall-alpha-val')) el('wall-alpha-val').textContent = `${wallpaper?.alpha ?? 90}%`;
  if (el('wall-blur-val')) el('wall-blur-val').textContent = `${wallpaper?.blur ?? 3}px`;
}

function applyWallpaper() {
  applyWallpaperVars();
  renderWallpaperUI();
}

function storeWallpaper(next) {
  const prev = wallpaper;
  wallpaper = next;
  try {
    localStorage.setItem(K.wallpaper, JSON.stringify(wallpaper));
  } catch {
    wallpaper = prev;
    applyWallpaper();
    toast('Imagem grande demais para o navegador — envie uma menor', 'warn');
    return false;
  }
  applyWallpaper();
  return true;
}

function downscaleImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, WALL_MAX_SIZE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      if (scale === 1) {
        resolve({ url: dataUrl, w, h });
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      try {
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({ url: canvas.toDataURL('image/jpeg', 0.82), w, h });
      } catch {
        resolve({ url: dataUrl, w, h });
      }
    };
    img.onerror = () => reject(new Error('imagem inválida'));
    img.src = dataUrl;
  });
}

function uploadWallpaper(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) {
    toast('Envie um arquivo de imagem', 'warn');
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    downscaleImage(e.target.result)
      .then(img => {
        const prev = wallpaper || {};
        const ok = storeWallpaper({
          url: img.url,
          name: file.name,
          w: img.w,
          h: img.h,
          size: Math.round(img.url.length * 0.75),
          veil: prev.veil ?? 0.35,
          alpha: prev.alpha ?? 90,
          blur: prev.blur ?? 3,
          setAt: Date.now()
        });
        if (!ok) return;
        toast('Plano de fundo aplicado', 'ok');
        setStatus(`Wallpaper "${file.name}" aplicado`);
      })
      .catch(() => toast('Não consegui ler essa imagem', 'warn'));
  };
  reader.onerror = () => toast('Falha ao ler o arquivo', 'warn');
  reader.readAsDataURL(file);
}

function removeWallpaper() {
  confirmAction('Remover plano de fundo', 'Tem certeza que deseja remover o wallpaper?', () => {
    wallpaper = null;
    try { localStorage.removeItem(K.wallpaper); } catch {}
    applyWallpaper();
    toast('Plano de fundo removido', 'warn');
    setStatus('Plano de fundo removido');
  });
}

/* ================= subjects ================= */
const nextColor = () => {
  const used = Object.values(prefs.subjectColors);
  const free = SUBJECT_COLORS.find(c => !used.includes(c));
  return free || SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
};

const subjectTasks = name => tasks.filter(t => slug(t.subject) === slug(name));

const allSubjects = () => {
  const known = new Set(subjects.map(slug));
  const strays = tasks
    .map(t => t.subject)
    .filter(s => s && !known.has(slug(s)));
  return Array.from(new Set([...subjects, ...strays]));
};

const subjectColor = s => {
  if (prefs.subjectColors[s]) return prefs.subjectColors[s];
  const match = findSubject(s) || s;
  if (prefs.subjectColors[match]) return prefs.subjectColors[match];
  const list = allSubjects();
  const idx = list.findIndex(x => slug(x) === slug(s));
  return SUBJECT_COLORS[(idx < 0 ? 0 : idx) % SUBJECT_COLORS.length];
};

function addSubject(name) {
  const clean = String(name || '').trim();
  if (!clean) return { ok: false, error: 'Digite um nome para a matéria.' };
  if (clean.length > 40) return { ok: false, error: 'Use no máximo 40 caracteres.' };
  if (findSubject(clean)) return { ok: false, error: `"${clean}" já existe.` };
  subjects.push(clean);
  prefs.subjectColors[clean] = nextColor();
  persistSubjects();
  save(K.prefs, prefs);
  renderAll();
  setStatus(`Matéria "${clean}" adicionada`);
  return { ok: true, name: clean };
}

function renameSubject(oldName, newName) {
  const from = findSubject(oldName);
  const clean = String(newName || '').trim();
  if (!from) return { ok: false, error: 'Matéria não encontrada.' };
  if (!clean) return { ok: false, error: 'Digite um nome para a matéria.' };
  if (clean.length > 40) return { ok: false, error: 'Use no máximo 40 caracteres.' };
  const clash = findSubject(clean);
  if (clash && clash !== from) return { ok: false, error: `"${clean}" já existe.` };
  if (clean === from) return { ok: true, name: from };

  const idx = subjects.indexOf(from);
  subjects[idx] = clean;
  if (prefs.subjectColors[from]) {
    prefs.subjectColors[clean] = prefs.subjectColors[from];
    delete prefs.subjectColors[from];
  } else {
    prefs.subjectColors[clean] = nextColor();
  }

  let taskHits = 0;
  tasks.forEach(t => {
    if (slug(t.subject) === slug(from)) { t.subject = clean; taskHits++; }
  });

  let noteHits = 0;
  notes.forEach(n => {
    if (!Array.isArray(n.tags)) return;
    n.tags = n.tags.map(tag => {
      if (slug(tag) !== slug(from)) return tag;
      noteHits++;
      return clean;
    });
  });

  if (ui.filters.subject === from) ui.filters.subject = clean;
  if (el('filter-subject').value === from) el('filter-subject').value = clean;

  persistAll();
  renderAll();
  setStatus(`Matéria renomeada para "${clean}"`);
  return { ok: true, name: clean, taskHits, noteHits };
}

function deleteSubject(name) {
  const target = findSubject(name);
  if (!target) return { ok: false, error: 'Matéria não encontrada.' };
  if (subjects.length <= 1) return { ok: false, error: 'Mantenha ao menos uma matéria.' };

  const detached = subjectTasks(target).length;
  subjects = subjects.filter(s => s !== target);
  tasks.forEach(t => {
    if (slug(t.subject) === slug(target)) t.subject = '';
  });
  notes.forEach(n => {
    if (Array.isArray(n.tags)) n.tags = n.tags.filter(tag => slug(tag) !== slug(target));
  });
  delete prefs.subjectColors[target];
  if (ui.filters.subject === target) ui.filters.subject = '';

  persistAll();
  renderAll();
  return { ok: true, detached };
}

function commitSubjectRename() {
  const pending = ui.editingSubject;
  ui.editingSubject = null;
  if (!pending) return;

  if (pending.value.trim() === pending.original) {
    renderSubjectManager();
    return;
  }

  const res = renameSubject(pending.original, pending.value);
  renderSubjectManager();

  if (!res.ok) {
    toast(res.error, 'warn');
    return;
  }
  const details = [];
  if (res.taskHits) details.push(`${res.taskHits} tarefa${res.taskHits !== 1 ? 's' : ''}`);
  if (res.noteHits) details.push(`${res.noteHits} tag${res.noteHits !== 1 ? 's' : ''} de nota${res.noteHits !== 1 ? 's' : ''}`);
  toast(`Matéria "${res.name}"${details.length ? ` · atualizou ${details.join(' e ')}` : ''}`, 'ok');
}

function openSubjectModal() {
  ui.subjectSearch = '';
  ui.editingSubject = null;
  el('subject-search').value = '';
  el('subject-new').value = '';
  renderSubjectManager();
  openModal('subject-modal');
  el('subject-new').focus();
}

function renderSubjectManager() {
  const box = el('subject-manager');
  if (!box) return;
  const q = ui.subjectSearch || '';
  const list = allSubjects()
    .filter(s => !q || s.toLowerCase().includes(slug(q)))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  box.innerHTML = list.length ? list.map(s => {
    const pending = subjectTasks(s).filter(t => !t.done).length;
    const total = subjectTasks(s).length;
    return `
      <li class="sm-row" data-subject-row="${escapeHtml(s)}">
        <input type="color" class="sm-color" data-act="color" value="${subjectColor(s)}" title="Cor da matéria">
        <input type="text" class="sm-name" data-act="name" value="${escapeHtml(s)}" maxlength="40" aria-label="Nome da matéria">
        <span class="sm-count" title="${total} tarefa${total !== 1 ? 's' : ''} no total">${pending}<span class="muted">/${total}</span></span>
        <button class="sm-btn" data-act="del" title="Excluir matéria">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </li>`;
  }).join('') : '<li class="empty">Nenhuma matéria encontrada.</li>';

  el('subject-count').textContent = allSubjects().length;
}

/* ================= tasks ================= */
const isLate = t => !t.done && t.due && daysUntil(t.due) < 0;

function filteredTasks() {
  const f = ui.filters;
  const q = ui.search.trim().toLowerCase();
  let list = tasks.filter(t => {
    if (f.status === 'pending' && t.done) return false;
    if (f.status === 'done' && !t.done) return false;
    if (f.subject && t.subject !== f.subject) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.overdue && !isLate(t)) return false;
    if (q && !(`${t.title} ${t.subject} ${t.notes}`.toLowerCase().includes(q))) return false;
    return true;
  });

  const byDue = (a, b) => {
    if (!a.due && !b.due) return 0;
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due.localeCompare(b.due);
  };

  list.sort((a, b) => {
    if (f.sort === 'due') return byDue(a, b);
    if (f.sort === 'priority') return (PRIOS[a.priority].weight - PRIOS[b.priority].weight) || byDue(a, b);
    if (f.sort === 'created') return b.createdAt - a.createdAt;
    if (f.sort === 'title') return a.title.localeCompare(b.title, 'pt-BR');
    return (a.done - b.done)
      || (PRIOS[a.priority].weight - PRIOS[b.priority].weight)
      || byDue(a, b);
  });

  return list;
}

const CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const EDIT_SVG = '<svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16zM13.5 5.5l4 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const DEL_SVG = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const PLUS_SVG = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const COPY_SVG = '<svg viewBox="0 0 24 24"><path d="M9 9h10v10H9z"/><path d="M15 9V5H5v10h4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>';
const UNDO_SVG = '<svg viewBox="0 0 24 24"><path d="M4 10h9a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 6l-4 4 4 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const HOURS_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function dueTag(t) {
  if (!t.due) return '';
  const d = daysUntil(t.due);
  if (t.done) return `<span class="tag">✓ ${fmtDate(t.due)}</span>`;
  if (d < 0) return `<span class="tag due-late">${fmtDate(t.due)} · atrasada</span>`;
  if (d === 0) return `<span class="tag due-today">hoje</span>`;
  if (d === 1) return `<span class="tag due-today">amanhã</span>`;
  if (d <= 7) return `<span class="tag">${fmtDate(t.due)} · ${d}d</span>`;
  return `<span class="tag">${fmtDate(t.due)}</span>`;
}

function renderTaskList() {
  const list = filteredTasks();
  el('tasks-heading').textContent =
    ui.filters.subject ? ui.filters.subject : 'Todas as tarefas';
  el('tasks-heading').dataset.count = list.length;

  const box = el('task-list');
  if (!list.length) {
    box.innerHTML = `<li class="empty">${ui.search ? 'Nenhum resultado para "' + escapeHtml(ui.search) + '"' : 'Nenhuma tarefa aqui. Crie a primeira!'}</li>`;
    return;
  }

  box.innerHTML = list.map(t => `
    <li class="tgroup" data-scope="task" data-id="${t.id}">
      <div class="task ${t.done ? 'is-done' : ''} ${isLate(t) ? 'is-late' : ''}" style="--p:${PRIOS[t.priority].color}">
        <button class="check" data-act="toggle" aria-label="Alternar conclusão">${CHECK_SVG}</button>
        <div class="task-info">
          <span class="t-title">${escapeHtml(t.title)}${subCountBadge(t)}</span>
          <div class="t-meta">
            ${t.subject ? `<span class="tag" style="color:${subjectColor(t.subject)};border-color:${subjectColor(t.subject)}55">${escapeHtml(t.subject)}</span>` : ''}
            <span class="tag prio-${t.priority}">${PRIOS[t.priority].label}</span>
            ${dueTag(t)}
            ${t.notes ? `<span class="t-note">— ${escapeHtml(t.notes)}</span>` : ''}
          </div>
        </div>
        <div class="task-actions">
          <button data-act="edit" title="Editar">${EDIT_SVG}</button>
          <button data-act="del" class="del" title="Excluir">${DEL_SVG}</button>
        </div>
      </div>
      ${subPanel(t, 'task', '')}
    </li>`).join('');
}

function renderSidebarSubjects() {
  const counts = {};
  tasks.forEach(t => {
    if (!t.done && t.subject) counts[t.subject] = (counts[t.subject] || 0) + 1;
  });
  const list = allSubjects();
  const wrap = el('sidebar-subjects');
  wrap.innerHTML = list.map(s => `
    <button class="subject-chip ${ui.filters.subject === s && ui.view === 'tasks' ? 'is-active' : ''}" data-subject="${escapeHtml(s)}">
      <span class="dot" style="background:${subjectColor(s)}"></span>
      <span>${escapeHtml(s)}</span>
      <span class="n">${counts[s] || 0}</span>
    </button>`).join('');

  const sel = el('filter-subject');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todas</option>' + list.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  sel.value = list.includes(cur) ? cur : '';

  el('subject-list').innerHTML = list.map(s => `<option value="${escapeHtml(s)}"></option>`).join('');
}

/* ---------- subtarefas ---------- */
const subtasks = node => {
  if (!Array.isArray(node.subtasks)) node.subtasks = [];
  return node.subtasks;
};

const subProgress = node => {
  const list = subtasks(node);
  const done = list.filter(s => s.done).length;
  return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
};

const groupKey = (scope, jobId, id) => `${scope}:${jobId || ''}:${id}`;

function findNode(scope, jobId, id) {
  if (scope === 'item') {
    const job = jobs.find(j => j.id === jobId);
    const node = job && job.items.find(i => i.id === id);
    return node ? { node, job } : null;
  }
  const node = tasks.find(t => t.id === id);
  return node ? { node, job: null } : null;
}

const persistNode = found => found.job ? persistJobs() : persistTasks();

const subCountBadge = node => {
  const p = subProgress(node);
  if (!p.total) return '';
  return `<span class="sub-count ${p.done === p.total ? 'is-full' : ''}">${p.done}/${p.total} subtarefas</span>`;
};

function subPanel(node, scope, jobId) {
  const key = groupKey(scope, jobId, node.id);
  if (!ui.openGroups.has(key)) return '';
  const list = subtasks(node);
  const rows = list.length
    ? list.map(s => `
      <li class="sub-row ${s.done ? 'is-done' : ''}" data-sub-id="${s.id}">
        <button class="sub-check" data-act="sub-toggle" aria-label="Alternar subtarefa">${CHECK_SVG}</button>
        <span class="sub-title">${escapeHtml(s.title)}</span>
        <button class="sub-del" data-act="sub-del" title="Excluir subtarefa">${CLOSE_SVG}</button>
      </li>`).join('')
    : '<li class="sub-empty muted">Nenhuma subtarefa ainda.</li>';

  return `
    <div class="subs" style="--p:${PRIOS[node.priority] ? PRIOS[node.priority].color : 'var(--accent)'}">
      <ul class="subs-list">${rows}</ul>
      <form class="subs-form" data-scope="${scope}" data-job="${jobId || ''}" data-id="${node.id}">
        <input type="text" class="subs-input" placeholder="Nova subtarefa — Enter para adicionar" maxlength="120" autocomplete="off">
        <button type="submit" class="subs-add" title="Adicionar subtarefa">${PLUS_SVG}</button>
      </form>
    </div>`;
}

const toggleGroup = (scope, jobId, id) => {
  const key = groupKey(scope, jobId, id);
  if (ui.openGroups.has(key)) ui.openGroups.delete(key);
  else ui.openGroups.add(key);
  scope === 'item' ? renderJobItems() : renderTaskList();
};

function addSubtask(found, title) {
  const clean = String(title || '').trim();
  if (!clean || !found) return false;
  subtasks(found.node).push({
    id: uid(), title: clean, done: false, createdAt: Date.now(), completedAt: null
  });
  if (found.node.done) {
    found.node.done = false;
    found.node.completedAt = null;
    if (found.job) unrecordCompletion('item', found.node.id);
    else unrecordCompletion('task', found.node.id);
  }
  found.node.completedAt = found.node.done ? (found.node.completedAt || Date.now()) : null;
  if (found.job) found.job.updatedAt = Date.now();
  persistNode(found);
  renderAll();
  return true;
}

function toggleSubtask(found, subId) {
  const sub = found && subtasks(found.node).find(s => s.id === subId);
  if (!sub) return;
  sub.done = !sub.done;
  sub.completedAt = sub.done ? Date.now() : null;

  const list = subtasks(found.node);
  const allDone = list.length > 0 && list.every(s => s.done);
  const wasDone = !!found.node.done;

  if (allDone && !wasDone) {
    found.node.done = true;
    found.node.completedAt = Date.now();
    if (found.job) {
      recordCompletion(found.node, 'item', found.job.id);
      found.job.updatedAt = Date.now();
    } else {
      recordCompletion(found.node, 'task');
    }
  } else if (!allDone && wasDone) {
    found.node.done = false;
    found.node.completedAt = null;
    if (found.job) unrecordCompletion('item', found.node.id);
    else unrecordCompletion('task', found.node.id);
  }

  persistNode(found);
  renderAll();
}

function deleteSubtask(found, subId) {
  if (!found) return;
  const list = subtasks(found.node).filter(s => s.id !== subId);
  found.node.subtasks = list;
  const allDone = list.length > 0 && list.every(s => s.done);
  const wasDone = !!found.node.done;
  if (allDone && !wasDone) {
    found.node.done = true;
    found.node.completedAt = Date.now();
    if (found.job) {
      recordCompletion(found.node, 'item', found.job.id);
      found.job.updatedAt = Date.now();
    } else {
      recordCompletion(found.node, 'task');
    }
  } else if (!allDone && wasDone) {
    found.node.done = false;
    found.node.completedAt = null;
    if (found.job) unrecordCompletion('item', found.node.id);
    else unrecordCompletion('task', found.node.id);
  }
  persistNode(found);
  renderAll();
}

/* ================= history ================= */
const purgeHistory = () => {
  const now = Date.now();
  const before = history.length;
  history = history.filter(h => !h.expiresAt || h.expiresAt > now);
  if (history.length > HISTORY_MAX) history = history.slice(0, HISTORY_MAX);
  if (history.length !== before) persistHistory();
};

function recordCompletion(node, kind, jobId = null) {
  purgeHistory();
  const at = node.completedAt || Date.now();
  const key = `${kind}:${node.id}`;
  history = history.filter(h => h.key !== key);
  history.unshift({
    id: uid(),
    key,
    kind,
    jobId,
    originId: node.id,
    title: node.title,
    subject: node.subject || '',
    priority: node.priority || 'media',
    due: node.due || '',
    notes: node.notes || '',
    subtasks: subtasks(node).map(s => Object.assign({}, s)),
    completedAt: at,
    expiresAt: at + HISTORY_DAYS * DAY
  });
  persistHistory();
}

const unrecordCompletion = (kind, originId) => {
  const before = history.length;
  history = history.filter(h => h.key !== `${kind}:${originId}`);
  if (history.length !== before) persistHistory();
};

const jobTitleOf = entry => {
  if (entry.kind !== 'item') return '';
  const job = jobs.find(j => j.id === entry.jobId);
  return job ? job.title : 'trabalho removido';
};

const relTime = ts => {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  return fmtDateTime(ts);
};

function renderHistory() {
  purgeHistory();
  const q = ui.search.trim().toLowerCase();
  const list = history
    .filter(h => !q || `${h.title} ${h.subject || ''} ${jobTitleOf(h)}`.toLowerCase().includes(q))
    .sort((a, b) => b.completedAt - a.completedAt);

  el('nav-count-history').textContent = history.length;
  el('history-sub').textContent = history.length
    ? `${history.length} item${history.length !== 1 ? 'ns' : ''} · some em ${HISTORY_DAYS} dias`
    : `guardado por ${HISTORY_DAYS} dias no navegador`;

  const box = el('history-list');
  if (!list.length) {
    box.innerHTML = `<li class="empty">${ui.search ? 'Nenhum resultado para "' + escapeHtml(ui.search) + '"' : 'Nada no histórico ainda. Conclua uma tarefa ou um item de trabalho para começar.'}</li>`;
    return;
  }

  const groups = {};
  const today = todayISO();
  list.forEach(h => {
    const d = new Date(h.completedAt);
    const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    let key = ds;
    if (ds === today) key = 'Hoje';
    else {
      const d2 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const t2 = new Date(new Date(today).getFullYear(), new Date(today).getMonth(), new Date(today).getDate());
      const diff = Math.round((t2 - d2) / DAY);
      if (diff === 1) key = 'Ontem';
      else key = d.toLocaleDateString('pt-BR');
    }
    groups[key] = groups[key] || [];
    groups[key].push(h);
  });

  const order = Object.keys(groups).sort((a, b) => {
    if (a === 'Hoje') return -1;
    if (b === 'Hoje') return 1;
    if (a === 'Ontem') return -1;
    if (b === 'Ontem') return 1;
    const pa = a.split('/');
    const pb = b.split('/');
    if (pa.length === 3 && pb.length === 3) {
      return new Date(pb[2], pb[1]-1, pb[0]) - new Date(pa[2], pa[1]-1, pa[0]);
    }
    return 0;
  });

  const out = [];
  order.forEach(key => {
    out.push(`<li class="hist-group"><span class="hist-group-title">${escapeHtml(key)}</span></li>`);
    groups[key].forEach(h => {
      const left = Math.max(0, Math.ceil((h.expiresAt - Date.now()) / DAY));
      const src = h.kind === 'item'
        ? `Trabalho: ${escapeHtml(jobTitleOf(h))}`
        : (h.subject ? escapeHtml(h.subject) : 'Tarefa de estudo');
      out.push(`
    <li class="tgroup" data-scope="history" data-id="${h.id}">
      <div class="task is-done" style="--p:var(--ok)">
        <span class="hist-icon">${HOURS_SVG}</span>
        <div class="task-info">
          <span class="t-title">${escapeHtml(h.title)}</span>
          <div class="t-meta">
            <span class="tag">${src}</span>
            <span class="tag prio-${h.priority}">${PRIOS[h.priority].label}</span>
            ${h.due ? `<span class="tag">prazo ${fmtDate(h.due)}</span>` : ''}
            <span class="tag">concluída ${relTime(h.completedAt)}</span>
            <span class="tag">expira em ${left}d</span>
          </div>
        </div>
        <div class="task-actions">
          <button data-act="restore" title="Restaurar como pendente">${UNDO_SVG}</button>
        </div>
      </div>
    </li>`);
    });
  });

  box.innerHTML = out.join('');
}

function restoreHistoryEntry(entry) {
  if (!entry) return;
  if (entry.kind === 'item') {
    const job = jobs.find(j => j.id === entry.jobId);
    if (!job) {
      toast('O trabalho deste item não existe mais', 'warn');
      return;
    }
    job.items.unshift({
      id: uid(),
      title: entry.title,
      priority: entry.priority || 'media',
      due: entry.due || '',
      done: false,
      notes: entry.notes || '',
      subtasks: (entry.subtasks || []).map(s => Object.assign({}, s, { id: uid() })),
      createdAt: Date.now(),
      completedAt: null
    });
    job.updatedAt = Date.now();
    persistJobs();
  } else {
    tasks.unshift({
      id: uid(),
      title: entry.title,
      subject: entry.subject || '',
      priority: entry.priority || 'media',
      due: entry.due || '',
      done: false,
      notes: entry.notes || '',
      subtasks: (entry.subtasks || []).map(s => Object.assign({}, s, { id: uid() })),
      createdAt: Date.now(),
      completedAt: null
    });
    persistTasks();
  }
  history = history.filter(h => h.id !== entry.id);
  persistHistory();
  renderAll();
  toast(`"${entry.title}" restaurada como pendente`, 'ok');
  setStatus('Item restaurado do histórico');
}

/* ================= jobs ================= */
function normalizeItem(i) {
  if (!i || !i.title) return null;
  return {
    id: i.id || uid(),
    title: i.title,
    priority: PRIOS[i.priority] ? i.priority : 'media',
    due: i.due || '',
    done: !!i.done,
    notes: i.notes || '',
    subtasks: (Array.isArray(i.subtasks) ? i.subtasks : [])
      .filter(s => s && s.title)
      .map(s => ({
        id: s.id || uid(), title: s.title, done: !!s.done,
        createdAt: s.createdAt || Date.now(), completedAt: s.completedAt || null
      })),
    createdAt: i.createdAt || Date.now(),
    completedAt: i.completedAt || null
  };
}

const activeJob = () => jobs.find(j => j.id === ui.activeJobId) || null;

const jobProgress = job => {
  const items = job.items || [];
  const done = items.filter(i => i.done).length;
  return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
};

const dueTagFor = (due, done) => {
  if (!due) return '';
  const d = daysUntil(due);
  if (done) return `<span class="tag">✓ ${fmtDate(due)}</span>`;
  if (d < 0) return `<span class="tag due-late">${fmtDate(due)} · atrasada</span>`;
  if (d === 0) return '<span class="tag due-today">hoje</span>';
  if (d === 1) return '<span class="tag due-today">amanhã</span>';
  if (d <= 7) return `<span class="tag">${fmtDate(due)} · ${d}d</span>`;
  return `<span class="tag">${fmtDate(due)}</span>`;
};

function jobQuery() {
  return (ui.search.trim() || ui.jobSearch.trim()).toLowerCase();
}

function renderJobList() {
  const q = jobQuery();
  const s = ui.jobFilterStatus || 'todos';
  const list = jobs
    .filter(j => {
      if (s !== 'todos' && j.status !== s) return false;
      if (q && !`${j.title} ${j.company || ''}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const pending = jobs.reduce((n, j) => n + j.items.filter(i => !i.done).length, 0);
  el('nav-count-jobs').textContent = pending;

  const box = el('job-list');
  if (!list.length) {
    box.innerHTML = `<li class="empty">${q ? 'Nenhum resultado para "' + escapeHtml(q) + '"' : 'Nenhum trabalho ainda. Crie o primeiro!'}</li>`;
    return;
  }

  box.innerHTML = list.map(j => {
    const p = jobProgress(j);
    const st = JOB_STATUS[j.status] || JOB_STATUS.ativo;
    return `
    <li>
      <button class="job-item ${j.id === ui.activeJobId ? 'is-active' : ''}" data-job-id="${j.id}" data-open-job="${j.id}">
        <span class="job-item-top">
          <strong>${escapeHtml(j.title)}</strong>
          <em class="tag" style="color:${st.color};border-color:${st.color}55">${st.label}</em>
        </span>
        ${j.company ? `<span class="job-co">${escapeHtml(j.company)}</span>` : ''}
        <span class="job-bar"><span class="job-bar-done" style="width:${p.pct}%"></span></span>
        <span class="job-meta-line">
          <span>${p.done}/${p.total} itens</span>
          <span>${j.links.length} destaque${j.links.length !== 1 ? 's' : ''}</span>
        </span>
      </button>
    </li>`;
  }).join('');
}

function renderJobDetail() {
  const job = activeJob();
  el('job-empty').classList.toggle('is-hidden', !!job);
  el('job-body').classList.toggle('is-hidden', !job);
  if (!job) {
    ui.jobNoteLoadedFor = null;
    return;
  }

  const st = JOB_STATUS[job.status] || JOB_STATUS.ativo;
  el('job-detail-title').textContent = job.title;
  el('job-detail-meta').innerHTML = [
    `<span class="tag" style="color:${st.color};border-color:${st.color}55">${st.label}</span>`,
    job.company ? `<span class="tag">${escapeHtml(job.company)}</span>` : '',
    job.due ? dueTagFor(job.due, job.status === 'concluido') : '',
    job.desc ? `<span class="job-desc">${escapeHtml(job.desc)}</span>` : ''
  ].join('');

  const p = jobProgress(job);
  el('job-progress-bar').style.width = p.pct + '%';
  el('job-progress-label').textContent = `${p.done}/${p.total}`;

  renderLinks(job);
  renderJobItems(job);

  if (ui.jobNoteLoadedFor !== job.id) {
    ui.jobNoteLoadedFor = job.id;
    el('job-note-content').value = job.note.content;
    updateJobNoteMeta();
    renderJobPreview();
  }
}

function renderLinks(job) {
  const box = el('link-list');
  if (!job.links.length) {
    box.innerHTML = '<li class="empty">Sem destaques. Adicione o link da empresa, repositório ou documentação.</li>';
    return;
  }
  box.innerHTML = job.links.map(l => `
    <li class="link-card">
      <a class="link-main" href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">
        <strong>${escapeHtml(l.label)}</strong>
        <small>${escapeHtml(hostOf(l.url))}</small>
      </a>
      <button class="link-copy" data-act="link-copy" data-link="${l.id}" title="Copiar URL">${COPY_SVG}</button>
      <button class="link-del" data-act="link-del" data-link="${l.id}" title="Remover destaque">${DEL_SVG}</button>
    </li>`).join('');
}

const hostOf = url => {
  try { return new URL(url).host || url; } catch { return url; }
};

function filteredJobItems(job) {
  const f = ui.jobFilters;
  const q = jobQuery();
  return job.items
    .filter(i => {
      if (f.status === 'pending' && i.done) return false;
      if (f.status === 'done' && !i.done) return false;
      if (f.priority && i.priority !== f.priority) return false;
      if (q && !`${i.title} ${i.notes || ''}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => (a.done - b.done)
      || (PRIOS[a.priority].weight - PRIOS[b.priority].weight)
      || String(a.due || '9999').localeCompare(String(b.due || '9999'))
      || (b.createdAt - a.createdAt));
}

function renderJobItems() {
  const job = activeJob();
  if (!job || !el('item-list')) return;
  const list = filteredJobItems(job);
  const total = job.items.length;
  el('items-heading').textContent = `${list.length} de ${total} item${total !== 1 ? 's' : ''}`;

  const box = el('item-list');
  if (!list.length) {
    box.innerHTML = `<li class="empty">${jobQuery() ? 'Nenhum resultado para "' + escapeHtml(jobQuery()) + '"' : 'Checklist vazio. Adicione a primeira tarefa acima.'}</li>`;
    return;
  }

  box.innerHTML = list.map(i => `
    <li class="tgroup" data-scope="item" data-job="${job.id}" data-id="${i.id}">
      <div class="task ${i.done ? 'is-done' : ''} ${isLateItem(i) ? 'is-late' : ''}" style="--p:${PRIOS[i.priority].color}">
        <button class="check" data-act="toggle" aria-label="Alternar conclusão">${CHECK_SVG}</button>
        <div class="task-info">
          <span class="t-title">${escapeHtml(i.title)}${subCountBadge(i)}</span>
          <div class="t-meta">
            <span class="tag prio-${i.priority}">${PRIOS[i.priority].label}</span>
            ${dueTagFor(i.due, i.done)}
            ${i.notes ? `<span class="t-note">— ${escapeHtml(i.notes)}</span>` : ''}
          </div>
        </div>
        <div class="task-actions">
          <button data-act="edit" title="Editar">${EDIT_SVG}</button>
          <button data-act="del" class="del" title="Excluir">${DEL_SVG}</button>
        </div>
      </div>
      ${subPanel(i, 'item', job.id)}
    </li>`).join('');
}

const isLateItem = i => !i.done && i.due && daysUntil(i.due) < 0;

function toggleItem(job, item) {
  if (!job || !item) return;
  item.done = !item.done;
  item.completedAt = item.done ? Date.now() : null;
  if (item.done) recordCompletion(item, 'item', job.id);
  else unrecordCompletion('item', item.id);
  job.updatedAt = Date.now();
  persistJobs();
  renderAll();
  if (item.done) toast(`"${item.title}" concluída`, 'ok');
}

function deleteItem(job, item) {
  if (!job || !item) return;
  confirmAction('Excluir tarefa', `Remover "${item.title}" do trabalho "${job.title}"?`, () => {
    job.items = job.items.filter(i => i.id !== item.id);
    unrecordCompletion('item', item.id);
    ui.openGroups.delete(groupKey('item', job.id, item.id));
    job.updatedAt = Date.now();
    persistJobs();
    renderAll();
    toast('Tarefa do trabalho excluída', 'warn');
  });
}

function openItemModal(item = null, job = null) {
  ui.editingItemId = item ? item.id : null;
  ui.editingItemJobId = item ? job.id : null;
  el('work-item-modal-title').textContent = item ? 'Editar tarefa' : 'Nova tarefa de trabalho';
  el('wi-title').value = item ? item.title : '';
  el('wi-priority').value = item ? item.priority : 'media';
  el('wi-due').value = item ? (item.due || '') : '';
  el('wi-done').value = item && item.done ? '1' : '0';
  el('wi-notes').value = item ? (item.notes || '') : '';
  openModal('work-item-modal');
  el('wi-title').focus();
}

function saveItemFromForm() {
  const title = el('wi-title').value.trim();
  if (!title) return;
  const job = jobs.find(j => j.id === ui.editingItemJobId) || activeJob();
  if (!job) { toast('Abra um trabalho primeiro', 'warn'); return; }

  const data = {
    title,
    priority: el('wi-priority').value,
    due: el('wi-due').value || '',
    done: el('wi-done').value === '1',
    notes: el('wi-notes').value.trim()
  };

  if (ui.editingItemId) {
    const item = job.items.find(i => i.id === ui.editingItemId);
    if (!item) return;
    Object.assign(item, data);
    item.completedAt = data.done ? (item.completedAt || Date.now()) : null;
    if (data.done) recordCompletion(item, 'item', job.id);
    else unrecordCompletion('item', item.id);
    toast('Tarefa atualizada', 'ok');
  } else {
    job.items.unshift(normalizeItem(Object.assign({ createdAt: Date.now() }, data)));
    toast('Tarefa adicionada ao trabalho', 'ok');
  }

  job.updatedAt = Date.now();
  persistJobs();
  closeModals();
  renderAll();
  setStatus('Tarefa do trabalho salva');
}

function openJobModal(job = null) {
  ui.editingJobId = job ? job.id : null;
  el('job-modal-title').textContent = job ? 'Editar trabalho' : 'Novo trabalho';
  el('j-title').value = job ? job.title : '';
  el('j-company').value = job ? (job.company || '') : '';
  el('j-status').value = job ? job.status : 'ativo';
  el('j-due').value = job ? (job.due || '') : shiftISO(7);
  el('j-desc').value = job ? (job.desc || '') : '';
  openModal('job-modal');
  el('j-title').focus();
}

function saveJobFromForm() {
  const title = el('j-title').value.trim();
  if (!title) return;
  const data = {
    title,
    company: el('j-company').value.trim(),
    status: el('j-status').value,
    due: el('j-due').value || '',
    desc: el('j-desc').value.trim()
  };

  if (ui.editingJobId) {
    const job = jobs.find(j => j.id === ui.editingJobId);
    if (!job) return;
    Object.assign(job, data, { updatedAt: Date.now() });
    toast('Trabalho atualizado', 'ok');
  } else {
    const job = Object.assign({
      id: uid(),
      items: [],
      links: [],
      note: { content: '', updatedAt: Date.now() },
      createdAt: Date.now(),
      updatedAt: Date.now()
    }, data);
    jobs.unshift(job);
    ui.activeJobId = job.id;
    toast('Trabalho criado', 'ok');
  }

  persistJobs();
  closeModals();
  renderAll();
  setStatus('Trabalho salvo');
}

function deleteJob(job) {
  if (!job) return;
  const p = jobProgress(job);
  confirmAction('Excluir trabalho', `"${job.title}" e suas ${p.total} tarefa(s), notas e destaques serão removidos. O histórico de 7 dias também some.`, () => {
    jobs = jobs.filter(j => j.id !== job.id);
    history = history.filter(h => h.jobId !== job.id);
    if (ui.activeJobId === job.id) {
      ui.activeJobId = jobs[0]?.id || null;
      ui.jobNoteLoadedFor = null;
    }
    persistJobs();
    persistHistory();
    renderAll();
    toast('Trabalho excluído', 'warn');
  });
}

const normalizeUrl = raw => {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return '';
  return `https://${v}`;
};

function addLink(job) {
  const url = normalizeUrl(el('link-url').value);
  const label = el('link-label').value.trim();
  if (!job) return;
  if (!url) { toast('Informe uma URL válida (ex.: empresa.com.br)', 'warn'); el('link-url').focus(); return; }
  job.links.unshift({ id: uid(), label: label || url, url });
  job.updatedAt = Date.now();
  el('link-label').value = '';
  el('link-url').value = '';
  persistJobs();
  renderAll();
  toast('Destaque adicionado', 'ok');
  setStatus('Destaque adicionado ao trabalho');
}

function copyText(text) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('URL copiada', 'ok'); }
    catch { toast('Não consegui copiar a URL', 'warn'); }
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => toast('URL copiada', 'ok'))
      .catch(fallback);
  } else fallback();
}

function updateJobNoteMeta() {
  const v = el('job-note-content').value;
  const words = v.trim() ? v.trim().split(/\s+/).length : 0;
  el('job-note-meta').textContent = `${words} palavra${words !== 1 ? 's' : ''} • ${v.length} caracteres`;
}

function renderJobPreview() {
  const box = el('job-note-preview');
  if (!box) return;
  const html = mdToHtml(el('job-note-content').value);
  box.innerHTML = html || '<p class="md-empty">Nada para visualizar ainda — comece a escrever em Markdown.</p>';
}

function saveJobNote() {
  const job = activeJob();
  if (!job) return;
  job.note.content = el('job-note-content').value;
  job.note.updatedAt = Date.now();
  job.updatedAt = Date.now();
  persistJobs();
}

function downloadJobNoteAsMd() {
  const job = activeJob();
  if (!job) { toast('Abra um trabalho antes de exportar', 'warn'); return; }
  const front = [`# ${job.title}`];
  if (job.company) front.push(`_${job.company}_`);
  front.push(`_atualizado em ${fmtDateTime(job.note.updatedAt)} · StudyTrack_`, '');
  const body = `${front.join('\n')}\n${job.note.content.trim()}\n`;
  const name = job.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trabalho';
  const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.md`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`"${name}.md" baixado`, 'ok');
  setStatus('Notas do trabalho exportadas como Markdown');
}

/* ================= dashboard ================= */
function renderStats() {
  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  const pending = total - done;
  const today = tasks.filter(t => !t.done && t.due === todayISO()).length;
  const late = tasks.filter(isLate).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const stats = [
    { lbl: 'Total de tarefas', val: total, sub: `${pending} pendente${pending !== 1 ? 's' : ''}`, c: 'var(--text)' },
    { lbl: 'Concluídas', val: done, sub: `${pct}% do total`, c: 'var(--ok)' },
    { lbl: 'Para hoje', val: today, sub: today ? 'não deixe pra depois' : 'nada marcado', c: 'var(--info)' },
    { lbl: 'Atrasadas', val: late, sub: late ? 'reagende agora' : 'tudo em dia', c: late ? 'var(--warn)' : 'var(--muted)' },
    { lbl: 'Trabalhos', val: jobs.length, sub: `${jobs.reduce((n, j) => n + j.items.filter(i => !i.done).length, 0)} itens no checklist`, c: 'var(--info)' },
    { lbl: 'Notas', val: notes.length, sub: `${notes.filter(n => n.pinned).length} fixadas`, c: 'var(--accent)' }
  ];

  el('stat-grid').innerHTML = stats.map(s => `
    <div class="stat" style="--c:${s.c}">
      <span class="lbl">${s.lbl}</span>
      <div class="val">${s.val}</div>
      <span class="sub">${s.sub}</span>
    </div>`).join('');

  el('progress-ring').style.setProperty('--p', pct);
  el('progress-value').textContent = pct + '%';
  el('progress-chip').textContent = `${done}/${total}`;

  const legend = [
    { lbl: 'Concluídas', n: done, c: 'var(--ok)' },
    { lbl: 'Pendentes', n: pending, c: 'var(--accent)' },
    { lbl: 'Atrasadas', n: late, c: 'var(--warn)' }
  ];
  el('progress-legend').innerHTML = legend.map(l => `
    <li><span class="sw" style="background:${l.c}"></span>${l.lbl}<span class="v">${l.n}</span></li>`).join('');
}

function renderSubjectBars() {
  const map = {};
  tasks.forEach(t => {
    const s = t.subject || 'Sem matéria';
    map[s] = map[s] || { done: 0, todo: 0 };
    t.done ? map[s].done++ : map[s].todo++;
  });
  const rows = Object.entries(map).sort((a, b) => (b[1].done + b[1].todo) - (a[1].done + a[1].todo)).slice(0, 8);
  const box = el('subject-bars');

  if (!rows.length) {
    box.innerHTML = '<div class="empty">Crie tarefas com matérias para ver o gráfico.</div>';
    return;
  }
  const max = Math.max(...rows.map(([, v]) => v.done + v.todo)) || 1;

  box.innerHTML = rows.map(([s, v]) => {
    const total = v.done + v.todo;
    const wTotal = (total / max) * 100;
    return `
      <div class="bar-row" title="${escapeHtml(s)}: ${v.done} concluídas, ${v.todo} pendentes">
        <span class="nm">${escapeHtml(s)}</span>
        <span class="bar-track" style="width:100%">
          <span class="bar-done" style="width:${wTotal * (v.done / total)}%"></span>
          <span class="bar-todo" style="width:${wTotal * (v.todo / total)}%"></span>
        </span>
        <span class="n">${v.done}/${total}</span>
      </div>`;
  }).join('');
}

function renderUpcoming() {
  const list = tasks
    .filter(t => !t.done && t.due)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 7);
  const box = el('upcoming-list');

  if (!list.length) {
    box.innerHTML = '<li class="empty">Nenhum prazo definido.</li>';
    return;
  }
  box.innerHTML = list.map(t => {
    const d = daysUntil(t.due);
    const cls = d < 0 ? 'tag due-late' : d <= 1 ? 'tag due-today' : 'tag';
    return `
      <li data-open-task="${t.id}" style="cursor:pointer">
        <span class="t">${escapeHtml(t.title)}</span>
        <span class="r ${cls}">${d < 0 ? Math.abs(d) + 'd atrás' : d === 0 ? 'hoje' : d === 1 ? 'amanhã' : fmtDate(t.due)}</span>
      </li>`;
  }).join('');
}

function renderRecentNotes() {
  const list = [...notes].sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt)).slice(0, 6);
  const box = el('recent-notes');

  if (!list.length) {
    box.innerHTML = '<li class="empty">Nenhuma nota ainda.</li>';
    return;
  }
  box.innerHTML = list.map(n => `
    <li data-open-note="${n.id}" style="cursor:pointer">
      <span class="t">${n.pinned ? '📌 ' : ''}${escapeHtml(n.title || 'Sem título')}</span>
      <span class="r tag">${escapeHtml((n.tags[0] || 'geral'))}</span>
    </li>`).join('');
}

function renderActiveJobs() {
  const list = jobs
    .filter(j => j.status !== 'concluido')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);
  const box = el('active-jobs-list');
  if (!box) return;
  if (!list.length) {
    box.innerHTML = '<li class="empty">Nenhum trabalho ativo.</li>';
    return;
  }
  box.innerHTML = list.map(j => {
    const p = jobProgress(j);
    const st = JOB_STATUS[j.status] || JOB_STATUS.ativo;
    return `
      <li data-open-job="${j.id}" style="cursor:pointer">
        <span class="t">${escapeHtml(j.title)}</span>
        <span class="r tag" style="color:${st.color};border-color:${st.color}55">${st.label} · ${p.done}/${p.total}</span>
      </li>`;
  }).join('');
}

function renderRecentLinks() {
  const all = [];
  jobs.forEach(j => (j.links || []).forEach(l => all.push({ ...l, jobId: j.id, createdAt: j.updatedAt })));
  const list = all.slice(0, 6);
  const box = el('recent-links-list');
  if (!box) return;
  if (!list.length) {
    box.innerHTML = '<li class="empty">Nenhum destaque ainda.</li>';
    return;
  }
  box.innerHTML = list.map(l => {
    const job = jobs.find(j => j.id === l.jobId);
    return `
      <li>
        <a class="t" href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>
        <span class="r tag">${job ? escapeHtml(job.title) : 'trabalho'}</span>
      </li>`;
  }).join('');
}

/* ================= notes ================= */
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/* ================= markdown ================= */
const safeUrl = u => /^(https?:\/\/|mailto:|#|\/|\.{1,2}\/)/i.test(String(u).trim()) ? String(u).trim() : '#';

const mdInline = raw => escapeHtml(raw)
  .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) =>
    `<img src="${safeUrl(url)}" alt="${alt}" loading="lazy">`)
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) =>
    `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${txt}</a>`)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  .replace(/(^|[^_\w])__([^_\n]+)__/g, '$1<strong>$2</strong>')
  .replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>')
  .replace(/~~([^~]+)~~/g, '<del>$1</del>')
  .replace(/==([^=\n]+)==/g, '<mark>$1</mark>');

function mdToHtml(md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null;
  let quote = false;
  let i = 0;

  const closePara = () => {
    if (para.length) {
      out.push(`<p>${mdInline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (list) { out.push(`</${list}>`); list = null; }
  };
  const closeQuote = () => {
    if (quote) { out.push('</blockquote>'); quote = false; }
  };
  const closeBlocks = () => { closePara(); closeList(); closeQuote(); };

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^```+\s*([\w+#.-]*)\s*$/);
    if (fence) {
      closeBlocks();
      const lang = fence[1] || '';
      const buf = [];
      i++;
      while (i < lines.length && !/^```+\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre data-lang="${escapeHtml(lang)}"><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeBlocks();
      const level = Math.min(heading[1].length + 1, 6);
      out.push(`<h${level}>${mdInline(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    if (/^([-*_])\s*(\1\s*){2,}$/.test(line)) {
      closeBlocks();
      out.push('<hr>');
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      closePara();
      closeList();
      const inner = [];
      if (!quote) { out.push('<blockquote>'); quote = true; }
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        inner.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(mdToHtml(inner.join('\n')));
      continue;
    }

    const task = line.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      closePara();
      closeQuote();
      if (list !== 'ul') { closeList(); out.push('<ul class="md-tasks">'); list = 'ul'; }
      out.push(`<li><input type="checkbox" disabled${task[1].toLowerCase() === 'x' ? ' checked' : ''}><span>${mdInline(task[2])}</span></li>`);
      i++;
      continue;
    }

    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      closePara();
      closeQuote();
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${mdInline(ul[1])}</li>`);
      i++;
      continue;
    }

    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ol) {
      closePara();
      closeQuote();
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${mdInline(ol[1])}</li>`);
      i++;
      continue;
    }

    if (!line.trim()) {
      closeBlocks();
      i++;
      continue;
    }

    para.push(line.trim());
    i++;
  }

  closeBlocks();
  return out.join('');
}

function renderNoteList() {
  const q = ui.search.trim().toLowerCase();
  const list = [...notes]
    .filter(n => !q || `${n.title} ${n.content} ${n.tags.join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));

  const box = el('note-list');
  if (!list.length) {
    box.innerHTML = '<li class="empty">Nenhuma nota. Crie uma!</li>';
    return;
  }
  box.innerHTML = list.map(n => {
    const metaParts = [];
    const area = (n.area || '').trim();
    const subarea = (n.subarea || '').trim();
    if (area) metaParts.push(escapeHtml(area));
    if (subarea) metaParts.push(escapeHtml(subarea));
    const tags = (n.tags || []).slice(0, 2).map(escapeHtml).join(' • ');
    if (tags) metaParts.push(tags);
    const meta = metaParts.join(' • ') || 'Sem tags';
    return `
    <button class="note-item ${n.id === ui.activeNoteId ? 'is-active' : ''}" data-note-id="${n.id}">
      <strong>${n.pinned ? '📌 ' : ''}${escapeHtml(n.title || 'Sem título')}</strong>
      <span class="n-meta">${meta}</span>
      <span class="n-date">${fmtDate(n.updatedAt)}</span>
    </button>`;
  }).join('');
}

function renderEditor() {
  let n = notes.find(x => x.id === ui.activeNoteId);
  if (!n && notes.length) {
    ui.activeNoteId = notes[0].id;
    n = notes[0];
  }
  const has = !!n;
  ['note-title', 'note-tags', 'note-content', 'note-area', 'note-subarea'].forEach(id => {
    const e = el(id);
    if (e) {
      e.disabled = !has;
      e.style.opacity = has ? '' : '.5';
    }
  });
  const toolbarNote = el('note-editor')?.querySelector('.editor-toolbar');
  if (toolbarNote) toolbarNote.style.opacity = has ? '' : '.5';

  if (!n) {
    if (el('note-title')) el('note-title').value = '';
    if (el('note-tags')) el('note-tags').value = '';
    if (el('note-area')) el('note-area').value = '';
    if (el('note-subarea')) el('note-subarea').value = '';
    if (el('note-content')) el('note-content').value = '';
    if (el('note-meta')) el('note-meta').textContent = '0 palavras • 0 caracteres';
    renderPreview();
    return;
  }
  if (el('note-title')) el('note-title').value = n.title || '';
  if (el('note-tags')) el('note-tags').value = (n.tags || []).join(', ');
  if (el('note-area')) el('note-area').value = n.area || '';
  if (el('note-subarea')) el('note-subarea').value = n.subarea || '';
  if (el('note-content')) el('note-content').value = n.content || '';
  updateNoteMeta();
  renderPreview();
}

function updateNoteMeta() {
  const v = el('note-content').value;
  const words = v.trim() ? v.trim().split(/\s+/).length : 0;
  el('note-meta').textContent = `${words} palavra${words !== 1 ? 's' : ''} • ${v.length} caracteres`;
}

function renderPreview() {
  const box = el('note-preview');
  if (!box) return;
  const html = mdToHtml(el('note-content').value);
  box.innerHTML = html || '<p class="md-empty">Nada para visualizar ainda — comece a escrever em Markdown.</p>';
}

function setNotesMode(mode) {
  prefs.notesMode = ['edit', 'split', 'preview'].includes(mode) ? mode : 'split';
  $$('.editor-body').forEach(b => { b.dataset.mode = prefs.notesMode; });
  $$('.mode-btn').forEach(b => b.classList.toggle('is-active', b.dataset.mode === prefs.notesMode));
  save(K.prefs, prefs);
}

function downloadNoteAsMd() {
  const n = notes.find(x => x.id === ui.activeNoteId);
  if (!n) { toast('Abra uma nota antes de exportar', 'warn'); return; }
  const title = n.title.trim() || 'nota';
  const front = [`# ${title}`];
  if (n.tags.length) front.push(`_${n.tags.join(' · ')}_`);
  front.push(`_atualizado em ${fmtDateTime(n.updatedAt)} · StudyTrack_`, '');
  const body = `${front.join('\n')}\n${n.content.trim()}\n`;
  const slug = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nota';
  const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.md`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`"${slug}.md" baixado`, 'ok');
  setStatus('Nota exportada como Markdown');
}

function createNote() {
  const n = {
    id: uid(),
    title: 'Nova nota',
    content: '',
    tags: [],
    pinned: false,
    area: '',
    subarea: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  notes.unshift(n);
  ui.activeNoteId = n.id;
  persistNotes();
  renderAll();
  setStatus('Nota criada');
  el('note-title').focus();
  el('note-title').select();
  toast('Nota criada', 'ok');
}

function updateNote(patch) {
  const n = notes.find(x => x.id === ui.activeNoteId);
  if (!n) return;
  Object.assign(n, patch, { updatedAt: Date.now() });
  persistNotes();
  renderNoteList();
  renderRecentNotes();
  renderStats();
  el('nav-count-notes').textContent = notes.length;
}

/* ================= views ================= */
const VIEW_META = {
  dashboard: ['Dashboard', 'Visão geral do seu estudo'],
  tasks: ['Tarefas', 'Organize seus estudos por matéria e prioridade'],
  jobs: ['Trabalhos', 'Checklist, notas e destaques de cada trabalho'],
  notes: ['Notas', 'Resumos, snippets e referências de estudo'],
  history: ['Histórico', 'Concluídos dos últimos 7 dias'],
  themes: ['Temas', 'Personalize a aparência do StudyTrack']
};

function setView(view) {
  if (!VIEW_META[view]) return;
  ui.view = view;
  $$('.view').forEach(v => v.classList.toggle('is-hidden', v.id !== `view-${view}`));
  $$('.nav-item').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
  el('view-title').textContent = VIEW_META[view][0];
  el('view-sub').textContent = VIEW_META[view][1];
  el('sidebar').classList.remove('is-open');
  renderAll();
  setStatus(VIEW_META[view][0]);
}

function renderAll() {
  el('nav-count-tasks').textContent = tasks.filter(t => !t.done).length;
  el('nav-count-notes').textContent = notes.length;
  renderSidebarSubjects();
  renderStats();
  renderSubjectBars();
  renderUpcoming();
  renderRecentNotes();
  renderActiveJobs();
  renderRecentLinks();
  renderTaskList();
  renderJobList();
  renderJobDetail();
  renderNoteList();
  renderEditor();
  renderHistory();
  el('filter-priority').value = ui.filters.priority;
  el('filter-status').value = ui.filters.status;
  el('filter-overdue').checked = ui.filters.overdue;
  el('task-sort').value = ui.filters.sort;
  el('item-filter-priority').value = ui.jobFilters.priority;
  el('item-filter-status').value = ui.jobFilters.status;
  if (el('job-filter-status')) el('job-filter-status').value = ui.jobFilterStatus;
}

/* ================= task modal ================= */
function openTaskModal(task = null) {
  ui.editingTaskId = task ? task.id : null;
  el('task-modal-title').textContent = task ? 'Editar tarefa' : 'Nova tarefa';
  el('f-title').value = task ? task.title : '';
  el('f-subject').value = task ? (task.subject || '') : (ui.filters.subject || '');
  el('f-priority').value = task ? task.priority : 'media';
  el('f-due').value = task ? (task.due || '') : shiftISO(1);
  el('f-done').value = task && task.done ? '1' : '0';
  el('f-notes').value = task ? (task.notes || '') : '';
  openModal('task-modal');
  el('f-title').focus();
}

function saveTaskFromForm() {
  const title = el('f-title').value.trim();
  if (!title) return;
  const data = {
    title,
    subject: el('f-subject').value.trim(),
    priority: el('f-priority').value,
    due: el('f-due').value || '',
    done: el('f-done').value === '1',
    notes: el('f-notes').value.trim()
  };

  if (ui.editingTaskId) {
    const t = tasks.find(x => x.id === ui.editingTaskId);
    Object.assign(t, data);
    if (data.done) t.completedAt = t.completedAt || Date.now();
    if (!data.done) t.completedAt = null;
    if (data.done) recordCompletion(t, 'task');
    else unrecordCompletion('task', t.id);
    toast('Tarefa atualizada', 'ok');
  } else {
    const created = {
      id: uid(), ...data,
      subtasks: [],
      createdAt: Date.now(),
      completedAt: data.done ? Date.now() : null
    };
    tasks.unshift(created);
    if (data.done) recordCompletion(created, 'task');
    toast('Tarefa criada', 'ok');
  }
  persistTasks();
  closeModals();
  renderAll();
  setStatus('Tarefa salva');
}

/* ================= actions ================= */
function toggleTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  t.completedAt = t.done ? Date.now() : null;
  if (t.done) recordCompletion(t, 'task');
  else unrecordCompletion('task', t.id);
  persistTasks();
  renderAll();
  if (t.done) toast(`"${t.title}" concluída`, 'ok');
}

function deleteTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  confirmAction('Excluir tarefa', `Remover "${t.title}" permanentemente?`, () => {
    tasks = tasks.filter(x => x.id !== id);
    persistTasks();
    renderAll();
    toast('Tarefa excluída', 'warn');
  });
}

function seedData() {
  const base = Date.now();
  const t = (title, subject, priority, due, done, notes, offset) => ({
    id: uid() + offset, title, subject, priority, due, done, notes,
    createdAt: base - offset * 1000, completedAt: done ? base - offset * 500 : null
  });
  tasks = [
    t('Revisar closures e escopo léxico', 'JavaScript', 'alta', shiftISO(0), false, 'MDN guide cap. 4', 1),
    t('Resolver 10 exercícios de array methods', 'JavaScript', 'alta', shiftISO(1), false, '', 2),
    t('Projeto: mini gerenciador de tarefas', 'JavaScript', 'media', shiftISO(5), false, 'usar localStorage', 3),
    t('Flexbox vs Grid — quando usar cada', 'HTML & CSS', 'media', shiftISO(-1), false, '', 4),
    t('Resetar estilos com :has()', 'HTML & CSS', 'baixa', '', false, '', 5),
    t('Listar comprehension e generators', 'Python', 'alta', shiftISO(2), false, '', 6),
    t('Classes, herança e polimorfismo', 'Java', 'media', shiftISO(4), false, '', 7),
    t('Normalização 3FN e índices', 'Banco de Dados', 'alta', shiftISO(3), false, '', 8),
    t('Branching no Git e rebase interativo', 'Git', 'media', shiftISO(0), false, '', 9),
    t('ler documentação', 'English', 'baixa', '', true, '', 10),
    t('Exercícios de ordenação e busca binária', 'Algoritmos', 'media', shiftISO(-3), false, '', 11)
  ];
  tasks[2].subtasks = [
    { id: uid() + 's1', title: 'modelo de dados', done: true, createdAt: base, completedAt: base },
    { id: uid() + 's2', title: 'tela de listagem', done: false, createdAt: base, completedAt: null },
    { id: uid() + 's3', title: 'persistir em localStorage', done: false, createdAt: base, completedAt: null }
  ];
  notes = [
    {
      id: uid() + 'n1', title: 'JavaScript — Array methods',
      tags: ['JavaScript', 'referência'],
      pinned: true,
      area: 'Programação',
      subarea: 'JavaScript',
      createdAt: base, updatedAt: base,
      content: `# Array methods\n\n\`\`\`js\nconst nums = [1, 2, 3, 4, 5];\n\nnums.map(n => n * 2);      // [2,4,6,8,10]\nnums.filter(n => n > 3);   // [4,5]\nnums.reduce((a, b) => a + b, 0); // 15\nnums.flatMap(n => [n, n]);  // achatar\n\`\`\`\n\n- **map** → novo array do mesmo tamanho\n- **filter** → novo array menor\n- **reduce** → um único valor\n- **splice** → muta o array original`
    },
    {
      id: uid() + 'n2', title: 'Git — comandos do dia a dia',
      tags: ['Git'],
      pinned: false,
      area: 'Ferramentas',
      subarea: 'Git',
      createdAt: base - 1e6, updatedAt: base - 5e5,
      content: `# Comandos úteis\n\n1. \`git switch -c nova-branch\`\n2. \`git add -p\` — stage por bloco\n3. \`git log --oneline --graph\`\n4. \`git restore --staged <file>\`\n5. \`git rebase -i HEAD~3\` para reescrever commits locais\n\n**Dica:** sempre \`git status\` antes de commitar.`
    },
    {
      id: uid() + 'n3', title: 'Python — erros comuns',
      tags: ['Python'],
      pinned: false,
      area: 'Programação',
      subarea: 'Python',
      createdAt: base - 2e6, updatedAt: base - 2e6,
      content: `Erros que mais caem em prova:\n\n- Mutável vs imutável: listas e dicts podem mudar in-place\n- Late binding em closures dentro de loops\n- \`is\` vs \`==\` para comparar strings vazias\n- Escopo de comprehension em Python 3`
    }
  ];
  subjects = SUBJECTS_DEFAULT.slice();
  prefs.subjectColors = {};
  subjects.forEach((s, i) => { prefs.subjectColors[s] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });

  const item = (title, priority, due, done, notes, subs, offset) => normalizeItem({
    id: uid() + 'i' + offset, title, priority, due, done, notes,
    subtasks: (subs || []).map((s, n) => ({
      id: uid() + 's' + offset + n, title: s[0], done: !!s[1],
      createdAt: base - offset * 1000, completedAt: s[1] ? base - offset * 500 : null
    })),
    createdAt: base - offset * 1000,
    completedAt: done ? base - offset * 500 : null
  });

  jobs = [
    {
      id: uid() + 'j1',
      title: 'Sistema de estoque interno',
      company: 'Acme Ltda',
      status: 'ativo',
      due: shiftISO(14),
      desc: 'Projeto contratado pela Acme: controle de entradas, saídas e relatório mensal.',
      items: [
        item('Modelar sistema', 'alta', shiftISO(3), false, 'revisar com o cliente', [
          ['segurança', true], ['stack', true], ['hospedagem', false]
        ], 1),
        item('Definir stack', 'alta', shiftISO(1), false, 'Node + Postgres + Docker', [], 2),
        item('Diagramar banco de dados', 'media', shiftISO(5), false, '', [], 3),
        item('Protótipo do relatório mensal', 'baixa', shiftISO(9), false, 'PDF com gráfico de giro', [], 4),
        item('Enviar proposta comercial', 'media', '', true, 'R$ 12.500', [], 5)
      ],
      links: [
        { id: uid() + 'l1', label: 'Site da Acme', url: 'https://example.com/acme' },
        { id: uid() + 'l2', label: 'Repositório do projeto', url: 'https://github.com/exemplo/stock' },
        { id: uid() + 'l3', label: 'Documentação do contrato', url: 'https://example.com/contrato.pdf' }
      ],
      note: {
        content: `# Escopo\n\n- Controle de **entradas e saídas**\n- Relatório mensal em PDF\n- Integração com o sistema fiscal antigo\n\n## Stack decidida\n\n\`\`\`js\nNode 20 + Express\nPostgreSQL 16\nDocker Compose\n\`\`\`\n\n> Prazo apertado: 14 dias. Priorizar o CRUD antes do relatório.`,
        updatedAt: base - 3600000
      },
      createdAt: base - 8e6,
      updatedAt: base - 3600000
    },
    {
      id: uid() + 'j2',
      title: 'Site institucional',
      company: 'Studio Aurora',
      status: 'ativo',
      due: shiftISO(21),
      desc: 'Landing page + portfólio, deploy na Vercel.',
      items: [
        item('Escolher tipografia', 'baixa', '', true, '', [], 1),
        item('Montar hero section', 'media', shiftISO(4), false, '', [], 2),
        item('Configurar domínio', 'media', shiftISO(7), false, 'aurora.studio', [], 3)
      ],
      links: [{ id: uid() + 'l4', label: 'Referência visual', url: 'https://example.com/inspiracao' }],
      note: {
        content: `# Brief\n\nCliente pediu algo **limpo** e rápido. Sem framework SPA se o JS não for necessário.`,
        updatedAt: base - 5e6
      },
      createdAt: base - 6e6,
      updatedAt: base - 5e6
    }
  ];
  ui.activeJobId = jobs[0].id;

  history = [
    {
      id: uid() + 'h1', key: 'task:' + tasks[9].id, kind: 'task', jobId: null, originId: tasks[9].id,
      title: tasks[9].title, subject: tasks[9].subject, priority: tasks[9].priority,
      due: tasks[9].due, notes: tasks[9].notes, subtasks: [],
      completedAt: base - 86400000, expiresAt: base - 86400000 + 7 * DAY
    },
    {
      id: uid() + 'h2', key: 'item:' + jobs[0].items[4].id, kind: 'item', jobId: jobs[0].id,
      originId: jobs[0].items[4].id, title: jobs[0].items[4].title, subject: '',
      priority: jobs[0].items[4].priority, due: jobs[0].items[4].due,
      notes: jobs[0].items[4].notes, subtasks: jobs[0].items[4].subtasks,
      completedAt: base - 3 * 86400000, expiresAt: base - 3 * 86400000 + 7 * DAY
    }
  ];

  ui.activeNoteId = notes[0].id;
  ui.filters.subject = '';
  ui.jobNoteLoadedFor = null;
  ui.openGroups = new Set([groupKey('task', '', tasks[2].id)]);
  persistAll();
  renderAll();
  renderSubjectManager();
  closeModals();
  toast('Dados de exemplo carregados', 'ok');
}

function exportData() {
  const blob = new Blob([JSON.stringify({ version: 2, tasks, notes, prefs, subjects, jobs, history }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `studytrack-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Arquivo exportado', 'ok');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data.tasks)) {
        tasks = data.tasks.map(t => Object.assign({ subtasks: [] }, t));
        tasks.forEach(t => { if (!Array.isArray(t.subtasks)) t.subtasks = []; });
      }
      if (Array.isArray(data.notes)) {
        notes = data.notes.map(n => ({
          ...n,
          area: n.area || '',
          subarea: n.subarea || ''
        }));
      }
      if (data.prefs) prefs = Object.assign({}, defaultPrefs, data.prefs);
      if (Array.isArray(data.subjects) && data.subjects.length) {
        subjects = Array.from(new Set(data.subjects.map(s => String(s).trim()).filter(Boolean)));
      } else {
        subjects = migrateSubjects();
      }
      if (Array.isArray(data.jobs)) {
        jobs = data.jobs.map(j => ({
          id: j.id || uid(),
          title: j.title || 'Trabalho',
          company: j.company || '',
          status: JOB_STATUS[j.status] ? j.status : 'ativo',
          due: j.due || '',
          desc: j.desc || '',
          items: (Array.isArray(j.items) ? j.items : []).map(normalizeItem).filter(Boolean),
          links: (Array.isArray(j.links) ? j.links : []).map(l => ({
            id: l.id || uid(),
            label: l.label || l.url || 'link',
            url: l.url || ''
          })).filter(l => l.url),
          note: { content: (j.note && j.note.content) || '', updatedAt: (j.note && j.note.updatedAt) || Date.now() },
          createdAt: j.createdAt || Date.now(),
          updatedAt: j.updatedAt || Date.now()
        }));
      }
      if (Array.isArray(data.history)) {
        history = data.history.filter(h => h && h.id && h.title);
      }
      purgeHistory();
      ui.filters.subject = '';
      ui.activeNoteId = notes[0]?.id || null;
      ui.activeJobId = jobs[0]?.id || null;
      ui.jobNoteLoadedFor = null;
      ui.openGroups = new Set();
      persistAll();
      applyPrefs();
      renderAll();
      toast('Dados importados', 'ok');
    } catch {
      toast('Arquivo inválido', 'warn');
    }
  };
  reader.readAsText(file);
}

function resetAll() {
  confirmAction('Apagar tudo', 'Tarefas, trabalhos, notas, histórico e preferências serão removidos. Continuar?', () => {
    tasks = [];
    notes = [];
    jobs = [];
    history = [];
    prefs = Object.assign({}, defaultPrefs);
    subjects = SUBJECTS_DEFAULT.slice();
    ui.activeNoteId = null;
    ui.activeJobId = null;
    ui.jobNoteLoadedFor = null;
    ui.openGroups = new Set();
    ui.filters.subject = '';
    wallpaper = null;
    try { localStorage.removeItem(K.wallpaper); } catch {}
    persistAll();
    applyPrefs();
    applyWallpaper();
    renderAll();
    renderSubjectManager();
    toast('Dados apagados', 'warn');
  });
}

/* ================= events ================= */
function bindEvents() {
  $$('.nav-item').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $$('[data-view-link]').forEach(b => b.addEventListener('click', () => setView(b.dataset.viewLink)));

  el('btn-menu').addEventListener('click', () => el('sidebar').classList.toggle('is-open'));
  el('backdrop').addEventListener('click', closeModals);
  $$('[data-close]').forEach(b => b.addEventListener('click', closeModals));

  document.addEventListener('click', e => {
    const act = e.target.closest('[data-action]');
    if (act) {
      const a = act.dataset.action;
      if (a === 'new-task') openTaskModal();
      if (a === 'new-note') createNote();
      if (a === 'open-subjects') openSubjectModal();
      if (a === 'clear-filters') {
        ui.filters = { subject: '', priority: '', status: 'pending', overdue: false, sort: ui.filters.sort };
        el('filter-subject').value = '';
        renderAll();
        setStatus('Filtros limpos');
      }
      if (a === 'export') exportData();
      if (a === 'import') el('import-file').click();
      if (a === 'seed') seedData();
      if (a === 'reset') resetAll();
      if (a === 'reset-accent') {
        prefs.accent = THEME_ACCENT[prefs.theme] || THEME_ACCENT.zabbix;
        prefs.accentCustom = false;
        applyPrefs();
        persistAll();
        renderAll();
        toast('Cor de destaque restaurada', 'ok');
      }
      if (a === 'note-download') downloadNoteAsMd();
      if (a === 'note-delete') {
        const n = notes.find(x => x.id === ui.activeNoteId);
        if (!n) return;
        confirmAction('Excluir nota', `Remover "${n.title || 'Sem título'}"?`, () => {
          notes = notes.filter(x => x.id !== n.id);
          ui.activeNoteId = notes[0]?.id || null;
          persistNotes();
          renderAll();
          toast('Nota excluída', 'warn');
        });
      }
      if (a === 'new-job') openJobModal();
      if (a === 'edit-job') openJobModal(activeJob());
      if (a === 'delete-job') deleteJob(activeJob());
      if (a === 'job-note-download') downloadJobNoteAsMd();
      if (a === 'clear-history') {
        if (!history.length) { toast('Histórico vazio', 'info'); return; }
        confirmAction('Limpar histórico', `Remover ${history.length} registro(s) de até ${HISTORY_DAYS} dias?`, () => {
          history = [];
          persistHistory();
          renderAll();
          toast('Histórico limpo', 'warn');
        });
      }
      if (a === 'wall-pick') el('wall-file').click();
      if (a === 'wall-remove') removeWallpaper();
    }

    const themeCard = e.target.closest('[data-theme-id]');
    if (themeCard) setTheme(themeCard.dataset.themeId);

    const smBtn = e.target.closest('.sm-btn[data-act="del"]');
    if (smBtn) {
      const row = smBtn.closest('.sm-row');
      const name = row?.dataset.subjectRow;
      if (!name) return;
      const n = subjectTasks(name).length;
      confirmAction(
        'Excluir matéria',
        `"${name}" será removida. ${n ? `${n} tarefa${n !== 1 ? 's' : ''} ficarão sem matéria` : 'Nenhuma tarefa usa esta matéria'} e a tag sai das notas.`,
        () => {
          const res = deleteSubject(name);
          if (!res.ok) { toast(res.error, 'warn'); return; }
          renderSubjectManager();
          toast(`Matéria "${name}" excluída${res.detached ? ` · ${res.detached} tarefas sem matéria` : ''}`, 'warn');
          setStatus(`Matéria "${name}" excluída`);
        }
      );
      return;
    }

    const chip = e.target.closest('[data-subject]');
    if (chip) {
      const s = chip.dataset.subject;
      ui.filters.subject = ui.filters.subject === s ? '' : s;
      el('filter-subject').value = ui.filters.subject;
      setView('tasks');
      renderAll();
    }

    const group = e.target.closest('.tgroup');
    if (group) {
      const scope = group.dataset.scope;
      const btn = e.target.closest('[data-act]');

      if (scope === 'history') {
        if (btn && btn.dataset.act === 'restore') restoreHistoryEntry(history.find(h => h.id === group.dataset.id));
        return;
      }

      const found = findNode(scope, group.dataset.job, group.dataset.id);
      if (!found) return;

      if (btn) {
        const act = btn.dataset.act;
        const subRow = btn.closest('.sub-row');
        if (act === 'toggle') {
          scope === 'task' ? toggleTask(found.node.id) : toggleItem(found.job, found.node);
        }
        if (act === 'edit') {
          scope === 'task' ? openTaskModal(found.node) : openItemModal(found.node, found.job);
        }
        if (act === 'del') {
          scope === 'task' ? deleteTask(found.node.id) : deleteItem(found.job, found.node);
        }
        if (act === 'sub-toggle' && subRow) toggleSubtask(found, subRow.dataset.subId);
        if (act === 'sub-del' && subRow) deleteSubtask(found, subRow.dataset.subId);
        return;
      }

      if (!e.target.closest('.subs')) toggleGroup(scope, group.dataset.job, group.dataset.id);
      return;
    }

    const jobBtn = e.target.closest('[data-job-id]');
    if (jobBtn) {
      if (ui.activeJobId !== jobBtn.dataset.jobId) {
        ui.activeJobId = jobBtn.dataset.jobId;
        ui.jobNoteLoadedFor = null;
      }
      renderJobList();
      renderJobDetail();
      return;
    }

    const linkBtn = e.target.closest('.link-card [data-act]');
    if (linkBtn) {
      const job = activeJob();
      const found = job && job.links.find(l => l.id === linkBtn.dataset.link);
      if (!found) return;
      if (linkBtn.dataset.act === 'link-copy') copyText(found.url);
      if (linkBtn.dataset.act === 'link-del') {
        job.links = job.links.filter(l => l.id !== found.id);
        job.updatedAt = Date.now();
        persistJobs();
        renderAll();
        toast('Destaque removido', 'warn');
      }
      return;
    }

    const noteBtn = e.target.closest('[data-note-id]');
    if (noteBtn) {
      ui.activeNoteId = noteBtn.dataset.noteId;
      renderNoteList();
      renderEditor();
      return;
    }

    const openTask = e.target.closest('[data-open-task]');
    if (openTask) {
      const t = tasks.find(x => x.id === openTask.dataset.openTask);
      if (t) { setView('tasks'); openTaskModal(t); }
      return;
    }

    const openJobMini = e.target.closest('[data-open-job]');
    if (openJobMini) {
      const job = jobs.find(j => j.id === openJobMini.dataset.openJob);
      if (job) {
        ui.activeJobId = job.id;
        ui.jobNoteLoadedFor = null;
        setView('jobs');
        renderJobList();
        renderJobDetail();
        return;
      }
    }

    const openNote = e.target.closest('[data-open-note]');
    if (openNote) {
      ui.activeNoteId = openNote.dataset.openNote;
      setView('notes');
      renderNoteList();
      renderEditor();
    }
  });

  el('global-search').addEventListener('input', e => {
    ui.search = e.target.value;
    if (ui.search.trim() && ui.view === 'dashboard') setView('tasks');
    renderAll();
    setStatus(ui.search ? `Buscando: "${ui.search}"` : 'Pronto');
  });

  el('filter-subject').addEventListener('change', e => { ui.filters.subject = e.target.value; renderAll(); });
  el('filter-priority').addEventListener('change', e => { ui.filters.priority = e.target.value; renderAll(); });
  el('filter-status').addEventListener('change', e => { ui.filters.status = e.target.value; renderAll(); });
  el('filter-overdue').addEventListener('change', e => { ui.filters.overdue = e.target.checked; renderAll(); });
  el('task-sort').addEventListener('change', e => { ui.filters.sort = e.target.value; renderTaskList(); });

  el('job-search').addEventListener('input', e => { ui.jobSearch = e.target.value; renderJobList(); });
  if (el('job-filter-status')) {
    el('job-filter-status').addEventListener('change', e => { ui.jobFilterStatus = e.target.value; renderJobList(); });
  }
  el('item-filter-priority').addEventListener('change', e => { ui.jobFilters.priority = e.target.value; renderJobItems(); });
  el('item-filter-status').addEventListener('change', e => { ui.jobFilters.status = e.target.value; renderJobItems(); });

  el('job-form').addEventListener('submit', e => { e.preventDefault(); saveJobFromForm(); });
  el('work-item-form').addEventListener('submit', e => { e.preventDefault(); saveItemFromForm(); });

  el('link-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!activeJob()) { toast('Abra um trabalho primeiro', 'warn'); return; }
    addLink(activeJob());
  });

  el('item-form').addEventListener('submit', e => {
    e.preventDefault();
    const job = activeJob();
    const input = el('item-title');
    const title = input.value.trim();
    if (!job) { toast('Abra um trabalho primeiro', 'warn'); return; }
    if (!title) { input.focus(); return; }
    job.items.unshift(normalizeItem({
      title,
      priority: el('item-priority').value,
      due: el('item-due').value || '',
      notes: '',
      createdAt: Date.now()
    }));
    job.updatedAt = Date.now();
    input.value = '';
    persistJobs();
    renderAll();
    input.focus();
    toast('Item adicionado ao checklist', 'ok');
  });

  document.addEventListener('submit', e => {
    const form = e.target.closest('.subs-form');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('.subs-input');
    const title = input.value.trim();
    if (!title) return;
    const found = findNode(form.dataset.scope, form.dataset.job, form.dataset.id);
    if (!addSubtask(found, title)) return;
    const again = document.querySelector(`.subs-form[data-scope="${form.dataset.scope}"][data-id="${form.dataset.id}"] .subs-input`);
    if (again) { again.focus(); again.scrollIntoView({ block: 'nearest' }); }
  });

  el('task-form').addEventListener('submit', e => { e.preventDefault(); saveTaskFromForm(); });
  el('subject-add-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = el('subject-new');
    const res = addSubject(input.value);
    if (!res.ok) { toast(res.error, 'warn'); input.focus(); return; }
    input.value = '';
    renderSubjectManager();
    toast(`Matéria "${res.name}" adicionada`, 'ok');
    const row = el('subject-manager').querySelector('.sm-row:last-child');
    if (row) { row.classList.add('is-flash'); row.querySelector('.sm-name').focus(); }
  });

  el('subject-search').addEventListener('input', e => {
    ui.subjectSearch = e.target.value;
    renderSubjectManager();
  });

  el('subject-manager').addEventListener('input', e => {
    const field = e.target.closest('[data-act]');
    if (!field) return;
    const row = field.closest('.sm-row');
    const name = row.dataset.subjectRow;

    if (field.dataset.act === 'color') {
      prefs.subjectColors[findSubject(name) || name] = field.value;
      save(K.prefs, prefs);
      renderSidebarSubjects();
      renderTaskList();
      renderSubjectBars();
      return;
    }

    if (field.dataset.act === 'name') {
      ui.editingSubject = { original: name, value: field.value };
    }
  });

  el('subject-manager').addEventListener('keydown', e => {
    const field = e.target.closest('.sm-name');
    if (!field) return;
    const pending = ui.editingSubject;
    if (e.key === 'Enter') {
      e.preventDefault();
      commitSubjectRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      ui.editingSubject = null;
      renderSubjectManager();
    } else if (e.key === 'Tab' && pending) {
      commitSubjectRename();
    }
  });

  el('subject-manager').addEventListener('focusout', e => {
    if (e.target.closest('.sm-name') && ui.editingSubject) commitSubjectRename();
  });

  el('confirm-ok').addEventListener('click', () => {
    const cb = ui.confirmAction;
    ui.confirmAction = null;
    closeModals();
    if (cb) cb();
  });

  if (el('note-title')) el('note-title').addEventListener('input', e => updateNote({ title: e.target.value }));
  if (el('note-area')) el('note-area').addEventListener('input', e => updateNote({ area: e.target.value }));
  if (el('note-subarea')) el('note-subarea').addEventListener('input', e => updateNote({ subarea: e.target.value }));
  if (el('note-tags')) el('note-tags').addEventListener('input', e =>
    updateNote({ tags: (e.target.value || '').split(',').map(s => s.trim()).filter(Boolean) }));
  if (el('note-content')) el('note-content').addEventListener('input', e => {
    updateNoteMeta();
    renderPreview();
    updateNote({ content: e.target.value });
  });

  el('job-note-content').addEventListener('input', e => {
    updateJobNoteMeta();
    renderJobPreview();
    saveJobNote();
  });

  $$('.editor-toolbar').forEach(bar => {
    bar.addEventListener('click', e => {
      const modeBtn = e.target.closest('.mode-btn');
      if (modeBtn) { setNotesMode(modeBtn.dataset.mode); return; }

      const tool = e.target.closest('.tool');
      if (!tool || !tool.dataset.wrap && !tool.dataset.prefix) return;
      const ta = el(bar.dataset.target);
      if (!ta) return;
      const start = ta.selectionStart, end = ta.selectionEnd;
      const sel = ta.value.slice(start, end);
      let ins, caret;
      if (tool.dataset.wrap) {
        const w = tool.dataset.wrap;
        ins = w + sel + w;
        caret = start + ins.length;
      } else {
        const pfx = tool.dataset.prefix;
        ins = sel
          ? sel.split('\n').map(l => pfx + l).join('\n')
          : pfx;
        caret = start + ins.length;
      }
      ta.value = ta.value.slice(0, start) + ins + ta.value.slice(end);
      ta.focus();
      ta.setSelectionRange(caret, caret);
      if (bar.dataset.kind === 'job') {
        updateJobNoteMeta();
        renderJobPreview();
        saveJobNote();
      } else {
        updateNoteMeta();
        renderPreview();
        updateNote({ content: ta.value });
      }
    });
  });

  const wallRange = (id, key, factor) => {
    el(id).addEventListener('input', e => {
      if (!wallpaper) return;
      wallpaper[key] = Number(e.target.value) / factor;
      try { localStorage.setItem(K.wallpaper, JSON.stringify(wallpaper)); } catch {}
      applyWallpaperVars();
      renderWallpaperUI();
    });
  };
  wallRange('wall-veil', 'veil', 100);
  wallRange('wall-alpha', 'alpha', 1);
  wallRange('wall-blur', 'blur', 1);

  el('wall-file').addEventListener('change', e => {
    if (e.target.files[0]) uploadWallpaper(e.target.files[0]);
    e.target.value = '';
  });

  const pickAccent = e => {
    prefs.accent = e.target.value;
    prefs.accentCustom = true;
    applyPrefs();
    persistAll();
    renderAll();
  };
  el('accent-picker').addEventListener('input', pickAccent);
  el('accent-picker-2').addEventListener('input', pickAccent);

  el('opt-compact').addEventListener('change', e => {
    prefs.density = e.target.checked ? 'compact' : 'normal';
    applyPrefs(); persistAll();
  });
  el('opt-motion').addEventListener('change', e => {
    prefs.motion = e.target.checked ? 'on' : 'off';
    applyPrefs(); persistAll();
  });
  el('opt-font').addEventListener('change', e => {
    prefs.font = e.target.value;
    applyPrefs(); persistAll();
  });

  el('import-file').addEventListener('change', e => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModals(); el('sidebar').classList.remove('is-open'); }
    const typing = /input|textarea|select/i.test(document.activeElement.tagName);
    if (typing) return;
    if (e.key === '/') { e.preventDefault(); el('global-search').focus(); }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openTaskModal(); }
    if (e.key === 'j' || e.key === 'J') { e.preventDefault(); openJobModal(); }
    if (e.key === 'h' || e.key === 'H') { e.preventDefault(); setView('history'); }
    if (e.key === 'w' || e.key === 'W') {
      const job = activeJob();
      if (!job) { setView('jobs'); toast('Abra um trabalho para adicionar destaque', 'info'); return; }
      setView('jobs');
      el('link-label').focus();
    }
  });

  function tick() {
    el('clock-time').textContent = new Date().toLocaleTimeString('pt-BR');
    el('clock-date').textContent = new Date().toLocaleDateString('pt-BR', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    });
  }
  tick();
  setInterval(tick, 1000);
}

/* ================= init ================= */
function init() {
  applyPrefs();
  applyWallpaper();
  if (!tasks.length && !notes.length) seedData();
  purgeHistory();
  bindEvents();
  setView('dashboard');
  setInterval(purgeHistory, 3600000);
}

init();