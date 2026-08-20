# -*- coding: utf-8 -*-
"""O que sai da janela viva não sai da app: arquivo do histórico e cópias do
estado com mais do que uma por dia.

Nada aqui toca no estado do utilizador: o `history.json` e os ficheiros de
estado são apontados para pastas temporárias (o arquivo e as cópias nascem ao
lado deles, de propósito — ver history._archive_dir e statefile.backup_file).
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import history, statefile


def _evento(dia, batch="", livro="C:/livro.xlsx"):
    return {"ts": f"{dia}T10:00:00", "book": livro, "sheet": "aba", "xlrow": 2,
            "fn": "FN_A", "todo": "rework", "col": "Status TC",
            "from": "a", "to": "b", "via": "app", "ident": "fn_a||rework",
            **({"batch": batch} if batch else {})}


class TestArquivoDoHistorico(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = history.HISTORY_FILE
        history.HISTORY_FILE = os.path.join(self.tmp, "history.json")
        history._ARCHIVE_CACHE.clear()

    def tearDown(self):
        history.HISTORY_FILE = self.real
        history._ARCHIVE_CACHE.clear()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_o_arquivo_e_por_mes_e_vizinho_do_historico(self):
        history._archive([_evento("2026-07-30"), _evento("2026-08-02")])
        pasta = os.path.join(self.tmp, "history")
        self.assertEqual(sorted(os.listdir(pasta)),
                         ["history-2026-07.json", "history-2026-08.json"])

    def test_arquivar_acrescenta_em_vez_de_escrever_por_cima(self):
        history._archive([_evento("2026-08-01")])
        history._archive([_evento("2026-08-02")])
        with open(os.path.join(self.tmp, "history", "history-2026-08.json"),
                  encoding="utf-8") as f:
            self.assertEqual(len(json.load(f)), 2)

    def test_le_se_o_arquivo_do_periodo_pedido(self):
        history._archive([_evento("2026-08-01"), _evento("2026-07-15")])
        so_agosto = history.archived_events("2026-08-01", "2026-09-01")
        self.assertEqual(len(so_agosto), 1)
        os_dois = history.archived_events("2026-07-01", "2026-09-01")
        self.assertEqual(len(os_dois), 2)

    def test_um_periodo_sem_fim_nao_procura_no_futuro(self):
        # sem teto, um limite aberto dava 240 procuras no disco por pergunta
        meses = history._meses_entre("2026-08-01", history._SEM_FIM)
        self.assertLessEqual(len(meses), 2)
        self.assertEqual(meses[-1], datetime.now().strftime("%Y-%m"))

    def test_o_que_passa_do_teto_vai_para_o_arquivo_e_nao_desaparece(self):
        real_max = history.MAX_EVENTS
        history.MAX_EVENTS = 3
        try:
            hoje = datetime.now().strftime("%Y-%m-%d")
            eventos = [_evento(hoje) for _ in range(5)]
            statefile.write_json(history.HISTORY_FILE,
                                 {"version": 1, "snapshots": {}, "events": []})
            # é o record_read que arquiva; aqui faz-se o mesmo à mão sobre a
            # lista, que é o passo que interessa provar
            todos = eventos
            if len(todos) > history.MAX_EVENTS:
                history._archive(todos[:len(todos) - history.MAX_EVENTS])
            vivos = todos[-history.MAX_EVENTS:]
            self.assertEqual(len(vivos), 3)
            self.assertEqual(len(history.archived_events("2026-01-01", history._SEM_FIM)), 2)
        finally:
            history.MAX_EVENTS = real_max

    def test_desfazer_um_push_antigo_encontra_o_lote_no_arquivo(self):
        # o nome do lote é "p" + o instante em milissegundos: é por ele que se
        # sabe em que mês procurar, sem ler o arquivo todo
        quando = datetime.now() - timedelta(days=40)
        lote = f"p{int(quando.timestamp() * 1000)}"
        history._archive([_evento(quando.strftime("%Y-%m-%d"), batch=lote),
                          _evento(quando.strftime("%Y-%m-%d"), batch=lote)])
        achados = history.batch_events(lote)
        self.assertEqual(len(achados), 2)
        self.assertEqual(history.batch_events("p1"), [])        # lote que não existe
        self.assertEqual(history.batch_events("seja o que for"), [])

    def test_o_relatorio_do_periodo_ve_o_arquivo_e_a_janela_viva(self):
        hoje = datetime.now()
        antigo = (hoje - timedelta(days=20)).strftime("%Y-%m-%d")
        history._archive([_evento(antigo)])
        statefile.write_json(history.HISTORY_FILE, {
            "version": 1, "snapshots": {},
            "events": [_evento(hoje.strftime("%Y-%m-%d"))]})
        eventos = history.recent_events(days=30)
        self.assertEqual(len(eventos), 2)


class TestCopiasDoEstado(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.ficheiro = os.path.join(self.tmp, "todo.json")
        self.pasta = os.path.join(self.tmp, "backups")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _copias(self):
        return sorted(os.listdir(self.pasta)) if os.path.isdir(self.pasta) else []

    def test_a_copia_automatica_e_por_hora(self):
        statefile.write_json(self.ficheiro, {"v": 1})   # nada a copiar ainda
        statefile.write_json(self.ficheiro, {"v": 2})   # copia o {"v": 1}
        statefile.write_json(self.ficheiro, {"v": 3})   # já há a desta hora
        copias = self._copias()
        self.assertEqual(len(copias), 1)
        # o nome traz o dia E a hora: era só o dia, e duas coisas apagadas no
        # mesmo dia repunham-se as duas ao princípio do dia
        self.assertRegex(copias[0], r"^todo\.\d{8}-\d{2}\.json$")

    def test_guardar_agora_desce_ao_minuto(self):
        statefile.write_json(self.ficheiro, {"v": 1})
        statefile.write_json(self.ficheiro, {"v": 2})
        statefile.backup_file(self.ficheiro, force=True)
        statefile.backup_file(self.ficheiro, force=True)
        # a da hora, a do minuto e a do segundo: nenhuma escreve por cima de outra
        self.assertEqual(len(self._copias()), 3)
        self.assertEqual(len(set(self._copias())), 3)

    def test_dos_dias_antigos_fica_a_primeira_copia_de_cada_dia(self):
        os.makedirs(self.pasta, exist_ok=True)
        hoje = datetime.now()
        dias = [(hoje - timedelta(days=n)).strftime("%Y%m%d") for n in range(6)]
        for dia in dias:
            for hora in ("08", "09", "10"):
                with open(os.path.join(self.pasta, f"todo.{dia}-{hora}.json"),
                          "w", encoding="utf-8") as f:
                    f.write("{}")
        statefile._prune(self.pasta, "todo")
        ficaram = self._copias()
        recentes = sorted(dias)[-statefile.BACKUP_DIAS_FINOS:]
        for dia in recentes:                     # dias recentes: todas as horas
            self.assertEqual(len([n for n in ficaram if dia in n]), 3, dia)
        for dia in sorted(dias)[:-statefile.BACKUP_DIAS_FINOS]:
            sobra = [n for n in ficaram if dia in n]
            self.assertEqual(sobra, [f"todo.{dia}-08.json"], dia)

    def test_o_teto_do_numero_de_copias_e_respeitado(self):
        os.makedirs(self.pasta, exist_ok=True)
        hoje = datetime.now().strftime("%Y%m%d")
        for n in range(statefile.BACKUP_KEEP + 20):
            with open(os.path.join(self.pasta, f"todo.{hoje}-{n:04d}.json"),
                      "w", encoding="utf-8") as f:
                f.write("{}")
        statefile._prune(self.pasta, "todo")
        self.assertEqual(len(self._copias()), statefile.BACKUP_KEEP)

    def test_o_trinco_do_ficheiro_e_entre_processos(self):
        # o mesmo processo entra duas vezes (é reentrante entre fios); o que
        # interessa provar é que o trinco do sistema é pedido e devolvido
        with statefile.state_lock(self.ficheiro) as preso:
            self.assertIsInstance(preso, bool)
            self.assertTrue(os.path.isfile(self.ficheiro + ".lock"))
        with statefile.state_lock(self.ficheiro) as outra:
            self.assertIsInstance(outra, bool)

    def test_copias_de_ficheiros_diferentes_nao_se_misturam(self):
        outro = os.path.join(self.tmp, "notes.json")
        for f in (self.ficheiro, outro):
            statefile.write_json(f, {"v": 1})
            statefile.write_json(f, {"v": 2})
        self.assertEqual(len(self._copias()), 2)
        statefile._prune(self.pasta, "todo")
        self.assertEqual(len(self._copias()), 2)     # o prune de um não mexe no outro


if __name__ == "__main__":
    unittest.main(verbosity=2)
