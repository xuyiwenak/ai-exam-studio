import io
import json
import re
import threading
import time
import unittest
from unittest.mock import patch

from openpyxl import Workbook

import server


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, _limit):
        return json.dumps(self.body).encode("utf-8")


class ImportParsingTests(unittest.TestCase):
    def test_excel_batches_limit_rows_per_model_request(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["题干", "A", "B", "答案"])
        for number in range(75):
            sheet.append([f"第 {number} 题", "错误", "正确", "B"])
        data = io.BytesIO()
        workbook.save(data)

        chunks, summary = server.extract_xlsx(data.getvalue())

        self.assertEqual(summary["rows"], 76)
        self.assertEqual(len(chunks), 4)
        self.assertTrue(all(chunk.count("工作表 ") <= 26 for chunk in chunks))

    def test_completion_reports_truncated_output(self):
        response = FakeResponse({"choices": [{"message": {"content": '{"questions":['}, "finish_reason": "length"}]})
        config = {"base_url": "http://127.0.0.1:9000", "model": "example", "api_key": "test"}

        with patch.object(server.urllib.request, "urlopen", return_value=response):
            with self.assertRaisesRegex(server.UserError, "截断"):
                server.completion(config, [{"role": "user", "content": "example"}], json_mode=True)

    def test_official_deepseek_has_larger_output_budget(self):
        response = FakeResponse({"choices": [{"message": {"content": '{"questions":[]}'}, "finish_reason": "stop"}]})
        for base_url, expected in [
            ("https://api.deepseek.com", server.DEEPSEEK_OUTPUT_TOKENS),
            ("http://127.0.0.1:9000", server.DEFAULT_OUTPUT_TOKENS),
        ]:
            with self.subTest(base_url=base_url), patch.object(server.urllib.request, "urlopen", return_value=response) as send:
                server.completion({"base_url": base_url, "model": "example", "api_key": "test"}, [{"role": "user", "content": "example"}])
                payload = json.loads(send.call_args.args[0].data)
                self.assertEqual(payload["max_tokens"], expected)

    def test_empty_model_reply_is_retried_once(self):
        valid = json.dumps({"questions": [{"type": "single", "text": "测试题", "options": ["错", "对"], "answer": [1], "explanation": ""}]})
        config = {"model": "example", "api_key": "test"}

        with patch.object(server, "completion", side_effect=[server.EmptyModelOutput("空"), valid]) as model:
            questions, warnings = server.parse_with_ai("test.xlsx", ["测试数据"], config)

        self.assertEqual(model.call_count, 2)
        self.assertEqual(len(questions), 1)
        self.assertEqual(questions[0]["answer"], [1])
        self.assertEqual(warnings, [])

    def test_parallel_batches_report_progress_and_keep_source_order(self):
        lock = threading.Lock()
        active = 0
        peak = 0
        updates = []

        def fake_completion(_config, messages, json_mode):
            nonlocal active, peak
            self.assertTrue(json_mode)
            number = int(re.search(r"文字片段 (\d+)/", messages[1]["content"]).group(1))
            with lock:
                active += 1
                peak = max(peak, active)
            time.sleep(0.01 * (7 - number))
            with lock:
                active -= 1
            return json.dumps({"questions": [{"type": "single", "text": f"第 {number} 题", "options": ["错", "对"], "answer": [1]}]})

        with patch.object(server, "completion", side_effect=fake_completion):
            questions, warnings = server.parse_with_ai(
                "test.xlsx", ["测试数据"] * 6, {"model": "example", "api_key": "test"}, progress=lambda done, total: updates.append((done, total))
            )

        self.assertEqual(peak, server.MAX_PARALLEL_REQUESTS)
        self.assertEqual([question["text"] for question in questions], [f"第 {number} 题" for number in range(1, 7)])
        self.assertEqual(updates, [(number, 6) for number in range(7)])
        self.assertEqual(warnings, [])


if __name__ == "__main__":
    unittest.main()
