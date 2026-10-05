# Futuras melhorias — StudyTrack

Planejamento extraído da leitura do código em 05/10/2026. Todos os caminhos e números de
linha referem-se ao estado atual do working tree (não commitado).

- `index.html` — 666 linhas
- `css/style.css` — 454 linhas
- `js/app.js` — 2204 linhas

---

## 0. Bloqueio atual — o working tree está meio quebrado

Há **1110 linhas não commitadas** (`index.html` +263, `js/app.js` +862) que adicionam uma
view **Trabalhos**, uma view **Histórico**, **subtarefas aninhadas** e **wallpaper**. Toda a
lógica de render e de negócio foi escrita, mas o wiring nunca foi finalizado.

Consequências verificadas:

| Problema | Onde | Efeito |
| :-- | :-- | :-- |
| `VIEW_META` só tem 4 entradas (`dashboard`, `tasks`, `notes`, `themes`) | `js/app.js:1710` | Os botões `data-view="jobs"` (`index.html:42`) e `data-view="history"` (`index.html:52`) lançam `TypeError: Cannot read properties of undefined` — tela branca |
| 23 funções top-level sem nenhum call site | ver lista abaixo | `renderJobList`, `renderJobDetail`, `renderLinks`, `renderJobItems`, `renderHistory`, `openJobModal`, `saveJobFromForm`, `openItemModal`, `saveItemFromForm`, `addLink`, `copyText`, `toggleGroup`, `addSubtask`, `restoreHistoryEntry`, `recordCompletion`, `uploadWallpaper`… |
| `renderAll()` não chama nenhum renderizador novo | `js/app.js:1728` | Nada da view Trabalhos/Histórico aparece |
| 6 botões `data-action` sem handler | `index.html` | `new-job`, `edit-job`, `delete-job`, `clear-history`, `wall-pick`, `wall-remove` |
| 41 classes CSS sem nenhuma regra | `css/style.css` | `.jobs-layout`, `.job-item`, `.link-card`, `.subs-form`, `.sub-row`, `.hist-icon`, `.wall-preview`, `.tgroup`… |
| `exportData()` exporta só `tasks, notes, prefs, subjects` | `js/app.js:1868` | Round-trip de export/import **destrói** a view Trabalhos |
| `applyWallpaper()` nunca é chamado no boot | `js/app.js:2197` | Wallpaper salvo não carrega |

### 0.1 Decisão pendente

Terminar o wiring **ou** `git stash` do trabalho parcial. Nenhuma feature nova deveria ser
empilhada em cima disso.

### 0.2 Checklist de saneamento (pré-requisito para o resto)

- [ ] Adicionar entradas `jobs` e `history` em `VIEW_META` (`js/app.js:1710`)
- [ ] Chamar `renderJobList()`, `renderJobDetail()` e `renderHistory()` em `renderAll()` (`js/app.js:1728`)
- [ ] Criar handlers para os 6 `data-action` órfãos
- [ ] Escrever as 41 classes CSS faltantes (`.jobs-layout` / `.jobs-side` / `.jobs-detail` precisam de um grid equivalente ao `.notes-layout` de `css/style.css:273`)
- [ ] Implementar `normalizeTask()` no load e no import
- [ ] Incluir `jobs`, `history` e `wallpaper` no `exportData()` (`js/app.js:1868`)
- [ ] Chamar `applyWallpaper()` a partir de `init()` (`js/app.js:2197`)
- [ ] Fazer `#nav-count-jobs` e `#nav-count-history` (`js/app.js:867`, `:999`) receberem valor

### 0.3 Bugs de robustez independentes do refactor

- [ ] **`importData` aceita `priority` inválido e quebra a view.** `PRIOS[t.priority].color` é
      desreferenciado sem guarda em `js/app.js:626`, `:630`, `:671`, `:891`, `:1094`, `:1114`.
      Um JSON com `"priority": "high"` lança `TypeError` e impede a lista de tarefas de
      renderizar. Só `subPanel` (`js/app.js:759`) protege corretamente. → `normalizeTask()`
      no load e no import.
- [ ] **XSS no wallpaper.** `js/app.js:331` interpola `${wallpaper.url}` sem escape, enquanto o
      `wallpaper.name`adjacente (`js/app.js:333`) é escapado.
