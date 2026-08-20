# -*- coding: utf-8 -*-
"""As dobras sobre o histórico: durações, ricochetes e envios pisados.

Nenhuma destas contas precisa de dados novos — o que faltava era fazer a conta
sobre os eventos que já estavam gravados. Aqui prova-se sobre eventos escritos à
mão, com o `history.json` apontado a uma pasta temporária: nada de Excel, de rede
ou de ficheiros do utilizador.
"""
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import history

LIVRO = "livro1"
ABA = "Sheet1"


def _ts(dias_atras, hora=9):
    """Marca ISO de há N dias (o período das dobras é relativo a hoje)."""
    quando = datetime.now() - timedelta(days=dias_atras)
    return quando.replace(hour=hora, minute=0, second=0, microsecond=0).isoformat()


def _evento(ts, col, de, para, via="sheet", ident="fn_a||rework", xlrow=10, batch=""):
    return {"ts": ts, "book": LIVRO, "sheet": ABA, "xlrow": xlrow,
            "fn": "fn_a", "todo": "rework", "col": col,
            "from": de, "to": para, "via": via, "ident": ident,
            **({"batch": batch} if batch else {})}


class _ComHistorico(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = history.HISTORY_FILE
        history.HISTORY_FILE = os.path.join(self.tmp, "history.json")
        history._ARCHIVE_CACHE.clear()

    def tearDown(self):
        history.HISTORY_FILE = self.real
        history._ARCHIVE_CACHE.clear()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _gravar(self, eventos):
        with history._lock:
            data = history._empty()
            data["events"] = eventos
            history._save(data)


class TestDuracaoDosEstados(_ComHistorico):
    def test_dois_eventos_seguidos_medem_o_tempo_no_estado_do_meio(self):
        self._gravar([_evento(_ts(10), "Status TC", "", "In progress"),
                      _evento(_ts(6), "Status TC", "In progress", "Done")])
        cols = history.transition_stats(days=60)
        linhas = cols["Status TC"]
        self.assertEqual(len(linhas), 1)
        self.assertEqual(linhas[0]["value"], "In progress")
        self.assertEqual(linhas[0]["median_days"], 4.0)

    def test_o_ultimo_estado_de_uma_linha_nao_conta(self):
        # ainda está a correr: não se sabe quanto vai durar, e contá-lo como
        # "zero dias" puxava a mediana para baixo
        self._gravar([_evento(_ts(10), "Status TC", "", "In progress")])
        self.assertEqual(history.transition_stats(days=60), {})

    def test_a_mediana_e_por_valor_e_por_coluna(self):
        self._gravar([
            _evento(_ts(20), "Status TC", "", "In progress", ident="a"),
            _evento(_ts(18), "Status TC", "In progress", "Done", ident="a"),
            _evento(_ts(14), "Status TC", "", "In progress", ident="b"),
            _evento(_ts(10), "Status TC", "In progress", "Done", ident="b"),
            _evento(_ts(9), "Status TP", "", "Review", ident="c"),
            _evento(_ts(6), "Status TP", "Review", "Done", ident="c"),
        ])
        cols = history.transition_stats(days=60)
        self.assertEqual(sorted(cols), ["Status TC", "Status TP"])
        tc = cols["Status TC"][0]
        self.assertEqual(tc["n"], 2)
        self.assertEqual(tc["median_days"], 3.0)      # 2 e 4 dias
        self.assertEqual(tc["max_days"], 4.0)
        self.assertTrue(tc["thin"])                   # dois casos não é mediana

    def test_o_obs_nao_e_um_estado(self):
        self._gravar([_evento(_ts(10), "OBS", "", "a correr no jenkins"),
                      _evento(_ts(6), "OBS", "a correr no jenkins", "falhou")])
        self.assertEqual(history.transition_stats(days=60), {})


class TestRicochete(_ComHistorico):
    def test_voltar_a_um_estado_onde_ja_esteve_conta_uma_volta(self):
        eventos = [_evento(_ts(9), "Status TC", "In progress", "Ready for review"),
                   _evento(_ts(7), "Status TC", "Ready for review", "In progress")]
        contagem = history.bounce_counts(eventos)
        self.assertEqual(contagem["10"]["n"], 1)
        self.assertEqual(contagem["10"]["cols"], ["Status TC"])

    def test_uma_linha_que_so_avanca_nao_ricocheteia(self):
        eventos = [_evento(_ts(9), "Status TC", "", "In progress"),
                   _evento(_ts(7), "Status TC", "In progress", "Ready for review"),
                   _evento(_ts(5), "Status TC", "Ready for review", "Done")]
        self.assertEqual(history.bounce_counts(eventos), {})

    def test_duas_idas_e_voltas_contam_duas(self):
        eventos = [_evento(_ts(9), "Status TC", "In progress", "Review"),
                   _evento(_ts(8), "Status TC", "Review", "In progress"),
                   _evento(_ts(7), "Status TC", "In progress", "Review"),
                   _evento(_ts(6), "Status TC", "Review", "In progress")]
        self.assertEqual(history.bounce_counts(eventos)["10"]["n"], 3)

    def test_as_linhas_nao_se_misturam(self):
        eventos = [_evento(_ts(9), "Status TC", "A", "B", ident="x", xlrow=10),
                   _evento(_ts(8), "Status TC", "B", "A", ident="x", xlrow=10),
                   _evento(_ts(7), "Status TC", "A", "B", ident="y", xlrow=20)]
        contagem = history.bounce_counts(eventos)
        self.assertEqual(sorted(contagem), ["10"])

    def test_a_linha_e_a_que_a_folha_tem_agora(self):
        # a linha mudou de sítio na folha: vale o último número visto
        eventos = [_evento(_ts(9), "Status TC", "A", "B", ident="x", xlrow=10),
                   _evento(_ts(8), "Status TC", "B", "A", ident="x", xlrow=33)]
        self.assertEqual(sorted(history.bounce_counts(eventos)), ["33"])

    def test_o_sheet_history_ja_traz_a_contagem(self):
        self._gravar([_evento(_ts(9), "Status TC", "In progress", "Review"),
                      _evento(_ts(8), "Status TC", "Review", "In progress")])
        out = history.sheet_history(LIVRO, ABA, days=30)
        self.assertEqual(out["bounces"]["10"]["n"], 1)


class TestEnvioPisado(_ComHistorico):
    def test_a_folha_a_mudar_por_cima_de_um_envio_e_apanhada(self):
        self._gravar([
            _evento(_ts(5), "Status TC", "In progress", "Done", via="app", batch="b1"),
            _evento(_ts(3), "Status TC", "Done", "In progress", via="sheet"),
        ])
        itens = history.overwritten_pushes(days=30)
        self.assertEqual(len(itens), 1)
        self.assertEqual(itens[0]["mine"], "Done")
        self.assertEqual(itens[0]["now"], "In progress")
        self.assertEqual(itens[0]["batch"], "b1")
        # voltou ao valor de antes do envio: alguém desfez o que a app fez
        self.assertTrue(itens[0]["reverted"])

    def test_a_ordem_importa_a_folha_antes_do_envio_nao_e_pisar(self):
        self._gravar([
            _evento(_ts(5), "Status TC", "", "In progress", via="sheet"),
            _evento(_ts(3), "Status TC", "In progress", "Done", via="app", batch="b1"),
        ])
        self.assertEqual(history.overwritten_pushes(days=30), [])

    def test_dois_envios_seguidos_da_app_nao_sao_pisados(self):
        self._gravar([
            _evento(_ts(5), "Status TC", "a", "b", via="app", batch="b1"),
            _evento(_ts(3), "Status TC", "b", "c", via="app", batch="b2"),
        ])
        self.assertEqual(history.overwritten_pushes(days=30), [])

    def test_mudar_para_outro_valor_qualquer_tambem_conta_mas_nao_e_desfazer(self):
        self._gravar([
            _evento(_ts(5), "Status TC", "a", "Done", via="app", batch="b1"),
            _evento(_ts(3), "Status TC", "Done", "Blocked", via="sheet"),
        ])
        itens = history.overwritten_pushes(days=30)
        self.assertEqual(len(itens), 1)
        self.assertFalse(itens[0]["reverted"])

    def test_os_mais_recentes_vem_primeiro(self):
        self._gravar([
            _evento(_ts(20), "Status TC", "a", "b", via="app", ident="x", xlrow=10),
            _evento(_ts(19), "Status TC", "b", "c", via="sheet", ident="x", xlrow=10),
            _evento(_ts(5), "Status TP", "a", "b", via="app", ident="y", xlrow=20),
            _evento(_ts(4), "Status TP", "b", "c", via="sheet", ident="y", xlrow=20),
        ])
        itens = history.overwritten_pushes(days=60)
        self.assertEqual([i["xlrow"] for i in itens], [20, 10])


if __name__ == "__main__":
    unittest.main()
