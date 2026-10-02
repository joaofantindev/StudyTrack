/* ================= storage ================= */
const K = {
  tasks: 'studytrack.tasks',
  notes: 'studytrack.notes',
  prefs: 'studytrack.prefs',
  subjects: 'studytrack.subjects'
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
  const d = parseISO(s);
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

/* ================= state ================= */
const defaultPrefs = {
  theme: 'zabbix',
  accent: '#e02b2b',
  density: 'normal',
  motion: 'on',
  font: 'system',
  accentCustom: false,
  subjectColors: {}
};

let tasks = load(K.tasks, []);
let notes = load(K.notes, []);
let prefs = Object.assign({}, defaultPrefs, load(K.prefs, {}));

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

let ui = {
  view: 'dashboard',
  search: '',
  filters: { subject: '', priority: '', status: 'pending', overdue: false, sort: 'smart' },
  editingTaskId: null,
  activeNoteId: notes[0]?.id || null,
  editingSubject: null,
  subjectSearch: '',
  confirmAction: null
};

const persistAll = () => {
  save(K.tasks, tasks);
  save(K.notes, notes);
  save(K.prefs, prefs);
  save(K.subjects, subjects);
};
const persistTasks = () => save(K.tasks, tasks);
const persistNotes = () => save(K.notes, notes);
const persistSubjects = () => save(K.subjects, subjects);

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
    <li class="task ${t.done ? 'is-done' : ''} ${isLate(t) ? 'is-late' : ''}" style="--p:${PRIOS[t.priority].color}" data-id="${t.id}">
      <button class="check" data-act="toggle" aria-label="Alternar conclusão">${CHECK_SVG}</button>
      <div class="task-info">
        <span class="t-title">${escapeHtml(t.title)}</span>
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

/* ================= notes ================= */
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

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
  box.innerHTML = list.map(n => `
    <button class="note-item ${n.id === ui.activeNoteId ? 'is-active' : ''}" data-note-id="${n.id}">
      <strong>${n.pinned ? '📌 ' : ''}${escapeHtml(n.title || 'Sem título')}</strong>
      <p>${escapeHtml(n.content.replace(/[#*`>-]/g, '').trim().slice(0, 70) || 'Vazia')}</p>
      <small>${fmtDateTime(n.updatedAt)}</small>
    </button>`).join('');
}

function renderEditor() {
  const n = notes.find(x => x.id === ui.activeNoteId);
  const has = !!n;
  ['note-title', 'note-tags', 'note-content'].forEach(id => {
    el(id).disabled = !has;
    el(id).style.opacity = has ? '' : '.5';
  });
  el('note-editor').querySelector('.editor-toolbar').style.opacity = has ? '' : '.5';

  if (!n) {
    el('note-title').value = '';
    el('note-tags').value = '';
    el('note-content').value = '';
    el('note-meta').textContent = '0 palavras • 0 caracteres';
    return;
  }
  el('note-title').value = n.title;
  el('note-tags').value = n.tags.join(', ');
  el('note-content').value = n.content;
  updateNoteMeta();
}

function updateNoteMeta() {
  const v = el('note-content').value;
  const words = v.trim() ? v.trim().split(/\s+/).length : 0;
  el('note-meta').textContent = `${words} palavra${words !== 1 ? 's' : ''} • ${v.length} caracteres`;
}

function createNote() {
  const n = {
    id: uid(),
    title: 'Nova nota',
    content: '',
    tags: [],
    pinned: false,
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
  notes: ['Notas', 'Resumos, snippets e referências de estudo'],
  themes: ['Temas', 'Personalize a aparência do StudyTrack']
};

function setView(view) {
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
  renderTaskList();
  renderNoteList();
  renderEditor();
  el('filter-priority').value = ui.filters.priority;
  el('filter-status').value = ui.filters.status;
  el('filter-overdue').checked = ui.filters.overdue;
  el('task-sort').value = ui.filters.sort;
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
    if (data.done && !t.completedAt) t.completedAt = Date.now();
    if (!data.done) t.completedAt = null;
    toast('Tarefa atualizada', 'ok');
  } else {
    tasks.unshift({
      id: uid(), ...data,
      createdAt: Date.now(),
      completedAt: data.done ? Date.now() : null
    });
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
  notes = [
    {
      id: uid() + 'n1', title: 'JavaScript — Array methods',
      tags: ['JavaScript', 'referência'],
      pinned: true,
      createdAt: base, updatedAt: base,
      content: `# Array methods\n\n\`\`\`js\nconst nums = [1, 2, 3, 4, 5];\n\nnums.map(n => n * 2);      // [2,4,6,8,10]\nnums.filter(n => n > 3);   // [4,5]\nnums.reduce((a, b) => a + b, 0); // 15\nnums.flatMap(n => [n, n]);  // achatar\n\`\`\`\n\n- **map** → novo array do mesmo tamanho\n- **filter** → novo array menor\n- **reduce** → um único valor\n- **splice** → muta o array original`
    },
    {
      id: uid() + 'n2', title: 'Git — comandos do dia a dia',
      tags: ['Git'],
      pinned: false,
      createdAt: base - 1e6, updatedAt: base - 5e5,
      content: `# Comandos úteis\n\n1. \`git switch -c nova-branch\`\n2. \`git add -p\` — stage por bloco\n3. \`git log --oneline --graph\`\n4. \`git restore --staged <file>\`\n5. \`git rebase -i HEAD~3\` para reescrever commits locais\n\n**Dica:** sempre \`git status\` antes de commitar.`
    },
    {
      id: uid() + 'n3', title: 'Python — erros comuns',
      tags: ['Python'],
      pinned: false,
      createdAt: base - 2e6, updatedAt: base - 2e6,
      content: `Erros que mais caem em prova:\n\n- Mutável vs imutável: listas e dicts podem mudar in-place\n- Late binding em closures dentro de loops\n- \`is\` vs \`==\` para comparar strings vazias\n- Escopo de comprehension em Python 3`
    }
  ];
  subjects = SUBJECTS_DEFAULT.slice();
  prefs.subjectColors = {};
  subjects.forEach((s, i) => { prefs.subjectColors[s] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });
  persistAll();
  renderAll();
  renderSubjectManager();
  closeModals();
  toast('Dados de exemplo carregados', 'ok');
}