- [ ] **`--danger: var(--accent)`** (`css/style.css:22`) deixa `.btn-danger` (`css/style.css:142`)
      visualmente idêntico a `.btn-primary`. "Excluir tudo" e "Nova tarefa" são a mesma coisa.
- [ ] **Variáveis de wallpaper nunca consumidas.** `--wallpaper`, `--wall-veil`, `--alpha`,
      `--wall-blur` são escritas em `js/app.js:315-318` e `html[data-wall="on"]` é alternado em
      `:313`, mas nenhuma regra CSS lê nenhuma delas. Falta também o `backdrop-filter` prometido
      em `css/style.css:466-469`.
- [ ] **Toolbar da nota do job é morta.** `$('.editor-toolbar')` (`js/app.js:2121`) liga apenas
      a **primeira** toolbar, então a de `index.html:285` nunca funciona — apesar de carregar
      `data-target="job-note-content" data-kind="job"`, atributos que nada lê.
- [ ] **`downloadNoteAsMd` / `downloadJobNoteAsMd`** chamam `URL.revokeObjectURL()` imediatamente
      após `.click()` (`js/app.js:1673`, `:1350`) — funciona, mas é frágil em alguns navegadores.

---

## 1. Features — alto valor, baixo custo

- [ ] **Pomodoro no status bar.** Já está no roadmap do `README.md` e `setStatus()`
      (`js/app.js:1724`) é o gancho natural. Registrar a sessão por matéria alimenta o dashboard.
- [ ] **Heatmap de atividade semanal/mensal.** Roadmap item. `history` já guarda
      `completedAt`/`expiresAt` (`js/app.js:818-832`); falta agregar por dia e desenhar.
- [ ] **Fila de revisão espaçada das notas.** Roadmap item. `Note` já tem `updatedAt`, `tags` e
      `pinned` (`js/app.js:1679-1687`).
- [ ] **Export dos jobs** (`js/app.js:1868`) e **surfacing do undo de 7 dias** — o segundo já
      está ~90% pronto (`recordCompletion`, `purgeHistory`, `renderHistory`,
      `restoreHistoryEntry`), só falta ligar.
- [ ] **Estados vazios por view.** `#view-jobs` e `#view-history` vão aparecer sem tratamento de
      "nada aqui ainda".

## 2. Features — roadmap do README ainda aberto

- [ ] Reordenação por drag & drop
- [ ] Sincronização em nuvem (sempre opt-in)
- [ ] PWA instalável offline (manifest + service worker, sem build step)

---

## 3. Qualidade visível

- [ ] **Focus trap nos modais.** `openModal()` (`js/app.js:194`) não prende o foco e
      `closeModals()` (`:198`) não devolve o foco ao gatilho. Pior: modais fechados usam
      `opacity:0; pointer-events:none` (`css/style.css:382`) em vez de `display:none`, então
      **todos os controles continuam tabuláveis com o modal "fechado"**.
- [ ] **`aria-live` nos toasts.** `#toasts` (`index.html:662`) não tem `role="status"` — todo o
      canal de feedback do app é silencioso para leitores de tela.
- [ ] **`:focus-visible` global.** Hoje o outline é suprimido em inputs, selects e textareas
      (`css/style.css:214`, `:123`, `:296`, `:298`) e substituído só por troca de cor da borda.
      `.btn`, `.tool`, `.nav-item` e `.icon-btn` não têm nenhum estilo de foco.
- [ ] **Estado nos botões de check.** `.task.is-done .check` (`css/style.css:253`) comunica o
      estado só visualmente — falta `aria-pressed` / `aria-checked`.
- [ ] **`aria-expanded` no `#btn-menu`** para o drawer mobile; hoje só `Esc` fecha
      (`.scrim` é um `::after` de CSS, `css/style.css:435`, e não é clicável).
- [ ] **Debounce no `renderAll()`.** Dispara a cada tecla digitada na busca (`js/app.js:2034`).
- [ ] **Ouvinte do evento `storage`** — duas abas sobrescrevem uma a outra silenciosamente.

---

## 4. Refactor estrutural

- [ ] **Quebrar `bindEvents()`** — 275 linhas, 12,5% do arquivo (`js/app.js:1920`). Um único
      handler delegado de clique (`:1928-2032`) com ~40 `addEventListener` fora dele.
