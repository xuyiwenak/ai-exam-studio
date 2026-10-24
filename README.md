# AI 考点 · AI Exam Studio

一个在自己电脑上运行的模拟考试系统。用 AI 从 Excel、Word、PDF 中整理题目，人工核对后加入题库，再进行限时练习和逐题复盘。

**无需注册账号或部署数据库。**公开仓库内置 5 道演示题；个人题库和 API Key 不随代码公开。已有题库可以离线练习，首次安装依赖和调用远程 AI 时需要联网。

## 功能

- **模拟考试**：按题库抽题，自设题量、时长与及格线；答题卡、标记、自动保存和交卷复盘。
- **降低位置猜题**：单选、多选默认打乱选项顺序；同一份试卷的顺序固定，判分仍对应原题库答案。
- **AI 导入**：拖入或选择 `.xlsx`、`.docx`、`.pdf`，模型识别题干、选项及原文标注的答案；保存前可以逐题修改。
- **扫描版 PDF**：将缺少可提取文字的页面转成图片，交给支持图片输入的模型识别。
- **本机题库管理**：查看、练习和删除导入的题库。删除前有确认框。

简答题会保存作答，但不自动评分；没有可用答案的客观题不会参与随机抽题和自动评分。及格线仅供自测，并非官方考试规则。

## 系统兼容性

| 环境 | 运行方式 | 验证情况 |
| --- | --- | --- |
| macOS（Apple Silicon） | `start.command` 后台启动，或按下文手动运行 | 已在 macOS 26.6.2、Python 3.13.7、Chrome 验证 |
| macOS（Intel） | 与 Apple Silicon 相同 | 有依赖安装包，尚未在 Intel Mac 实机验证 |
| Windows 10/11 | PowerShell 中手动运行 Python 服务 | 提供运行命令，尚未在 Windows 实机验证 |
| Linux（常见 glibc 发行版） | 终端中手动运行 Python 服务 | 提供运行命令，尚未在 Linux 实机验证 |

需要 **Python 3.11 或更新版本**和现代浏览器。Chrome 已实测；近期版本的 Edge、Firefox、Safari 可尝试使用，但尚未逐一验证。普通使用不需要 Node.js、npm 或 Docker。

