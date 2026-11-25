# Muse Chat

Local-first, single-file chat PWA for [Muse](https://meta.ai) models with bring-your-own-key (BYOK) API calls from the browser.

## Key features

- **Local-first history** — Chats and settings live in `localStorage` on your device.
- **BYOK** — Client-side requests to `https://api.meta.ai/v1/responses` with your `MODEL_API_KEY`.
- **Project RAG** — Attach project files (text, markdown, PDF snippets) and run keyword-based retrieval in every chat in a project.
- **Message attachments** — Drag-and-drop or pick files per message.
- **Optional web browsing** — Firecrawl search/scrape when the Web toggle is on (requires a Firecrawl API key).
- **Installable PWA** — Add to Home Screen on mobile or desktop; works offline as a shell after load.

## Quickstart

### Local development

```bash
git clone https://github.com/zman77-boop/muse-1-2-chat.git
cd muse-1-2-chat
python3 -m http.server 8000
```

Open `http://localhost:8000`. Do not open `index.html` via `file://` — the browser will block cross-origin calls to `api.meta.ai`.

1. Open **API settings**, paste your `MODEL_API_KEY`, and **Save**.
2. Optional: add a Firecrawl key for web browsing; create a **Project** and add reference files.

### Deploy on Vercel

```bash
npx vercel --prod
```

Framework: **Other** / static. Output directory: `.` (`index.html` + `vercel.json`). `vercel.json` rewrites all routes to `index.html`.

## Configuration & security

| Setting | Storage | Sent to |
|--------|---------|---------|
| `MODEL_API_KEY` | `localStorage` | `api.meta.ai` only |
| Firecrawl key | `localStorage` | `api.firecrawl.dev` only |
| Chats, projects, memory | `localStorage` | Not transmitted (except as prompt context to Muse when you send a message) |

Keys never pass through this repository or a custom backend — only your browser and the endpoints you configure.

## License

MIT — see [LICENSE](LICENSE).