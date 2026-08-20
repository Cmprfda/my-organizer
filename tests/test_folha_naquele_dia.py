# -*- coding: utf-8 -*-
"""A folha naquele dia: reconstrução ao contrário e a comparação com agora.

O retrato guardado é o de AGORA; cada alteração guarda o antes e o depois. Com
as duas coisas, a folha de uma data passada NÃO precisa de ter sido guardada —
desfazem-se, uma a uma, as alterações que aconteceram depois. Aqui prova-se isso
sobre um retrato e eventos escritos à mão.

Corre offline: o `history.json` aponta para uma pasta temporária.
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import history

LIVRO, ABA = "livro1", "BSP-G2"


def _entrada(fn, todo, xlrow, **cols):
    base = {c: "" for c in history.HISTORY_COLS}
    base.update({"Function/TC": fn, "To Do": todo})
    base.update(cols)
    return {"fn": fn, "todo": todo, "xlrow": xlrow, "cols": base,
            "changed": "2026-08-20T09:00:00", "changes": 1}


def _evento(ts, col, de, para, ident, xlrow=10, via="sheet"):
    return {"ts": ts, "book": LIVRO, "sheet": ABA, "xlrow": xlrow,
            "fn": ident.split("||")[0], "todo": "", "col": col,
            "from": de, "to": para, "via": via, "ident": ident}


class TestFolhaNaquelaData(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = history.HISTORY_FILE
        history.HISTORY_FILE = os.path.join(self.tmp, "history.json")
        history._ARCHIVE_CACHE.clear()

    def tearDown(self):
        history.HISTORY_FILE = self.real
        history._ARCHIVE_CACHE.clear()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _gravar(self, linhas, eventos, seeded="2026-08-01T09:00:00"):
        with history._lock:
            data = history._empty()
            data["snapshots"][history._key(LIVRO, ABA)] = {
                "seeded": seeded, "keyed": "ident", "rows": linhas}
            data["events"] = eventos
            history._save(data)

    def test_desfazer_uma_alteracao_devolve_o_valor_de_antes(self):
        self._gravar(
            {"fn_a||": _entrada("fn_a", "", 10, **{"Status TC": "Done"})},
            [_evento("2026-08-18T10:00:00", "Status TC", "In progress", "Done", "fn_a||")])
        # antes da alteração
        antes = history.reconstruct_at(LIVRO, ABA, "2026-08-17T00:00:00")
        self.assertEqual(antes["rows"][0]["cols"]["Status TC"], "In progress")
        self.assertEqual(antes["undone"], 1)
        # depois dela, o valor é o de agora
        depois = history.reconstruct_at(LIVRO, ABA, "2026-08-19T00:00:00")
        self.assertEqual(depois["rows"][0]["cols"]["Status TC"], "Done")
        self.assertEqual(depois["undone"], 0)

    def test_varias_alteracoes_a_mesma_celula_desfazem_se_pela_ordem_certa(self):
        self._gravar(
            {"fn_a||": _entrada("fn_a", "", 10, **{"Status TC": "Done"})},
            [_evento("2026-08-10T10:00:00", "Status TC", "", "In progress", "fn_a||"),
             _evento("2026-08-14T10:00:00", "Status TC", "In progress", "Review", "fn_a||"),
             _evento("2026-08-18T10:00:00", "Status TC", "Review", "Done", "fn_a||")])
        self.assertEqual(
            history.reconstruct_at(LIVRO, ABA, "2026-08-16T00:00:00")["rows"][0]["cols"]["Status TC"],
            "Review")
        self.assertEqual(
            history.reconstruct_at(LIVRO, ABA, "2026-08-12T00:00:00")["rows"][0]["cols"]["Status TC"],
            "In progress")

    def test_uma_linha_que_ainda_nao_existia_nao_aparece_em_branco(self):
        # a linha nasceu a 18/08: o Function/TC foi escrito então
        self._gravar(
            {"fn_nova||": _entrada("fn_nova", "", 11, **{"Status TC": "In progress"})},
            [_evento("2026-08-18T10:00:00", "Function/TC", "", "fn_nova", "fn_nova||", 11)])
        antes = history.reconstruct_at(LIVRO, ABA, "2026-08-17T00:00:00")
        self.assertEqual(antes["rows"], [])
        depois = history.reconstruct_at(LIVRO, ABA, "2026-08-19T00:00:00")
        self.assertEqual(len(depois["rows"]), 1)

    def test_uma_data_antes_do_inicio_do_historico_diz_que_e_parcial(self):
        self._gravar({"fn_a||": _entrada("fn_a", "", 10)}, [],
                     seeded="2026-08-10T09:00:00")
        self.assertTrue(history.reconstruct_at(LIVRO, ABA, "2026-08-01T00:00:00")["partial"])
        self.assertFalse(history.reconstruct_at(LIVRO, ABA, "2026-08-15T00:00:00")["partial"])

    def test_uma_data_vazia_nao_reconstroi_nada(self):
        self._gravar({"fn_a||": _entrada("fn_a", "", 10)}, [])
        out = history.reconstruct_at(LIVRO, ABA, "")
        self.assertEqual(out["rows"], [])
        self.assertTrue(out["partial"])

    def test_so_as_colunas_seguidas_entram(self):
        self._gravar(
            {"fn_a||": _entrada("fn_a", "", 10, **{"Status TC": "Done"})},
            [_evento("2026-08-18T10:00:00", "Uma Coluna Qualquer", "x", "y", "fn_a||")])
        out = history.reconstruct_at(LIVRO, ABA, "2026-08-17T00:00:00")
        self.assertEqual(out["undone"], 0)
        self.assertEqual(sorted(out["rows"][0]["cols"]), sorted(history.HISTORY_COLS))


class TestAgoraContraAntes(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = history.HISTORY_FILE
        history.HISTORY_FILE = os.path.join(self.tmp, "history.json")
        history._ARCHIVE_CACHE.clear()

    def tearDown(self):
        history.HISTORY_FILE = self.real
        history._ARCHIVE_CACHE.clear()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _gravar(self, linhas, eventos):
        with history._lock:
            data = history._empty()
            data["snapshots"][history._key(LIVRO, ABA)] = {
                "seeded": "2026-08-01T09:00:00", "keyed": "ident", "rows": linhas}
            data["events"] = eventos
            history._save(data)

    def test_o_que_mudou_desde_uma_data(self):
        self._gravar(
            {"fn_a||": _entrada("fn_a", "", 10, **{"Status TC": "Done"}),
             "fn_b||": _entrada("fn_b", "", 20, **{"Status TC": "In progress"})},
            [_evento("2026-08-18T10:00:00", "Status TC", "In progress", "Done", "fn_a||")])
        out = history.diff_between(LIVRO, ABA, "2026-08-17T00:00:00")
        self.assertEqual(len(out["changes"]), 1)
        mudanca = out["changes"][0]
        self.assertEqual((mudanca["col"], mudanca["before"], mudanca["after"]),
                         ("Status TC", "In progress", "Done"))

    def test_sem_alteracoes_no_periodo_a_lista_vem_vazia(self):
        self._gravar({"fn_a||": _entrada("fn_a", "", 10, **{"Status TC": "Done"})},
                     [_evento("2026-08-02T10:00:00", "Status TC", "a", "Done", "fn_a||")])
        self.assertEqual(history.diff_between(LIVRO, ABA, "2026-08-15T00:00:00")["changes"], [])

    def test_comparar_duas_datas_passadas(self):
        self._gravar(
            {"fn_a||": _entrada("fn_a", "", 10, **{"Status TC": "Done"})},
            [_evento("2026-08-05T10:00:00", "Status TC", "", "In progress", "fn_a||"),
             _evento("2026-08-10T10:00:00", "Status TC", "In progress", "Review", "fn_a||"),
             _evento("2026-08-18T10:00:00", "Status TC", "Review", "Done", "fn_a||")])
        # entre 07/08 e 12/08 o estado passou de In progress para Review
        out = history.diff_between(LIVRO, ABA, "2026-08-07T00:00:00", "2026-08-12T00:00:00")
        self.assertEqual(len(out["changes"]), 1)
        self.assertEqual((out["changes"][0]["before"], out["changes"][0]["after"]),
                         ("In progress", "Review"))


if __name__ == "__main__":
    unittest.main()
