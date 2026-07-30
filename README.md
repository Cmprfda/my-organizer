# My Organizer — visualizador de folhas de Excel

Web app local que abre um livro de Excel do teu OneDrive/SharePoint e o mostra
de forma útil. Vem preparada para o `BSP-G2_Daily_Tracker.xlsx` (aba
`PRJ_CFG1_reworks_julho`), onde mantém a **vista resumida** com as **tuas**
tarefas: TCs/funções com impacto, se és autor ou reviewer, o estado e o que há
para fazer. Qualquer outro livro é mostrado como tabela simples.

## Instalação (uma vez)

Descarrega o zip mais recente de um destes sítios:

- **[Releases no GitHub](https://github.com/Cmprfda/my-organizer/releases/latest)**
  — o `bsp-tracker-vN.zip` está anexado à versão mais recente;
- a pasta partilhada **`BSP-G2-Tracker-App`** (`releases\bsp-tracker-vN.zip`).

Extrai-o para uma pasta tua (ex.: no Ambiente de Trabalho) e **duplo clique em
`setup.bat`**. Ele trata de tudo:
- instala o Python 3 se não existir (via winget, sem admin)
- instala a dependência `openpyxl`
- cria o atalho **"My Organizer"** no Ambiente de Trabalho
- arranca a app no fim

## Uso diário

1. **Duplo clique no atalho "My Organizer"** (ou em `run.bat`) — o browser
   abre sozinho em <http://localhost:8765>. Fecha a janela preta para parar.

2. **Obtém o Excel**: usa o botão **"Obter do SharePoint"** na app (descarrega
   pelo teu browser, com a tua sessão) ou descarrega manualmente:
   [BSP-G2_Daily_Tracker.xlsx](https://criticalsoftwaresa.sharepoint.com/sites/WRSHALLOWFORD/_layouts/15/download.aspx?UniqueId=107B4AEF-D629-4094-92D1-3F681C4B12EF).
   Melhor ainda: no Teams, na pasta do canal onde está o tracker, usa
   **"Adicionar atalho ao OneDrive"** — a app passa a apanhar as atualizações
   automaticamente, sem downloads.

3. **Escreve o teu nome** no campo do topo (fica memorizado no browser).

Na barra do topo podes também **escolher o ficheiro Excel** (entre os que a app
encontra; por omissão usa o mais recente) e **a aba** a mostrar — as escolhas
ficam memorizadas. Abas com outra estrutura são mostradas como tabela simples.

## Funcionalidades

- **Livro do OneDrive** (Definições → *Mudar de livro*): navega pelas pastas do
  OneDrive e dos sites do SharePoint que segues, procura pelo nome e abre
  qualquer ficheiro `.xlsx`. Os últimos livros usados ficam à mão.
- **Botão `?`** (na barra do topo, à direita do indicador de ligação): abre o
  **"Como usar"** com todas as instruções de utilização da app.
- **Distintivo no canto superior direito**: mostra de onde vêm os dados —
  verde (OneDrive ligado), vermelho (por ligar / sem servidor) ou cinzento
  (ficheiro local). Clica nele para abrir as Definições.
- **Vista resumida** (por omissão): TCs/Funções · Papel (Autor/Reviewer de TC/TP) · Estado · O que fazer
- Botões-filtro (podes combinar vários):
  - **Autor / Reviewer** — filtra pelo teu papel
  - **On my side** — a bola está do teu lado (trabalho por fazer ou reviews à tua espera)
  - **On the other side** — à espera de outros (em review, ou o autor a retrabalhar)
  - **Done** — concluídas
- **Edição de estados** — clica num badge de estado para o alterar. A app
  **grava a alteração no próprio Excel** através do Excel/COM (preserva
  gráficos e validações; a alteração sobe ao SharePoint via OneDrive como uma
  edição normal). Antes de escrever confirma que a linha da folha não mudou.
  Se a escrita no Excel falhar, a alteração fica guardada localmente (**✎** e
  anel azul no badge) e a folha ganha quando for atualizada nessa célula.
- **Execução / notas** — por tarefa: etiqueta rápida (A correr no Jenkins,
  A guardar logs, …), **checklist de execução** (correu no branch dev, correu
  no branch do componente, branch do componente atualizado, branch de review
  atualizado — chips verdes quando feitos) e texto livre (nº de runs, links).
  Guardado no servidor: o mesmo estado em todos os teus dispositivos.
- **TODO pessoal** com dois modos: **Lista** e **Kanban** (Por fazer, Em curso,
  Pendente, Concluído), com drag&drop entre colunas e suporte a arrastar itens das
  Tarefas/CCRs para o TODO.
- Nos cartões TODO com detalhe, a nota aparece também em **chip** (📝), no
  estilo visual do board integrado.
- Os números dos botões-filtro recalculam-se conforme os filtros ativos;
  botões sem resultados ficam esbatidos
- Caixa de pesquisa de texto livre
- **Vista completa** — a tabela original com todas as colunas e estados detalhados
- **Ver tudo** — tarefas da equipa inteira
- Atualização automática a cada 2 minutos

## Excel aberto neste PC?

Sem problema. Se tiveres o ficheiro aberto no Excel local (que o bloqueia),
a app continua a mostrar os dados da última leitura, com um aviso âmbar.
O botão **"Atualizar"** (ou o botão **"Fechar Excel e atualizar"** que aparece
no aviso) faz o ciclo completo: fecha o Excel **gravando as alterações**, lê os
dados frescos e volta a abrir o Excel — e funciona a partir de qualquer
dispositivo, incluindo o telemóvel.

## Ler o Excel diretamente do OneDrive (sem download)

Por omissão a app lê o ficheiro `.xlsx` que está no disco (Downloads ou pasta
sincronizada do OneDrive). Em alternativa pode ler o livro **onde ele está**,
pela API do Excel (Microsoft Graph): não descarrega nada, não depende do
OneDrive sincronizar e funciona com o ficheiro aberto por outras pessoas.

Como ativar (uma vez, só no PC onde a app corre):

1. Nas **Definições** (⚙) clica em **Ligar**: abre-se o ecrã da Microsoft no
   browser, escolhes a conta e pronto. Não é preciso instalar nada, copiar
   ficheiros de configuração nem registar aplicações no Azure — a app usa o
   cliente público da Azure CLI, que as organizações já têm autorizado.
2. Em **Definições → Mudar de livro** escolhe o livro a abrir. Numa instalação
   nova a app já aponta para o site `WRSHALLOWFORD` e para o
   `BSP-G2_Daily_Tracker.xlsx` (o `graph_config.json` é criado no primeiro
   arranque a partir do `graph_config.example.json`).
3. Em **Definições → Dados** escolhe a fonte: *Automático* (OneDrive primeiro,
   ficheiro local em recurso), *OneDrive (web)* ou *Ficheiro local*.

> A app **não** consegue reaproveitar a sessão do Edge/Chrome: o browser guarda
> cookies cifrados com a conta do Windows (e para o SharePoint, não para a
> Graph); ir buscá-los seria a mesma técnica usada por malware de roubo de
> credenciais. Por isso o início de sessão é feito na própria página da
> Microsoft.

**Se a organização bloquear este acesso**, há duas alternativas em
`graph_config.json`:

- `"use_azure_cli": true` com a Azure CLI instalada e `az login` feito — a app
  usa esse token (útil se já tiveres a CLI no PC).
- Registo próprio no Azure (Portal Azure → **Microsoft Entra ID** →
  **App registrations**, com *Allow public client flows: Yes* e as permissões
  delegadas `Files.ReadWrite.All`, `Sites.ReadWrite.All`, `offline_access`),
  pondo o `client_id` no `graph_config.json`. Com `"login_mode": "device"` o
  login passa a ser por código em vez de abrir o browser.

As credenciais ficam só neste PC (`graph_token.json`, nunca incluído nas
versões publicadas nem nos logs) e a ligação só pode ser iniciada a partir
deste computador — quem acede pela rede local usa a sessão já ligada.
Enquanto não ligares a conta, a app funciona na mesma com o ficheiro local.

## Registos (logs)

Todas as operações (pedidos, alterações de estado, downloads, erros) ficam
registadas com data/hora e dispositivo:
- na janela do servidor (a "janela preta")
- no ficheiro `tracker.log`, ao lado da app
- em <http://localhost:8765/logs> no browser (também pelo IP de rede)

**Bugs são reportados sozinhos:** se acontecer um erro (no browser ou no
servidor), a app cria automaticamente uma entrada `BUG_...` na pasta
`BSP-G2-Tracker-App\feedback`, com a mensagem, o sítio onde rebentou e os
registos do servidor — não é preciso escreveres nada. Erros repetidos não criam
entradas novas: só incrementam um contador na entrada que já existe.

## Acesso a partir do telemóvel / outros dispositivos

O servidor escuta em toda a rede local. O endereço para dispositivos móveis
(ex.: `http://192.168.x.x:8765`) aparece **na janela do servidor ao arrancar**
e **na barra da app** ("📱 Abre no telemóvel…"). Tudo funciona a partir de
qualquer dispositivo: filtros, edição de estados e o ciclo de atualização do
Excel. Se não ligar de outro dispositivo, é a firewall do Windows/da empresa a
bloquear ligações de entrada — fala com o IT. Para restringir o servidor
só ao próprio PC: `python app.py --host 127.0.0.1`.

## Versões e atualização automática

A app tem um ID de versão (visível na barra, ex.: **v2**). As releases vivem
na pasta partilhada **`BSP-G2-Tracker-App`** (OneDrive): `releases\bsp-tracker-vN.zip`
para cada versão + `latest.json` a apontar para a mais recente.

**No arranque, a app verifica essa pasta e, se houver versão mais recente,
atualiza-se e reinicia sozinha.** Para isso, uma única vez:
[abre a pasta partilhada](https://criticalsoftwaresa-my.sharepoint.com/:f:/g/personal/cm-andrade_criticalsoftware_com/IgCcVCwvzrAHSpBAGR-J3JRqATJDp1V62WRx7ddKad0tCzM?e=I4g1ot)
e escolhe **"Adicionar atalho ao OneDrive"** — a app encontra-a
automaticamente. Sem o atalho, a app continua a funcionar, só não se atualiza
(e diz-te isso, com este link, ao arrancar).

Também podes atualizar sem esperar pelo arranque, com o comando `bsp update`
(ver abaixo).

Cada versão é publicada **também** em
[Releases no GitHub](https://github.com/Cmprfda/my-organizer/releases), como
alternativa de download para quem não tem a pasta partilhada. A atualização
automática continua a usar a pasta partilhada.

## Comandos (linha de comandos)

**A janela do servidor (a "janela preta") está ocupada a servir a app e não
aceita comandos.** Para dar comandos, abre **outra** janela na pasta da app
(Shift + clique direito na pasta → *"Abrir janela do PowerShell aqui"*) e usa
o `bsp.bat` que está ao lado da app:

```
bsp help        lista todos os comandos (bsp help <comando> = detalhe)
bsp update      instala já a versão nova que estiver na pasta partilhada
bsp status      versão, servidor, ficheiros, OneDrive e alterações por enviar
bsp push        envia para o Excel as alterações de estado pendentes (✎)
bsp logs -n 50  últimas linhas do tracker.log
bsp open        abre o tracker no browser
bsp stop        para o tracker que está a correr
bsp login       liga/autentica a conta Microsoft (OneDrive)
bsp logout      termina essa sessão
```

Cada comando faz a sua ação e sai — não arranca o servidor. `bsp update
--check` só diz se há versão nova, sem instalar. Se o tracker desta pasta
estiver a correr, o `bsp push` é executado por ele (para não haver duas
instâncias a mexer nos mesmos dados); se não estiver, corre sozinho.
Sem o `.bat`, é o mesmo com `python app.py <comando>`.

## Dicas

- Para dados sempre frescos sem downloads manuais: no Teams, abre os ficheiros
  do canal e clica em **Sincronizar** — a app deteta a pasta sincronizada.
- Para outra aba ou porto: `python app.py --port 9000` e o parâmetro
  `?sheet=NomeDaAba` no URL da API.

## Integration Notes (EN)

- TODO no longer has its own note editor.
- Notes should be managed in the source views:
  - **Tasks (Excel)** use the existing "Execução / notas" editor
  - **CCRs** use the existing CCR notes column/editor
- Tablet/mobile browsers now use a **pointer-based drag fallback** so dragging
  works even when native HTML5 drag-and-drop is unreliable.
- TODO Kanban now includes an **In progress timer**:
  - moving a card into **Em curso** starts the clock automatically
  - moving it out pauses and accumulates elapsed time
  - clicking the timer on an **Em curso** card toggles start/pause
  - a **restart (↺)** control resets elapsed time (and restarts immediately if still in Em curso)
  - elapsed time remains visible after pause/move
- TODO status/column changes are **manual only**: only explicit user actions
  (drag/drop, checkbox, timer controls) can move or update TODO items.
