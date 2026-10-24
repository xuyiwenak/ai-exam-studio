# AI Exam Studio

[![Cross-platform tests](https://github.com/xuyiwenak/ai-exam-studio/actions/workflows/compatibility.yml/badge.svg)](https://github.com/xuyiwenak/ai-exam-studio/actions/workflows/compatibility.yml)

[简体中文](README.md) · English

**AI Exam Studio is a local-first mock exam and question bank web app.** Bring an existing Excel, Word or PDF question bank, use your own OpenAI-compatible LLM API to extract questions and marked answers, review them in the browser, and take timed practice exams. It also supports scanned PDFs through a vision-capable model.

There is no account or database to set up. The public repository contains five demo questions, not the author's private exam banks. Imported banks and API credentials stay in files on your computer. Existing banks can be practiced offline; first-time dependency installation and remote AI imports need an internet connection.

The current web interface is in Chinese; this guide explains its main controls in English.

## What it does

- **Document-to-question-bank import:** drag and drop or select `.xlsx`, `.docx` and `.pdf` files. Extract text locally, then ask your configured model to structure the existing questions, options and answers.
- **Scanned PDF recognition:** send pages without extractable text as images to a vision-capable model. The connection test checks text requests only, so confirm image support with your provider.
- **Review before saving:** edit extracted questions and answers in the browser. The model can make mistakes and does not verify that a source answer is correct.
- **Practice tests:** choose a bank, question count, time limit and passing threshold; use the answer sheet, resume an unfinished exam and review results after submission.
- **Answer-position shuffling:** single- and multiple-choice options are shuffled by default to reduce position-based guessing. Short answers are saved but not graded automatically.
- **Local bank management:** view, practice and delete imported banks, with a confirmation before deletion.

This is a self-study tool, not an official exam service. The passing threshold is for personal practice.

## Quick start

Requires Python 3.11 or newer and a modern browser. Node.js, npm and Docker are not needed to use the app.

Download and extract the [repository ZIP](https://github.com/xuyiwenak/ai-exam-studio/archive/refs/heads/main.zip), or clone it:

```bash
git clone https://github.com/xuyiwenak/ai-exam-studio.git
cd ai-exam-studio
```

### macOS

Double-click `start.command` in the project folder, or run `./start.command` in Terminal. The first start creates `.venv`, installs dependencies and opens the app. The service runs in the background and starts on login. Run `./stop.command` to stop it.

### Windows PowerShell

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe server.py
```

### Linux

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python server.py
```

For Windows and Linux, keep the terminal open while using the app; press `Ctrl+C` to stop it. Visit **<http://127.0.0.1:8765>** in your browser. The server listens on your own computer only. If port 8765 is busy during manual startup, run `server.py 8766` and open port 8766 instead.

## Import a question bank

1. Open **AI 配置** (AI Settings) in the app. Enter an OpenAI Chat Completions-compatible base URL, model ID and your own API key. For a remote service, use HTTPS. A local model endpoint may use HTTP.
2. Open **导入题库** (Import Question Bank), drag in or select an `.xlsx`, `.docx` or `.pdf` file, and start AI analysis. The page shows progress for each batch.
3. Check the extracted question text, choices and marked answers. Correct any mistakes, then save the bank and start a practice exam.

Use clear headings or columns for questions, choices and answers. For Excel formulas, save calculated values or replace formulas with values first. Older `.doc` files are not supported. Scanned PDFs need a model that accepts image input and may cost more to process.

Limits: 20 MB per file, 40 PDF pages requiring image recognition per import, and 1,000 questions per bank. Spreadsheet text is sent in batches of at most 25 rows, with up to three model requests at once. AI extraction may omit or misread questions; always review the result, especially multiple-choice answers.

## Privacy and compatibility

| Data | Stored at |
| --- | --- |
| Imported banks | `.local/banks/` in the project folder |
| AI settings and API key | `.local/ai-config.json` in the project folder |
| Unfinished exams and recent results | Current browser's local storage |
| Public demo questions | `questions.js` |

The original uploaded file is not kept by the local server. Extracted text and scanned-page images are sent to your chosen model service during import. The `.local/` folder is excluded from Git; protect access to it and avoid sharing your API key.

GitHub Actions installs dependencies and runs Python service/import tests plus JavaScript UI logic tests on hosted macOS ARM, Windows and Ubuntu runners with Python 3.11 and 3.13. [See the workflow and latest results](https://github.com/xuyiwenak/ai-exam-studio/actions/workflows/compatibility.yml). The author has also tested the app on an Apple Silicon Mac with Chrome. Windows 10/11 devices, Intel Macs, other Linux distributions and individual browser UIs have not all been tested on physical machines.

For Chinese troubleshooting, detailed import advice and local data migration, see the [main README](README.md).
