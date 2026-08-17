"""A segunda janela da app (⧉) tem de nascer na MESMA origem de quem a pediu.

O localStorage é por origem: em http://127.0.0.1 a janela nova não via os livros
abertos em http://localhost e aparecia vazia, com cara de app nova.
Não precisa de servidor a correr: é só a função que escolhe a origem."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import config          # noqa: E402
from cswaios.server import _local_origin   # noqa: E402


class TestLocalOrigin(unittest.TestCase):
    def setUp(self):
        config.SERVER_PORT = 8765

    def test_mantem_a_origem_de_quem_pediu(self):
        self.assertEqual(_local_origin("localhost:8765"), "http://localhost:8765")
        self.assertEqual(_local_origin("127.0.0.1:8765"), "http://127.0.0.1:8765")
        self.assertEqual(_local_origin("[::1]:8765"), "http://[::1]:8765")

    def test_porto_e_sempre_o_nosso(self):
        config.SERVER_PORT = 8766        # instância DEV
        self.assertEqual(_local_origin("localhost:8765"), "http://localhost:8766")

    def test_nome_de_fora_nao_passa(self):
        # a janela abre neste PC: um nome vindo da rede (ou nenhum) cai no localhost
        for host in ("192.168.1.5:8765", "algum.site", "", None):
            self.assertEqual(_local_origin(host), "http://localhost:8765")


if __name__ == "__main__":
    unittest.main()
