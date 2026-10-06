# AGENTS.md — estado do StudyTrack e o que falta fazer

> Leia este arquivo **antes** de mexer no projeto.
> Ele é o "não me perca": o que já está pronto, o que ainda falta, em 3 fases,
> e as armadilhas do código.
>
> **Regra do dono:** nada de commit/push automático. Só edite os arquivos.
> O `.gitignore` já bloqueia `node_modules`, `.env`, `screenshots/`, etc.

---

## 0. O projeto em 30 segundos

| Item | Valor |
| :-- | :-- |
| Stack | HTML + CSS + JS **vanilla**, zero dependência, **zero build** |
| Arquivos | `index.html` (markup), `css/style.css`, `js/app.js` (tudo o mais) |
| Storage | `localStorage`, chaves `studytrack.*` |
| Idioma da UI | pt-BR |
| Rodar | abrir `index.html` ou `python -m http.server 8000` |
| Testes | **não existe suíte**. Verificação manual (ver §5) |

Não existe `package.json`, `tsconfig`, linter, formatter nem test runner.
**Não introduza dependências nem build.** É o diferencial do projeto.

---

## 1. Fase 1 — ✅ CONCLUÍDA (app não quebra mais)

Tudo abaixo já está implementado, com CSS e wired nos eventos:

- **Módulo Trabalhos** (`#view-jobs`) — 1 registro por trabalho:
  - checklist próprio com **prioridade / prazo / anotação** (igual às tarefas)
  - **notas em Markdown** com o mesmo editor de Notas (preview, modos, baixar `.md`)
  - **destaques**: lista de URLs (empresa, repositório, docs) com abrir/copiar/remover
  - modais: `#job-modal`, `#work-item-modal`
- **Subtarefas** — clicar na linha (Tarefas **e** checklist de trabalhos) abre o
  painel `1/3 subtarefas`; add/remove/concluir por Enter; contador e badge
- **Histórico** (`#view-history`) — concluídos (tarefas + itens de trabalho)
  guardados **7 dias** no navegador, expiram sozinhos, botão **Restaurar**
- **Plano de fundo** — upload de **1 imagem** (sem galeria), a próxima substitui
  a anterior; reduzida para 1920px / JPEG 0.82 antes de gravar; sliders de
  escurecer, opacidade e desfoque; botão Remover
- Dashboard ganhou o stat "Trabalhos"; export/import `version: 2` (inclui
  `jobs` e `history`); seed de exemplo com 2 trabalhos, subtarefas, destaques
  e histórico; "Apagar tudo" limpa tudo (inclusive wallpaper)

**Validação feita:** 28 checagens manuais em Chromium headless (listagem,
subtarefas, histórico, restauração, destaques, formulários, modais, wallpaper,
busca, export) — todas passaram.

---

## 2. Fase 2 — próxima: polimento e consistência

Nada aqui quebra o app; é para deixar redondo. Sugestão de ordem:

### 2.1 Corrigir o `importData` (importe real)
Hoje o import faz um `Object.assign` raso em `jobs`, ou seja **não passa por
`normalizeItem`/`normalizeJobs`**: itens sem `subtasks` normalizados, links sem
`id`, histórico vencido entra.
→ **Fazer:** reaproveitar a mesma normalização do carregamento inicial
(`normalizeItem` + normalização de `jobs` + `purgeHistory()` após importar).

### 2.2 Dashboard coerente com os módulos novos
Hoje só existe o stat "Trabalhos".
→ **Fazer:** um painel `mini-list` "Trabalhos ativos" (com `data-open-job`,
  como o `[data-open-task]` já faz) e um "Destaques" com os links recentes.

### 2.3 Trabalhos
- filtro por **status** na lista da lateral (ativo/pausado/concluído)
- ordenar por prazo / título / atualização
- **arquivar** um trabalho concluído em vez de excluir
- botão de adicionar destaque com Enter (hoje só submit do form, sem atalho)
- `desc` curta está só em tooltip (`.job-desc` com ellipsis) — considerar bloco

### 2.4 Subtarefas
- marcar a tarefa/item pai como **concluído automaticamente** quando todas as
  subtarefas fecharem (e vice-versa ao desmarcar) — hoje é manual
- reordenar subtarefas (ver Fase 3)
- `aria-expanded` na linha + navegação por teclado dentro do painel

### 2.5 Histórico
- agrupar por dia (`Hoje`, `Ontem`, `06/10`) em vez de lista corrida
- filtro por origem: estudo / trabalhos
- contagem "expira em Nd" já existe — só considerar destaque visual
- decidir: entra ou não no export? (hoje entra, mas some sozinho em 7 dias)

### 2.6 Plano de fundo
- confirmar antes de **Remover**
- avisar o tamanho final antes de gravar (hoje só falha e volta atrás)
- evaluar `indexedDB` se a imagem não couber no `localStorage`
- se mudar para `prefs`, não esquecer que hoje é uma chave própria (`K.wallpaper`)

### 2.7 Navegação e atalhos
- atalhos que faltam: `j` novo trabalho, `h` histórico, `w` novo destaque
- statusbar lista os atalhos atuais — atualizar
- mobile: conferir `#view-jobs` com `.jobs-layout` em telas estreitas

