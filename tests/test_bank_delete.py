import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

import server


class BankDeletionTests(unittest.TestCase):
    def test_delete_endpoint_removes_only_an_imported_bank(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, "BANK_DIR", Path(directory)):
            bank = server.save_bank({
                "title": "临时测试题库",
                "questions": [{"type": "single", "text": "测试题", "options": ["甲", "乙"], "answer": [1]}],
            })
            path = Path(directory) / f"{bank['id']}.json"
            self.assertTrue(path.exists())

            httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            try:
                base = f"http://127.0.0.1:{httpd.server_port}"
                request = urllib.request.Request(f"{base}/api/banks/{bank['id']}", method="DELETE")
                with patch.object(server.Handler, "log_message", lambda *_: None):
                    with urllib.request.urlopen(request, timeout=5) as response:
                        self.assertEqual(json.load(response)["deleted"], bank["id"])
                    with self.assertRaises(urllib.error.HTTPError) as rejected:
                        urllib.request.urlopen(urllib.request.Request(f"{base}/api/banks/vibe", method="DELETE"), timeout=5)
                self.assertEqual(rejected.exception.code, 400)
                self.assertFalse(path.exists())
                self.assertEqual(server.load_banks(), [])
            finally:
                httpd.shutdown()
                httpd.server_close()
                thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
