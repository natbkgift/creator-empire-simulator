# Creator Empire Simulator v1.2.0 — Light UX, SQLite, Manual/Automatic AI

## Summary

v1.2.0 turns the app into a calmer, brighter production workflow with two operation modes:

- **Manual Mode**: build prompts, copy to ChatGPT/Gemini manually, paste structured JSON back into the system.
- **Automatic Mode**: generate from Prompt Studio through a local server endpoint using OpenAI or Gemini API keys stored in local SQLite.

The app now uses a Python local server and SQLite database by default. Browser IndexedDB remains a fallback when the server is unavailable.

## User-facing changes

- Reworked UX/UI to a light modern visual system.
- Reduced dashboard density and softened panels, navigation, cards, and controls.
- Added Workflow Mode selector: Manual or Automatic.
- Added AI Provider selector: OpenAI / ChatGPT API or Gemini API.
- Added model settings for OpenAI and Gemini.
- Added API key setup UI under Settings.
- API keys are sent to the local Python server and stored in SQLite, not returned to the browser.
- Prompt Studio shows either “Copy to ChatGPT” in Manual Mode or “Generate with OpenAI/Gemini” in Automatic Mode.
- Added SQLite storage status in the top HUD.
- Workspace saves to `data/creator_empire.sqlite` when the local server is running.
- IndexedDB fallback remains available if the server is offline.

## Data storage contract

SQLite file:

```text
data/creator_empire.sqlite
```

Tables:

- `workspace`: stores the current workspace JSON.
- `ai_secrets`: stores provider API keys and model names server-side.
- `ai_runs`: stores run metadata only: provider, model, prompt length, response length, success flag, and sanitized error.

The frontend never receives full API key values. It only receives configured status and masked key previews.

## AI integration contract

Endpoints:

- `GET /api/workspace`
- `PUT /api/workspace`
- `GET /api/storage`
- `GET /api/secrets`
- `POST /api/secrets`
- `DELETE /api/secrets/{provider}`
- `POST /api/ai/generate`

OpenAI uses the Responses API endpoint.
Gemini uses the `generateContent` endpoint with the `x-goog-api-key` header.

## Known limitations

- The local server is required for SQLite and Automatic Mode.
- Without the local server, the app still works in Manual Mode with IndexedDB fallback.
- API keys created outside the app are not automatically available. Paste them inside Settings on your local machine only.
- No direct YouTube/Facebook/TikTok upload automation yet.
- Browser screenshot QA was blocked by the runtime policy in this environment; API, build, TypeScript and domain checks passed.
