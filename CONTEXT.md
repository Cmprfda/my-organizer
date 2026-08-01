# CONTEXT.md

## 1) Título do Projeto & Visão Geral

## My Organizer (CSW.AI.OS)

**Resumo:** Aplicação web local (Python + HTML/CSS/JS vanilla) que abre qualquer livro de Excel do OneDrive/SharePoint (navegação por pastas e escolha na app) e o mostra de forma útil. O tracker `BSP-G2_Daily_Tracker.xlsx` mantém a vista resumida dedicada, com filtros por pessoa/papel, edição de estado com escrita segura no Excel via COM, gestão de CCRs, TODO pessoal, notas de execução e feedback/bug reporting.

**Quem usa:**
- Engenheiros V&V (ex.: Carlos Andrade e equipa).
- Uso em desktop e mobile na mesma rede local.

**Problema que resolve:**
- Evita trabalho manual disperso entre Excel, notas locais e mensagens.
- Cria uma vista operacional única com persistência local controlada e sincronização com Excel/OneDrive.

---

## 2) Stack Tecnológico & Dependências

**Backend**
- Python 3 (ponto de entrada [app.py](app.py) + pacote [cswaios/](cswaios)).
- Bibliotecas standard: http.server, threading, subprocess, json, zipfile, tempfile, glob, os, socket, datetime, etc.
- openpyxl (leitura de workbook e parsing de dados).
- Integração Windows Excel COM via PowerShell (escrita no Excel real, nunca via openpyxl).

**Frontend**
- Markup em [index.html](index.html); estilos em `static/css/*.css` e lógica em `static/js/*.js` (HTML + CSS + JavaScript vanilla).
- Drag and drop + fallback pointer/touch para browsers mobile/tablet.
- i18n PT/EN no cliente (dicionário interno em `static/js/i18n.js`).

**Integrações externas**
- OneDrive/SharePoint (ficheiro tracker + pasta de releases).
- Excel desktop local (COM automation para escrita robusta).
- Rede local LAN (acesso por IP e localhost).

**Automação de release**
- Scripts: [make_release.py](make_release.py), [make-release.bat](make-release.bat), [run-dev.bat](run-dev.bat), [run-with-server.bat](run-with-server.bat), [setup.bat](setup.bat).
- Cada release termina com **commit + push** para `origin/main` (repositório privado `Cmprfda/my-organizer`); o passo 9 do `make_release.py` publica ainda o zip em GitHub Releases com a tag `vN`.

---

## 3) Arquitetura & Fluxo de Dados

## Fluxo principal (leitura e render)

Excel/OneDrive -> Backend `cswaios/excel.py` ou `cswaios/graph.py` -> Cache de folha crua (_RAW_CACHE) + cache de última leitura (_LAST_GOOD) em `cswaios/tasks.py` -> API /api/tasks (`cswaios/server.py`) -> Frontend `static/js/tasks.js` -> Tabela compacta/completa, CCRs, TODO, feedback

Na fonte `auto`, quando o livro escolhido no OneDrive também existe como cópia sincronizada no disco (`tasks.local_twin`), é essa cópia que é lida (`synced_copy=true` no payload): o que se grava no Excel aparece logo, enquanto a cópia na nuvem só recebe as alterações quando o OneDrive acabar de sincronizar (pode demorar minutos).

Enquanto se lê a cópia local, `tasks.sync_gap` compara o conteúdo das duas cópias (`rows_digest`, que ignora células e linhas vazias no fim porque o Excel local e a nuvem não contam a folha da mesma maneira) e, se diferirem, acrescenta ao `notice` do payload o aviso `notice_syncing` (mostrado com ℹ por baixo do nome do ficheiro). As datas não servem para decidir isto: o OneDrive atualiza o `lastModifiedDateTime` do item **antes** de o conteúdo novo estar disponível. A comparação só lê de facto a nuvem quando uma das cópias muda (o veredicto fica em `_SYNC_CHECK`, limpo pelo `forget_cache`); se a Graph falhar, o aviso simplesmente não aparece.

## Fluxo de atualização de estado (safe write)

