# Neural Translate Extension

A high-performance Manifest V3 browser extension engineered for real-time bidirectional-isolated translation, continuous dynamic page reading, and offline document processing.

Built with a restrained Cinematic Editorial aesthetic, Neural Translate runs entirely on client-side and edge infrastructure. It connects directly to your local GPU runtime (Gemma-4 via Vulkan) or your preferred custom cloud LLM endpoints (DeepSeek, GLM, OpenAI, Claude), with an automatic fast fallback engine.

[Documentation & Guide](https://omarallsharkawy.github.io/Neural-Translate-Extension/) | [Releases](https://github.com/omarallsharkawy/Neural-Translate-Extension/releases)

---

## Core Capabilities

### 1. In-Place BiDi-Isolated Translation
- Replaces text nodes directly in the live DOM wrapped inside `<bdi dir="rtl">` elements with `unicode-bidi: isolate`.
- Prevents directional text distortion, preserving brackets, code tokens, numbers, and technical identifiers without affecting surrounding page layout.
- Double-click or press Escape to instantly restore original text nodes.

### 2. Continuous Site & Viewport Auto-Translation
- When triggered, automatically registers the domain for persistent translation across all subpages, routes, and internal links.
- Uses an active `MutationObserver` to monitor dynamic element additions (such as infinite scroll feeds on social platforms, documentation pages, or React/Next.js client-side re-renders).
- Prioritizes visible viewport text nodes as you scroll down, ensuring zero latency while reading long technical articles.

### 3. Multi-Engine Hybrid Architecture
- **Local GPU Inference:** Connects directly to local `llama-server` instances running on port `28491` with Vulkan or CUDA tensor core acceleration.
- **Custom Cloud APIs:** Native support for any OpenAI-compatible endpoint (DeepSeek-Chat, GLM-4 Flash, OpenRouter, GPT-4o-mini) and Anthropic Messages API (Claude 3.5 Haiku) with built-in latency benchmarking.
- **Fast Cloud Fallback:** Transparent failover engine to ensure reading is never interrupted if local or remote endpoints become unavailable.
- **Persistent IndexedDB Cache:** Stores previously translated segments using deterministic SHA keys for instant (0ms) repeat rendering.

### 4. Standalone Document & Book Reader (Neural Reader)
- An offline, client-side reading workspace accessible via the extension popup or context menu.
- Native format support:
  - **PDF (.pdf):** Powered by an embedded, offline build of `PDF.js`.
  - **Word (.docx):** Powered by an embedded, offline XML DOM extractor via `JSZip`.
  - **EPUB (.epub):** Multi-chapter reader with structural chapter ordering.
  - **Markdown & Plain Text (.md, .txt):** Direct paragraph chunking and formatting.
- **Dual-Pane Mode:** Side-by-side bilingual reading with synchronized paragraph highlighting and smooth scrolling.
- **Inline Mode:** Distraction-free continuous reading column with collapsible original sentence inspection.
- **Multi-Format Export:** Export to Markdown, plain text, or copy entire translated text to clipboard.

### 5. Context Menu Integration
- Right-click anywhere on any webpage to access dedicated translation actions:
  - Translate Full Page (with continuous auto-translate on scroll and links)
  - Translate Clicked Section / Paragraph in place
  - Toggle Persistent Auto-Translate for this domain
  - Replace Selected Text in place
  - Translate Selected Text in floating card
  - Revert Original Text
  - Open Neural Reader

---

## Project Structure

```
Neural-Translate-Extension/
├── manifest.json              # Manifest V3 configuration and permissions
├── background.js              # Service worker: Multi-engine router and cache manager
├── content/
│   ├── content.js             # Selection listener, in-place DOM replacer, dynamic observer
│   ├── content.css            # Scoped editorial host styling
│   └── bidi-isolate.js        # BiDi punctuation and technical term isolation engine
├── popup/
│   ├── popup.html             # Extension action menu
│   ├── popup.css              # Editorial near-black palette
│   └── popup.js               # Status poller, mode selector, and API settings
├── reader/
│   ├── reader.html            # Standalone document reader interface
│   ├── reader.css             # Dual-pane and inline reading typography
│   ├── reader.js              # PDF, Word, EPUB, and Markdown chunking engine
│   └── lib/
│       ├── jszip.min.js       # Client-side Word (.docx) and EPUB extractor
│       ├── pdf.min.js         # Offline PDF text stream parser
│       └── pdf.worker.min.js  # Dedicated PDF.js worker
├── docs/                      # Interactive documentation (hosted on GitHub Pages)
│   └── index.html
├── icons/                     # Extension vector and PNG icons
├── run-local-gemma.sh         # Linux local model runner script
├── run-local-gemma.bat        # Windows local model runner script
├── package.sh                 # ZIP packaging build script
└── dist/                      # Pre-built distribution package
```

---

## Local AI Engine Setup

Neural Translate runs as an independent client and does not require third-party GUI software to be active.

### Linux Setup
Place your model inside `~/.local/share/neural-translate/models/` or the project's `models/` folder, then run:

```bash
# Direct runner script
./run-local-gemma.sh

# Or as a background systemd user service
systemctl --user start neural-llama.service
systemctl --user status neural-llama.service
```

### Windows Setup
1. Download `llama-server.exe` from the [official llama.cpp releases](https://github.com/ggerganov/llama.cpp/releases) and place it inside the `bin/` directory.
2. Place your quantized model file (e.g. `gemma-4-E2B-it-Q4_K_M.gguf`) inside the `models/` directory.
3. Double-click `run-local-gemma.bat`. The server will initialize on port `28491`.

### Alternative Local Runtimes
In the extension settings view, one-click presets are available for:
- **LM Studio:** `http://localhost:1234`
- **Ollama:** `http://localhost:11434`
- **vLLM / LocalAI:** `http://localhost:8000`

---

## Custom Cloud API Setup

1. Open the extension popup from your browser toolbar.
2. Click the settings button in the top corner.
3. Select your provider preset:
   - **DeepSeek:** `https://api.deepseek.com/v1/chat/completions` (Model: `deepseek-chat`)
   - **GLM (Zhipu AI):** `https://open.bigmodel.cn/api/paas/v4/chat/completions` (Model: `glm-4-flash`)
   - **OpenRouter:** `https://openrouter.ai/api/v1/chat/completions`
   - **OpenAI:** `https://api.openai.com/v1/chat/completions` (Model: `gpt-4o-mini`)
   - **Anthropic:** `https://api.anthropic.com/v1/messages` (Model: `claude-3-5-haiku-20241022`)
4. Enter your API key, run a connection test, and save.

---

## Installation

### Option 1: Pre-built Package (Recommended)
1. Download the latest `neural-translate-v1.0.2.zip` from the [Releases](https://github.com/omarallsharkawy/Neural-Translate-Extension/releases) page.
2. Extract the ZIP archive into a local folder.
3. Open your Chromium-based browser (Brave, Chrome, Edge, Opera) and navigate to `brave://extensions` or `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the extracted folder.

### Option 2: Build from Source
```bash
git clone https://github.com/omarallsharkawy/Neural-Translate-Extension.git
cd Neural-Translate-Extension

# Package into distribution ZIP
./package.sh
```

The packaged extension will be generated at `dist/neural-translate-v1.0.2.zip`.

---

## Technical Specifications

- **Compatibility:** Chromium Manifest V3 (Brave, Google Chrome, Microsoft Edge, Opera, Vivaldi)
- **Local Model Format:** GGUF (Q4_K_M, Q8_0, FP16)
- **Document Support:** PDF (.pdf), Microsoft Word (.docx), EPUB (.epub), Markdown (.md), Plain Text (.txt)
- **Network Permissions:** Scoped to localhost endpoints and configured API gateways
- **Privacy:** All in-place mutations occur inside an isolated Shadow DOM; zero telemetry is transmitted to third parties unless an explicit cloud API key is configured.

---

## License

MIT License. Developed for software engineers, machine learning researchers, and technical readers.

