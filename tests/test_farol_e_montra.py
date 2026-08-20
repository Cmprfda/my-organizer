# -*- coding: utf-8 -*-
"""O farol (os ícones desenhados à mão) e as contas da montra.

Os ícones do farol não são ficheiros que alguém mantenha: são três círculos
escritos byte a byte (ver tray._ico_ponto). Um .ico mal formado não dá erro — o
Windows simplesmente não mostra nada —, por isso o que se prova aqui é a FORMA do
ficheiro. Da montra prova-se a regra dos estados finais, que tem de dizer o
mesmo que a da interface (statusIsFinal, static/js/utils.js): se divergirem, a
montra e a vista de Tarefas contam paradas diferentes da mesma folha.

Corre offline: nada de janelas, de Excel ou de rede.
"""
import os
import shutil
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import history, tray


class TestIconesDoFarol(unittest.TestCase):
    def test_o_ficheiro_tem_a_forma_de_um_ico(self):
        dados = tray._ico_ponto(tray.CORES["verde"])
        reservado, tipo, quantos = struct.unpack("<HHH", dados[:6])
        self.assertEqual((reservado, tipo, quantos), (0, 1, 1))   # 1 = ícone
        largura, altura, cores, _res, planos, bits, tamanho, salto = \
            struct.unpack("<BBBBHHII", dados[6:22])
        self.assertEqual((largura, altura), (tray.TAM, tray.TAM))
        self.assertEqual((planos, bits), (1, 32))
        self.assertEqual(cores, 0)          # 32 bits não tem paleta
        self.assertEqual(salto, 22)         # o bitmap começa logo depois
        self.assertEqual(tamanho, len(dados) - 22)

    def test_o_bitmap_diz_o_dobro_da_altura(self):
        # num .ico a altura do cabeçalho do DIB conta a imagem MAIS a máscara
        dados = tray._ico_ponto(tray.CORES["ambar"])
        _tam, largura, altura, planos, bits = struct.unpack("<IiiHH", dados[22:38])
        self.assertEqual(largura, tray.TAM)
        self.assertEqual(altura, tray.TAM * 2)
        self.assertEqual((planos, bits), (1, 32))

    def test_o_circulo_esta_desenhado_na_cor_pedida(self):
        bgr = tray.CORES["vermelho"]
        dados = tray._ico_ponto(bgr)
        pixels = dados[62:62 + tray.TAM * tray.TAM * 4]
        # o pixel do meio é opaco e da cor pedida; o do canto é transparente
        meio = (tray.TAM // 2) * tray.TAM * 4 + (tray.TAM // 2) * 4
        self.assertEqual(tuple(pixels[meio:meio + 3]), bgr)
        self.assertEqual(pixels[meio + 3], 255)
        self.assertEqual(pixels[3], 0)                  # canto: alfa a zero

    def test_as_tres_cores_dao_tres_ficheiros(self):
        real = tray.tempfile.gettempdir
        tmp = tempfile.mkdtemp()
        tray.tempfile.gettempdir = lambda: tmp
        try:
            caminhos = tray._ficheiros_dos_icones()
            self.assertEqual(sorted(caminhos), ["ambar", "verde", "vermelho"])
            for caminho in caminhos.values():
                self.assertTrue(os.path.isfile(caminho))
                self.assertGreater(os.path.getsize(caminho), 1000)
        finally:
            tray.tempfile.gettempdir = real
            shutil.rmtree(tmp, ignore_errors=True)

    def test_sem_windows_o_farol_nao_existe_e_nao_se_queixa(self):
        real = tray.os.name
        tray.os.name = "posix"
        try:
            self.assertIsNone(tray.start("http://127.0.0.1:8765/"))
        finally:
            tray.os.name = real


class TestEstadosFinais(unittest.TestCase):
    """O gémeo do statusIsFinal da interface: os dois têm de dizer o mesmo."""

    def test_o_que_e_final(self):
        for texto in ("Done", "done", "Concluído", "Reviewed", "revisto", "OK",
                      "Closed", "Removed", "removido", "finalizado"):
            self.assertTrue(history.status_is_final(texto), texto)

    def test_o_que_nao_e_final(self):
        for texto in ("In progress", "Ready for review", "Ready to start",
                      "Blocked by CCR", "In rework", "Not ready to start", ""):
            self.assertFalse(history.status_is_final(texto), texto)


class TestContasDaMontra(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = history.HISTORY_FILE
        history.HISTORY_FILE = os.path.join(self.tmp, "history.json")

    def tearDown(self):
        history.HISTORY_FILE = self.real
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _gravar(self, linhas):
        with history._lock:
            data = history._empty()
            data["snapshots"][history._key("livro", "aba")] = {
                "seeded": "2026-01-01T09:00:00", "keyed": "ident", "rows": linhas}
            history._save(data)

    def _linha(self, estado, mudou, mudancas=1):
        return {"fn": "fn", "todo": "", "xlrow": 10, "changed": mudou,
                "changes": mudancas,
                "cols": {"Function/TC": "fn", "To Do": "", "OBS": "",
                         "Status TC": estado, "Status TP": ""}}

    def test_uma_linha_acabada_nao_e_uma_linha_aberta(self):
        self._gravar({"a": self._linha("Done", "2026-01-02T09:00:00")})
        out = history.stale_summary(7)
        self.assertEqual((out["open"], out["stale"]), (0, 0))

    def test_uma_linha_aberta_e_antiga_conta_como_parada(self):
        self._gravar({"a": self._linha("In progress", "2026-01-02T09:00:00")})
        out = history.stale_summary(7)
        self.assertEqual((out["open"], out["stale"]), (1, 1))

    def test_uma_linha_nunca_vista_a_mudar_e_contada_a_parte(self):
        self._gravar({"a": self._linha("In progress", "2026-01-02T09:00:00", 0)})
        self.assertEqual(history.stale_summary(7)["estimated"], 1)

    def test_uma_linha_sem_estado_nenhum_nao_espera_por_ninguem(self):
        self._gravar({"a": self._linha("", "2026-01-02T09:00:00")})
        self.assertEqual(history.stale_summary(7)["open"], 0)


if __name__ == "__main__":
    unittest.main()
