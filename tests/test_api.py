# -*- coding: utf-8 -*-
"""O servidor DEV responde e diz que é o DEV.

Este teste precisa de uma app a correr no porto 8766 (run-dev.bat), por isso é
SALTADO quando ela não está de pé: a suite tem de poder correr offline (e no CI,
onde não há Excel nem servidor nenhum). Para o exigir mesmo — e falhar se o
servidor não estiver lá — corre com BSP_TEST_API=1.
"""
import json
import os
import socket
import unittest
import urllib.request

DEV_PORT = 8766
REQUIRED = os.environ.get("BSP_TEST_API") == "1"


def dev_server_up(timeout=0.4):
    try:
        with socket.create_connection(("127.0.0.1", DEV_PORT), timeout=timeout):
            return True
    except OSError:
        return False


class TestBSPTrackerAPI(unittest.TestCase):
    @unittest.skipUnless(REQUIRED or dev_server_up(),
                         f"sem app no porto {DEV_PORT} (BSP_TEST_API=1 para exigir)")
    def test_dev_endpoint(self):
        url = f"http://localhost:{DEV_PORT}/api/tasks"
        req = urllib.request.Request(url)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                self.assertEqual(response.status, 200)
                data = json.loads(response.read().decode("utf-8"))
                self.assertIn("app_version", data)
                self.assertEqual(data.get("mode"), "dev")
        except Exception as e:
            self.fail(f"API request failed. Is DEV server running on port {DEV_PORT}? Error: {e}")


if __name__ == "__main__":
    unittest.main()