UI (badge de estado ou célula `Obs:`) -> POST /api/update (colunas permitidas: `Status TC`, `Status TP`, `OBS`) -> validação de chave da linha (sheet+fn+todo) -> guarda sempre override local em [status_overrides.json](status_overrides.json) (✎) -> a escrita no Excel/OneDrive acontece só no POST /api/push -> próxima leitura reconcilia base vs override

## Fluxo de notas/CCRs/TODO

- Notas de execução por tarefa: [notes.json](notes.json)
- Estado de CCRs: [ccrs.json](ccrs.json)
- TODO pessoal (manual): [todo.json](todo.json) — cada item tem uma origem principal (`kind`/`ref`) e pode ter outras ligadas em `links` (é o mesmo trabalho vindo do Excel, de um CCR ou escrito à mão)

Todos estes sidecars são servidos pelo backend e renderizados no frontend; no workspace DEV são considerados dados descartáveis.

## Fluxo de feedback/bugs

Frontend (feedback manual ou erro JS) + backend (exceções) -> `feedback.stage_feedback_folder()` cria a pasta em `feedback_pending\` -> `feedback.deliver()` tenta (1) upload por Microsoft Graph para a pasta partilhada `config.FEEDBACK_SHARE_URL` (link do SharePoint com escrita para qualquer pessoa da Critical Software; override pela variável `BSP_FEEDBACK_SHARE`), (2) a pasta `feedback\` sincronizada localmente, (3) fica pendente e é reenviado depois por `feedback.flush_pending()`. Deduplicação de bugs por assinatura em [bug_reports.json](bug_reports.json) + anexação de [tracker.log](tracker.log); repetições escrevem `repeticao_NN.txt` na mesma pasta.

---

## 4) Mapa de Diretórios & Ficheiros-Chave

- [app.py](app.py)
  - Ponto de entrada fino: codificação da consola, instalação do `app_payload.zip` (aceita o antigo `bsp_payload.zip`) e despacho CLI/servidor.

- [cswaios/](cswaios)
  - `config` (constantes e versão), `i18n`, `logs`, `text`.
  - `store`/`todos`/`feedback` (estado local em JSON), `updates` (auto-atualização).
  - `excel` (leitura openpyxl + escrita COM) e `graph` (Microsoft Graph: autenticação, navegação `graph_browse`, escolha do livro `graph_pick`, recentes em `workbooks.json`).
  - `tasks` (serviço de dados: `read_sheet`, `build_payload`, `current_stamp`, `local_twin`, `sync_gap`, `push_overrides`, `forget_cache`/`forget_web_cache`).
  - `server` (endpoints HTTP: /api/tasks, /api/modified, /api/update, /api/todo, /api/note, /api/ccrs, /api/feedback, /api/bug, /static/...), `cli` (comandos `python app.py <cmd>`).

- [index.html](index.html)
  - Markup das vistas (tabs Tarefas/CCRs/TODO/Feedback) e ligação aos ficheiros de `static/`.

- `static/css/*.css`
  - Tema, layout, TODO, CCRs, formulários, tabelas, vistas, ajuda, seletor de livro e regras responsíveis (por esta ordem).
  - O tema segue o **Critical Software Design System** (tokens de marca, Aptos, cantos nítidos): ver [THEME.md](THEME.md).

- `static/fonts/*.ttf`
  - Tipografia da marca (Aptos, Aptos SemiBold, Aptos Narrow Bold, Aptos Mono), servida em `/static/fonts/...`.

- `static/js/*.js`
  - `i18n, state, bugs, utils, tasks, ccrs, views, todo, split, feedback, settings, picker, help, main` — carregados por esta ordem (scripts clássicos, âmbito global partilhado).
  - `picker.js` é o seletor de livro do OneDrive (navegar pastas, procurar, recentes).
  - `help.js` contém todo o conhecimento de utilização mostrado no botão `?`.

- [run-dev.bat](run-dev.bat)
  - Arranque DEV (porta 8766), sem auto-update.

- [run-with-server.bat](run-with-server.bat)
  - Arranque estável (porta 8765), dependências, stop de instância anterior, auto-update flow. Entrada principal é o atalho "My Organizer" (My Organizer.vbs); este ficheiro é a alternativa com consola visível.

- [setup.bat](setup.bat)
  - Setup inicial (Python/dependências/atalho).

- [make_release.py](make_release.py)
  - Publicação de release (changelog/latest/zip espelho + GitHub Release com tag `vN`).
  - Depois de publicar: `git commit` + `git push origin main` das alterações da versão.

- [README.md](README.md)
  - Manual operacional e notas de integração.

- [CLAUDE.md](CLAUDE.md)
  - Regras operacionais críticas para agentes.

- [_rollback/]( _rollback/ )
  - Snapshots e mecanismos de reversão locais.

- [tests/](tests/)
  - Scripts/casos de teste.

- [status_overrides.json](status_overrides.json), [notes.json](notes.json), [ccrs.json](ccrs.json), [todo.json](todo.json), [bug_reports.json](bug_reports.json), [tracker.log](tracker.log)
  - Estado local sidecar e logs.

---

## 5) Restrições Críticas & Invariantes

1. **Nunca escrever no Excel via openpyxl.**
   - Escrita permitida apenas por COM (Excel desktop).

2. **Nunca testar/escrever no Excel real em testes destrutivos.**
   - Usar cópia temporária de teste quando aplicável.

3. **TODO é manual-only.**
   - Estado/coluna de TODO só muda por ação explícita do utilizador (drag/drop, checkbox, timer controls).

4. **Porta estável e DEV separadas.**
   - 8765 estável, 8766 DEV, 8767+ instâncias descartáveis de teste.

5. **Não mexer na firewall/config de segurança do Windows.**

6. **Não corromper encoding de metadados de release.**
   - changelog/latest/RELEASES em UTF-8 sem BOM (evitar quebra de auto-update/json parsing).

7. **Preservar identificadores e contratos do frontend/backend.**
   - IDs/classes usados pelo JS e payloads de API são parte do contrato.

8. **Dados do utilizador estável não devem ser tocados em testes.**
   - Ambiente estável separado do workspace DEV.

9. **Resiliência de leitura é obrigatória.**
   - Em lock do Excel, servir cache válida em vez de quebrar experiência.

10. **Thread safety/log safety.**
   - Escrita de log sincronizada por lock.

---

## 6) Ambiente, Modos e Portas

## Ambientes

- **DEV (workspace de desenvolvimento):**
  - Pasta: [bsp-tracker](.)
  - Arranque: [run-dev.bat](run-dev.bat)
  - Modo: flag --dev
  - Porta: 8766
  - Sem auto-update ativo no fluxo DEV.

- **Estável (instância de utilizador):**
  - Pasta: bsp-tracker-app (fora do workspace atual)
  - Arranque: atalho "My Organizer" (My Organizer.vbs → [run-with-server.bat](run-with-server.bat))
  - Porta: 8765
  - Auto-update por latest.json + zip de releases.

- **Teste isolado:**
  - Arranque: python app.py --dev --port 8767 --no-browser --no-update
  - Uso para smoke tests sem interferir com 8766.

## Flags/config relevantes

- --dev: ativa DEV_MODE e sem auto-update.
- --port: define porta do servidor.
- --file: força workbook específico.
- --host (quando usado): restringe bind (ex.: localhost only).

## Endpoints de verificação rápida

- GET /api/tasks
  - devolve app_version, mode, dados processados, sidecars, `modified`, `stamp` (marca de versão do livro) e `digest` (md5 curto das linhas servidas).
  - `fresh=1` (botão "Atualizar"): esquece as caches em memória e relê o livro de raiz, como na primeira abertura.
- GET /api/modified?file=...
  - pedido leve (só `lastModifiedDateTime`/mtime) que a interface repete de 20 em 20 segundos; quando o `stamp` muda, recarrega sozinha. Só aceita `onedrive:web` ou ficheiros já conhecidos pela app.
- GET /logs
  - consulta de logs recentes no browser. Para diagnosticar "estado desatualizado": o log tem o livro em uso (item id), `gravado <data> #<digest>` em cada leitura, e o estado que estava no ecrã quando o utilizador clicou num badge.

---

## Nota Operacional para Agentes

Qualquer alteração no projeto deve respeitar:
1. Contratos de API e comportamento de estado sidecar.
2. Regras de segurança de escrita Excel/COM.
3. Separação estrita entre DEV e estável.
4. Processo de release e validação em DEV após alterações.