---

## 3. Fase 3 — o mais complicado (depois)

Ordem por risco/benefício:

1. **Arrastar e soltar** reordenar tarefas, itens e subtarefas
   (nunca houve `draggable` no projeto — cuidado com o `innerHTML` recriado)
2. **Testes automatizados** de verdade (hoje só verificação manual):
   um `probe` como o do Chromium em `/tmp`, versionado em `tests/smoke.html`
   rodando por `node`/Playwright
3. **Busca unificada**: hoje filtra tarefas, notas, trabalhos, itens e histórico —
   falta incluir **destaques (URLs)** e resultados agrupados
4. **Heatmap de atividade** (dias concluídos) a partir do histórico + `completedAt`
5. **Recorrência**: tarefa semanal (`repeat`), usando `shiftISO`
6. **Pomodoro** no statusbar
7. **Separar `js/app.js`** em módulos ES ou em vários arquivos
   ⚠️ isso quebra "no build": `<script type="module">` exige servidor
   (não funciona com duplo clique). Decidir antes.
8. PWA instalável / sync opcional (continua fora do escopo "offline-first")

---

## 4. Convenções do código (para não destoar)

- **Módulos são registration-free**: um módulo novo = `<button class="nav-item"
  data-view="slug">` + `<section class="view is-hidden" id="view-slug">` +
  entrada em `VIEW_META` (`js/app.js`). Não existe array de módulos.
- **Estado**: `let tasks/notes/jobs/history/wallpaper` no topo, carregado com
  `load(K.x, fallback)`; salvar com `persistX()`; depois `renderAll()`.
- **Render**: `innerHTML` com template strings + **`escapeHtml()`** em todo
  dado do usuário. Helper `el(id)`, `$`, `$$`.
- **Eventos**: um listener delegado no `document` por assunto, com
  `e.target.closest(...)`. Elementos estáticos: listener direto em `bindEvents()`.
- **CSS**: um arquivo, cor **sempre** `var(--bg-3)`/`var(--border)`/etc.
  Nunca hardcodear cor. Seções com banner `/* ---------- nome ---------- */`.
- **UI**: `toast(msg,'ok'|'warn')`, `setStatus()`, `confirmAction()` para
  qualquer ação destrutiva, `openModal()/closeModals()`.
- **Prioridade** em pt-BR: `'alta' | 'media' | 'baixa'` (constante `PRIOS`).
- Strings de interface sempre em **pt-BR**.

### Armadilhas conhecidas

| Armadilha | Como evitar |
| :-- | :-- |
| `renderJobItems()` recria o `innerHTML` → **referência DOM antiga morre** | sempre re-consultar com `qa(...).find(x => x.dataset.id === id)` |
| re-render do painel de trabalho **pode sobrescrever o textarea** | `ui.jobNoteLoadedFor` guarda qual trabalho está carregado |
| `subtasks(node)` cria o array no acesso | mutação só por `addSubtask/toggleSubtask/deleteSubtask` |
| concluir → histórico; **desmarcar → remove do histórico** | `recordCompletion` / `unrecordCompletion` |
| filtro padrão das listas é "pendentes" | contagens de teste precisam considerar isso |
| `--p` na `.task`/`.subs` é a cor da prioridade | usar `var(--accent)`/`var(--ok)`/`var(--warn)` |
| `html[data-wall="on"]` só existe com wallpaper | `applyWallpaperVars()` liga/desliga os `--wall-*` |

---

## 5. Como verificar sem suíte

```bash
# 1. sintaxe
node --check js/app.js

# 2. smoke no Chromium headless (sem erros de console, DOM renderizado)
chromium --headless --no-sandbox --disable-gpu --virtual-time-budget=4000 \
  --dump-dom "file://$PWD/index.html" > /tmp/dom.html
grep -iE "uncaught|TypeError|ReferenceError" /tmp/chrome.log
```

Smoke completo (28 casos, o que usei na Fase 1): copie `index.html` para
`/tmp`, troque `js/app.js` e `css/style.css` por caminhos `file://` absolutos e
adicione um `<script src="probe.js">` **depois** do app — ele monta um
`<pre id="probe-results">` com `PASS/FAIL` por caso (cliques com
`new MouseEvent('click',{bubbles:true})`, formulários com
`new Event('submit',{bubbles:true,cancelable:true})`, e assertando por
**id/dataset**, nunca por índice da lista).

Checklist manual (rápido): Dashboard · Tarefas (abrir subtarefa, concluir,
filtrar) · Trabalhos (criar, add item, add destaque, editar nota) · Notas ·
Histórico (restaurar, limpar) · Temas + wallpaper (enviar, sliders, remover) ·
Export/Import/Apagar tudo · mobile (drawer) · os 6 temas.

---

## 6. Estado do git

- Branch `main`, remote `origin` configurado.
- **Trabalhe sem commitar** — o dono commota/pusha.
- `.gitignore` novo: `node_modules`, `.env`, editors, `screenshots/`, temporários.
- `screenshots/` estava **untracked** no repositório (fora de `docs/`);
  se quiser versionar as novas telas, mova para `docs/`.