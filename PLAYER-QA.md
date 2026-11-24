# Jensen player polish — November 24, 2026

## User stories verified locally

- As a viewer, I can open a clearly labeled show with a prominent Start the show button and four scene choices. Verified visually in Chrome.
- As a viewer, I can watch the cold open transition automatically at 6.25 seconds to stage, and enable automatic locker-room playback after stage ends. Verified in Chrome against the real local Node MCP server, with matching stage and locker-room event receipts.
- As a viewer, I can select the wolf speech and see it play while the server emits the wolf event. Verified in Chrome.
- As a viewer, I do not wait for an MCP tool to transfer a whole video. All four video elements had readyState 4 and their complete durations buffered before the first transition. Tool responses contain only media URLs. A regression test verifies playback starts before the pending event response and repeated time updates do not duplicate the cue.
- As a viewer, I see a retryable error if event emission fails while playback continues. Verified by regression test with a failed cue response.
- As a server user, my event subscriptions remain isolated and require valid bearer credentials. Verified with the local Cloudflare Worker isolation test, including rejection of missing and forged credentials.
- As a browser, I can request byte ranges from all four public clips. Verified on both Node and Cloudflare Worker implementations.

The browser preview used a minimal local MCP Apps bridge and actual MCP calls. Its event receipts used poll delivery. This is not a fresh production webhook or MCPJam sandbox verification of the changed player. The previous production player passed all three webhook-to-agent replies; production needs a new show after this update is deployed.

## MCPJam issues tracked only — no client changes

1. A chat request to subscribe is not fulfilled by the Jensen tools. The tested workaround is Playground Events → Connect event → Webhook. The server should not pretend it created a client subscription.
2. Received event turns expose lengthy instructions and raw JSON in the chat, obscuring the scene announcement.
3. After successful wolf delivery the listener displayed both Listening and fetch failed. Cause and recovery are unverified.
4. Events received while the agent is busy are explicitly skipped by the client; turns stop when leaving Playground. This is foreground behavior, not a verified background Trigger run.
5. Authentication form confusion: the Bearer Token input prepends `Bearer ` itself. Pasting a complete header value there produces the wrong credential. Prior successful production QA configured a custom Authorization header via CLI/API with OAuth off; it did not test this form.

## Commands

- `npm run typecheck`
- `npm --prefix cloudflare run check`
- `npm run test:unit`
- `PORT=18895 npm run test:show` against `PORT=18895 JENSEN_SHOW=1 npm start`
- `npm run test:isolation -- http://127.0.0.1:18897/mcp` against the local Worker
- `npm --prefix cloudflare run build`

No Inspector, backend, or webapp code was changed.
