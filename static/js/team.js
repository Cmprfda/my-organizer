// My Organizer — partilha das esperas com a equipa
//
// O "à espera de alguém" (waiting.js) era uma marca só desta instalação: o botão
// **À espera** de cada pessoa era a lista dela. Com este interruptor ligado, as
// minhas esperas passam a ser publicadas na pasta partilhada e todas as
// instalações leem as das outras — assim ninguém vai cobrar uma linha que um
// colega já está a cobrar (ver cswaios/team.py).
//
// É opt-in de propósito: escrever para a pasta partilhada é mandar coisas para
// fora desta máquina, como o webhook dos avisos. Desligado, nada sai — e
// continua-se a ver as esperas de quem partilha.

let teamInfo = { share_waiting: false, canEdit: false, shareFound: false };

async function loadTeamConfig() {
  try {
    const res = await fetch("/api/team/config");
    const out = await res.json();
    teamInfo = {
      share_waiting: !!out.share_waiting,
      canEdit: !!out.canEdit,
      shareFound: !!out.shareFound,
    };
  } catch (err) {
    return;   // sem servidor não há nada a mostrar
  }
  renderTeamCard();
}

function renderTeamCard() {
  const chk = $("teamShareChk");
  chk.checked = teamInfo.share_waiting;
  // quem chega pela rede local vê o estado, não mexe nele (a partilha é a partir
  // do computador onde a app corre, como o webhook e o aviso)
  chk.disabled = !teamInfo.canEdit || !teamInfo.shareFound;
  $("teamShareState").textContent = !teamInfo.shareFound
    ? t("team_share_nofolder")
    : teamInfo.share_waiting ? t("team_share_on") : t("team_share_off");
}

async function setTeamShare(on) {
  if (on && !PERSON) {
    $("teamShareChk").checked = false;
    toast(t("team_share_noname"), "err");
    return;
  }
  try {
    const res = await fetch("/api/team/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ share_waiting: !!on, person: PERSON }),
    });
    const out = await res.json();
    if (!out.ok) { toast(out.error || t("team_share_failed"), "err"); return; }
    teamInfo = {
      share_waiting: !!out.share_waiting, canEdit: true,
      shareFound: !!out.shareFound,
    };
    renderTeamCard();
    toast(out.share_waiting ? t("team_share_on") : t("team_share_off"), "ok");
    // as esperas dos outros entram pela leitura da folha: recarrega-se para
    // elas aparecerem (ou desaparecerem) já
    load();
  } catch (err) {
    toast(t("team_share_failed"), "err");
  }
}

$("teamShareChk").addEventListener("change", e => setTeamShare(e.target.checked));

function applyTeamLang() {
  $("setSecTeam").textContent = t("team_sec");
  $("teamShareLbl").textContent = t("team_share_lbl");
  $("teamShareHint").textContent = t("team_share_hint");
  renderTeamCard();
}
