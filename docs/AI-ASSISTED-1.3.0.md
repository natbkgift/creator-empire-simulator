# AI Assisted v1.3.0

AI Assisted means the app calls OpenAI or Gemini when the user explicitly presses Generate. It is not unattended publishing.

Server guardrails:

- provider credentials from environment or session-only memory
- no plaintext key persistence
- bounded output tokens
- bounded request timeout
- retries only for transient failures
- daily and monthly cost ceilings
- provider/model/token/cost metadata ledger
- no prompt or response body stored in `ai_runs`
- OpenAI Responses uses `store=false`

Model prices are editable settings rather than hard-coded volatile product prices. Cost enforcement uses the configured rates and the provider-reported token usage.