依赖中的 [PyMuPDF](https://pymupdf.readthedocs.io/en/latest/installation.html) 为常见的 Windows、macOS 和 Linux 架构提供安装包；较旧的 Linux 系统及 Alpine/musl 环境可能无法直接安装。遇到依赖安装失败时，先确认 Python 版本并更新 `pip`。

服务仅监听本机 `127.0.0.1`，不能直接从手机或另一台电脑访问。浏览器中的考试进度与记录不会自动同步到其他浏览器。

## 快速开始

先[下载仓库 ZIP](https://github.com/xuyiwenak/ai-exam-studio/archive/refs/heads/main.zip)并解压，或用 Git 克隆：

```bash
git clone https://github.com/xuyiwenak/ai-exam-studio.git
cd ai-exam-studio
```

### macOS

在项目文件夹中双击 `start.command`，或在终端运行：

```bash
./start.command
```

首次启动会创建 `.venv`、安装依赖并打开网页。服务在后台运行，关闭启动窗口后仍可考试；登录电脑后也会自动启动。需要停止时双击 `stop.command`，或在终端运行 `./stop.command`。

### Windows（PowerShell）

在项目文件夹中运行：

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe server.py
```

### Linux

在项目文件夹中运行：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python server.py
```

Windows 和 Linux 的手动启动方式需要保持终端打开；按 `Ctrl+C` 停止。若系统没有 `py` 或 `python3 -m venv`，请先安装 Python 和对应的虚拟环境组件。

启动后打开 **<http://127.0.0.1:8765>**。若 8765 端口已被占用，手动启动时可把命令末尾改成 `server.py 8766`，并打开 `http://127.0.0.1:8766`。macOS 的 `start.command` 固定使用 8765。

## 怎么使用

1. **先试演示题**：进入考试首页，选择示例题库，设置时间和及格线，交卷后查看逐题复盘。示例题库只有 5 题。
2. **配置 AI**：在“AI 配置”填写兼容 OpenAI Chat Completions 的基础地址、模型 ID 和 API Key。远程地址需使用 HTTPS；本机模型接口可使用 HTTP。例如 DeepSeek 的基础地址是 `https://api.deepseek.com`，模型 ID 请以[供应商文档](https://api-docs.deepseek.com/api/create-chat-completion/)为准。
3. **导入自己的题库**：在“导入题库”拖入或选择文件，点击“用 AI 分析题目”。页面显示分批进度，完成后检查题干、选项和答案，再保存。
4. **开始模拟**：在“题库管理”选择导入的题库。单选和多选默认打乱选项，也可在开考前关闭。
5. **整理题库**：导入的题库可在“题库管理”点击红色垃圾桶删除。确认后会清除本机题库文件，以及当前浏览器中对应的未交卷试卷和考试记录；原始上传文件不会被删除。

### 导入建议与限制

| 文件 | 建议 |
| --- | --- |
| Excel `.xlsx` | 表头尽量清楚，题目、选项、答案分列；使用公式的单元格应先保存计算结果或转为数值。 |
| Word `.docx` | 用段落或表格清晰区分题目、选项与答案；旧版 `.doc` 暂不支持。 |
| PDF `.pdf` | 文字版识别通常更快；扫描版需配置支持图片输入的多模态模型。 |

- 单个文件不超过 **20 MB**；需要图片识别的 PDF 页面一次最多 **40 页**；单套题库最多 **1000 道题**。
- 表格每批最多 25 行，同时最多运行 3 个模型请求。页面百分比表示完成的批次数，不是剩余时间估计。
- 程序要求 AI 仅整理原文中出现的题目与答案，但模型仍可能识别错误，也不会核实标准答案是否正确。请特别核对多选题、缺失选项和扫描件识别结果。
- 原始文件不会被本地服务长期保存；提取的文字和扫描页图片会发送给你配置的模型服务，可能产生调用费用。测试连接只验证文字请求，不验证图片能力。

## 数据保存在哪里

| 数据 | 保存位置 |
| --- | --- |
| 导入的题库 | 项目目录下 `.local/banks/` |
| AI 配置与 API Key | `.local/ai-config.json`；请保护此文件和项目目录的访问权限 |
| 未交卷试卷、最近 30 次考试记录 | 当前浏览器的本地存储 |
| 公开演示题 | `questions.js` |

`.local/` 与 `source/` 已被 Git 忽略。更换电脑时，可备份 `.local/banks/` 中的题库文件；API Key 建议在新电脑重新配置。浏览器考试记录不会随题库文件一起迁移。

本机旧版若保留 `source/VibeCoding.xlsx` 和 `source/OPC题库.xlsx`，可运行 `build_question_data.py` 生成私有的 `.local/questions.js`。macOS/Linux 使用 `.venv/bin/python build_question_data.py`；Windows 使用 `.\.venv\Scripts\python.exe build_question_data.py`。服务会优先读取该私有文件，公开仓库仍只提供演示题。

## 常见问题

- **网页打不开**：确认本地服务正在运行，并检查终端输出；macOS 后台运行时可查看 `.local/server.log`。
- **只有演示题，没有 VibeCoding 或 OPC**：公开仓库不包含个人原始题库。可通过网页导入文件，或按上一节在本机生成私有题库。
- **AI 提示无效 JSON、空内容或输出截断**：重试并检查模型是否支持 JSON 输出；内容较大时拆成更小的文件。导入前始终核对答案。
- **扫描版 PDF 不能识别**：确认所配置的模型支持图片输入；文字连接测试成功不代表图片能力可用。
- **换浏览器后考试记录不见了**：记录保存在原浏览器，题库文件仍保存在 `.local/banks/`。
