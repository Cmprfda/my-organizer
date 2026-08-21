# -*- coding: utf-8 -*-
"""O Push em lote: várias células numa só ida ao Excel (cswaios/excel.py).

Corre offline e NUNCA abre o Excel: o `_run_excel_ps` é substituído por uma
resposta preparada, que é exactamente o que o PowerShell devolveria. O que se
verifica aqui é o contrato entre os dois — quem passou, quem falhou, e o que
acontece quando o livro nem chega a gravar.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import excel

LIVRO = os.path.join("C:", os.sep, "livros", "teste.xlsx")


def _grupo(xlrow, fncol, guard, cells):
    return {"xlrow": xlrow, "fncol": fncol, "guard": guard, "cells": cells}


class TestLeituraDaRespostaDoExcel(unittest.TestCase):
    """A resposta do script traduzida em (ok, mensagem) por célula."""

    def setUp(self):
        self.real = excel._run_excel_ps
        self.chamadas = []

    def tearDown(self):
        excel._run_excel_ps = self.real

    def _responder(self, rc, out):
        def fake(script, params, timeout=120):
            self.chamadas.append((script, params, timeout))
            return rc, out
        excel._run_excel_ps = fake

    def test_todas_gravadas(self):
        self._responder(0, "OK 0\nOK 1\nOK")
        r = excel.write_cells_to_excel(LIVRO, "Tracker", [
            _grupo(5, 2, "F1", [{"i": 0, "xlcol": 3, "value": "Pass"},
                                {"i": 1, "xlcol": 4, "value": "nota"}]),
        ])
        self.assertEqual(r[0], (True, "OK"))
        self.assertEqual(r[1], (True, "OK"))

    def test_uma_falha_nao_arrasta_as_outras(self):
        self._responder(0, "ERRO 0: a linha 5 da folha mudou entretanto\nOK 1\nOK")
        r = excel.write_cells_to_excel(LIVRO, "Tracker", [
            _grupo(5, 2, "F1", [{"i": 0, "xlcol": 3, "value": "Pass"},
                                {"i": 1, "xlcol": 4, "value": "nota"}]),
        ])
        self.assertFalse(r[0][0])
        self.assertTrue(r[0][1].startswith("ERRO: a linha 5"))
        self.assertEqual(r[1], (True, "OK"))

    def test_livro_nao_gravou_nada_conta(self):
        # o script chegou a escrever células (disse OK) mas o Save falhou: nada
        # ficou no ficheiro, por isso NENHUMA célula pode ser dada como enviada
        # — senão o Push apagava alterações locais que nunca chegaram à folha
        self._responder(1, "OK 0\nERRO: o livro está aberto por outra pessoa")
        r = excel.write_cells_to_excel(LIVRO, "Tracker", [
            _grupo(5, 2, "F1", [{"i": 0, "xlcol": 3, "value": "Pass"},
                                {"i": 1, "xlcol": 4, "value": "nota"}]),
        ])
        self.assertFalse(r[0][0])
        self.assertFalse(r[1][0])
        self.assertIn("outra pessoa", r[0][1])

    def test_sem_resposta_do_excel(self):
        self._responder(None, "o Excel demorou demasiado a responder")
        r = excel.write_cells_to_excel(LIVRO, "Tracker", [
            _grupo(5, 2, "F1", [{"i": 0, "xlcol": 3, "value": "Pass"}]),
        ])
        self.assertEqual(r[0], (False, "o Excel demorou demasiado a responder"))

    def test_uma_so_ida_ao_excel_para_muitas_celulas(self):
        self._responder(0, "\n".join("OK %d" % i for i in range(6)) + "\nOK")
        grupos = [_grupo(10 + n, 2, "F%d" % n,
                         [{"i": n * 2, "xlcol": 3, "value": "a"},
                          {"i": n * 2 + 1, "xlcol": 4, "value": "b"}])
                  for n in range(3)]
        r = excel.write_cells_to_excel(LIVRO, "Tracker", grupos)
        self.assertEqual(len(self.chamadas), 1, "três linhas deviam dar UM PowerShell")
        self.assertTrue(all(ok for ok, _ in r.values()))
        self.assertEqual(len(r), 6)

    def test_nada_para_escrever_nao_abre_o_excel(self):
        self._responder(0, "OK")
        r = excel.write_cells_to_excel(LIVRO, "Tracker", [_grupo(5, 2, "F1", [])])
        self.assertEqual(r, {})
        self.assertEqual(self.chamadas, [])

    def test_mudancas_de_linha_limpas_antes_de_gravar(self):
        # o \r sozinho aparecia na folha como um quadradinho no meio do texto
        self._responder(0, "OK 0\nOK")
        grupos = [_grupo(5, 2, "F1", [{"i": 0, "xlcol": 3, "value": "a\r\nb\rc"}])]
        excel.write_cells_to_excel(LIVRO, "Tracker", grupos)
        _, params, _ = self.chamadas[0]
        self.assertEqual(params["rows"][0]["cells"][0]["value"], "a\nb\nc")

    def test_folga_cresce_com_o_numero_de_celulas(self):
        self._responder(0, "OK 0\nOK 1\nOK")
        excel.write_cells_to_excel(LIVRO, "Tracker", [
            _grupo(5, 2, "F1", [{"i": 0, "xlcol": 3, "value": "a"},
                                {"i": 1, "xlcol": 4, "value": "b"}]),
        ])
        self.assertEqual(self.chamadas[0][2], 140)


class TestGuardaDoFunctionTC(unittest.TestCase):
    """Renomear a linha muda a guarda das colunas seguintes DESSA linha."""

    def setUp(self):
        self.real_graph = excel.graph_write_status
        self.real_ids = excel.graph_ids_from_path
        excel.graph_ids_from_path = lambda p: ("drv", "itm")
        self.vistos = []

    def tearDown(self):
        excel.graph_write_status = self.real_graph
        excel.graph_ids_from_path = self.real_ids

    def _aceitar_tudo(self):
        def fake(sheet, xlrow, xlcol, fncol, fn, value, drive_id, item_id):
            self.vistos.append({"xlcol": xlcol, "fn": fn, "value": value})
            return True, "OK"
        excel.graph_write_status = fake

    def test_depois_do_rename_a_guarda_e_o_nome_novo(self):
        self._aceitar_tudo()
        # coluna 2 é o Function/TC: escreve-se lá "F2", e a coluna 3 a seguir
        # já tem de ser confirmada contra "F2", não contra "F1"
        excel.write_cells_to_excel("onedrive:drv/itm", "Tracker", [
            _grupo(5, 2, "F1", [{"i": 0, "xlcol": 2, "value": "F2"},
                                {"i": 1, "xlcol": 3, "value": "Pass"}]),
        ])
        self.assertEqual(self.vistos[0]["fn"], "F1")
        self.assertEqual(self.vistos[1]["fn"], "F2",
                         "a 2ª célula devia ser guardada pelo nome NOVO da linha")

    def test_rename_falhado_deixa_a_guarda_antiga(self):
        def fake(sheet, xlrow, xlcol, fncol, fn, value, drive_id, item_id):
            self.vistos.append({"xlcol": xlcol, "fn": fn, "value": value})
            if xlcol == 2:
                return False, "ERRO: a linha mudou entretanto"
            return True, "OK"
        excel.graph_write_status = fake
        excel.write_cells_to_excel("onedrive:drv/itm", "Tracker", [
            _grupo(5, 2, "F1", [{"i": 0, "xlcol": 2, "value": "F2"},
                                {"i": 1, "xlcol": 3, "value": "Pass"}]),
        ])
        self.assertEqual(self.vistos[1]["fn"], "F1",
                         "se o rename falhou, a linha ainda se chama F1")

    def test_a_guarda_de_uma_linha_nao_passa_para_a_outra(self):
        self._aceitar_tudo()
        excel.write_cells_to_excel("onedrive:drv/itm", "Tracker", [
            _grupo(5, 2, "F1", [{"i": 0, "xlcol": 2, "value": "F2"}]),
            _grupo(6, 2, "G1", [{"i": 1, "xlcol": 3, "value": "Pass"}]),
        ])
        self.assertEqual(self.vistos[1]["fn"], "G1")


class TestScriptDoLote(unittest.TestCase):
    """O script gerado tem de dizer o destino de cada célula, e só gravar no fim."""

    def test_contrato_do_script(self):
        s = excel.EXCEL_BATCH_PS1
        self.assertIn("Write-Output ('OK ' + $c.i)", s)
        self.assertIn("Write-Output ('ERRO ' + $c.i + ': '", s)
        self.assertIn("atualiza a app e tenta de novo", s)
        self.assertEqual(s.count("$wb.Save()"), 1, "um único Save por ida ao Excel")
        # a guarda avança dentro do script, como do lado do Python
        self.assertIn("if ([int]$c.xlcol -eq $fncol) { $guard = [string]$c.value }", s)


if __name__ == "__main__":
    unittest.main()
