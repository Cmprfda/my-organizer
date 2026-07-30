import unittest
import urllib.request
import json

class TestBSPTrackerAPI(unittest.TestCase):
    def test_dev_endpoint(self):
        url = "http://localhost:8766/api/tasks"
        req = urllib.request.Request(url)
        try:
            with urllib.request.urlopen(req) as response:
                self.assertEqual(response.status, 200)
                data = json.loads(response.read().decode('utf-8'))
                self.assertIn("app_version", data)
                self.assertEqual(data.get("mode"), "dev")
        except Exception as e:
            self.fail(f"API request failed. Is DEV server running on port 8766? Error: {e}")

if __name__ == "__main__":
    unittest.main()