function exportData() {
  const blob = new Blob([JSON.stringify({ version: 1, tasks, notes, prefs, subjects }, null, 2)], { type: 'application/json' });
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
      if (Array.isArray(data.tasks)) tasks = data.tasks;
      if (Array.isArray(data.notes)) notes = data.notes;
      if (data.prefs) prefs = Object.assign({}, defaultPrefs, data.prefs);
      if (Array.isArray(data.subjects) && data.subjects.length) {
        subjects = Array.from(new Set(data.subjects.map(s => String(s).trim()).filter(Boolean)));
      } else {
        subjects = migrateSubjects();
      }
      ui.filters.subject = '';
      ui.activeNoteId = notes[0]?.id || null;
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
  confirmAction('Apagar tudo', 'Todas as tarefas, notas e preferências serão removidas. Continuar?', () => {
    tasks = [];
    notes = [];
    prefs = Object.assign({}, defaultPrefs);
    subjects = SUBJECTS_DEFAULT.slice();
    ui.activeNoteId = null;
    ui.filters.subject = '';
    persistAll();
    applyPrefs();
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

    const taskEl = e.target.closest('.task');
    if (taskEl) {
      const btn = e.target.closest('[data-act]');
      if (btn) {
        if (btn.dataset.act === 'toggle') toggleTask(taskEl.dataset.id);
        if (btn.dataset.act === 'edit') openTaskModal(tasks.find(t => t.id === taskEl.dataset.id));
        if (btn.dataset.act === 'del') deleteTask(taskEl.dataset.id);
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

  el('note-title').addEventListener('input', e => updateNote({ title: e.target.value }));
  el('note-tags').addEventListener('input', e =>
    updateNote({ tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }));
  el('note-content').addEventListener('input', e => { updateNoteMeta(); updateNote({ content: e.target.value }); });

  $('.editor-toolbar').addEventListener('click', e => {
    const tool = e.target.closest('.tool');
    if (!tool || !tool.dataset.wrap && !tool.dataset.prefix) return;
    const ta = el('note-content');
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = ta.value.slice(start, end);
    let ins, caret;
    if (tool.dataset.wrap) {
      const w = tool.dataset.wrap;
      ins = w + sel + w;
      caret = start + ins.length;
    } else {
      const pfx = tool.dataset.prefix + '\n';
      ins = sel.split('\n').map(l => pfx + l).join('\n');
      caret = start + ins.length;
    }
    ta.value = ta.value.slice(0, start) + ins + ta.value.slice(end);
    ta.focus();
    ta.setSelectionRange(caret, caret);
    updateNoteMeta();
    updateNote({ content: ta.value });
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
  if (!tasks.length && !notes.length) seedData();
  bindEvents();
  setView('dashboard');
}

init();