- [ ] **Trocar o delegate com `return` precoce por um mapa `data-action → handler`.** Hoje
      `.task` (`js/app.js:1999`) retorna cedo e engole cliques nos subject chips aninhados
      (`.subject-chip` dentro de `.task`); a ordem dos `if` importa e é frágil.
- [ ] **Deduplicar helpers.** Pares byte-a-byte ou quase:
      - `dueTag(t)` `js/app.js:646` ↔ `dueTagFor(due, done)` `js/app.js:977`
      - `downloadNoteAsMd()` `:1658` ↔ `downloadJobNoteAsMd()` `:1336`
      - `updateNoteMeta()` `:1638` ↔ `updateJobNoteMeta()` `:1314`
      - `toggleTask(id)` `:1792` ↔ `toggleItem(job, item)` `:1135`
      - `isLate(t)` `:602` ↔ `isLateItem(i)` `:1133`
      - `renderTaskList()` `:669` ↔ `renderJobItems()` `:1112`
- [ ] **Encapsular em IIFE ou migrar para `type="module"`.** Hoje são 132 símbolos top-level
      vazando no `window`, e `let history` (`js/app.js:86`) faz shadow de `window.history`.
- [ ] **Cachear referências de DOM.** `renderAll()` re-consulta `#task-list`, `#note-list` etc.
      a cada chamada. `$`/`$$`/`el` (`js/app.js:164-166`) são 3 helpers quase idênticos — e `$`
      é usado exatamente uma vez (`:2121`).
- [ ] **Usar `FormData` nos modais** em vez de ler campo a campo do DOM
      (`el('wi-title').value`, `el('f-title').value`, `el('j-title').value`…).
- [ ] **Simplificar o sistema de temas.** O accent de cada tema está duplicado em
      `THEME_ACCENT` (`js/app.js:271`) e em `css/style.css:27-50`, e o `bg` dos cards de preview
      é hardcoded em `js/app.js:287`. Um 7º tema exige edições em 3 lugares.
- [ ] **Densidade compacta mais honesta.** Hoje `compact` só troca `--gap`
      (`css/style.css:51`); paddings e alturas são hardcoded.
- [ ] **Consolidar os 5 breakpoints** (`1100 / 1000 / 900 / 860 / 560` px, em blocos
      `@media` separados) num sistema consistente.

---

## 5. Ferramentas

Hoje **não há** `package.json`, ESLint, Prettier, `.editorconfig`, `tsconfig.json`, testes,
`tests/`, `.github/` (CI), hooks de pre-commit nem `CONTRIBUTING.md`.

- [ ] `package.json` com scripts `dev` (servidor estático), `lint`, `format`, `check`
- [ ] ESLint + Prettier, sem dependência de runtime
- [ ] GitHub Actions rodando lint + um smoke test de boot
- [ ] Testes do renderer de Markdown (`mdToHtml`, `js/app.js:1481`, 109 linhas) e dos
      normalizadores de dados — é onde bug de verdade aparece
- [ ] i18n: ~161 strings pt-BR hardcoded em `js/app.js`, locale fixo `pt-BR` em 6 chamadas
      `Intl` (`fmtDate` `:43`, `fmtDateTime` `:45`, `localeCompare` `:582`/`:628`, relógio
      `:2187`). `<title>`, `<meta name="description">` e as tags og: ainda estão em inglês
      (`index.html:6`, `:9-13`) enquanto a UI é pt-BR.
- [ ] Pluralização: `tarefa${n !== 1 ? 's' : ''}` repetido ~15×; `js/app.js:869` ainda produz
      `itemns` para "item"

---

## Ordem sugerida

1. **§0** — decidir o destino do refactor parcial e sanear. Nada mais é seguro antes disso.
2. **§1** — Pomodoro + heatmap: reaproveitam dados que já existem e são o maior ganho visível.
3. **§4** — quebrar `bindEvents()`, encapsular os globals, deduplicar helpers. Reduz o custo de
   qualquer feature futura.
4. **§3** — acessibilidade: barato e corrige uso real no teclado.
5. **§5** — lint + CI antes de crescer o arquivo.
6. **§2** — PWA e sync por último; exigem decisões de produto.
