# Status

Status keeps a team's approved incident states and the exact customer-facing wording, including which cause and which timeline may be stated, then lets an assistant read that set before it posts an update.

An assistant can store and look up what the team has approved. It must refuse an ETA, a cause, or a workaround that is not in the approved set. It does not invent a softer promise.

It works with ChatGPT, Claude, Gemini, Grok, and Cursor, plus any other MCP client that can do Streamable HTTP and OAuth. It is not a ChatGPT-only plugin.

Sign in with your Status account when the assistant opens OAuth. Do not paste an API key or password into a header. Incident tools need Pro or an active trial. The trial is 14 days, then Pro. Checkout shows the plan terms. This page does not print a price.

## What the assistant can do

After you approve the connection, the server exposes these tools:

- list_status_boards
- create_status_board
- save_incident_state
- search_incident_states
- save_approved_cause
- list_approved_causes
- save_statement_limit
- list_statement_limits
- save_approved_statement
- list_approved_statements
- evaluate_customer_update
- evaluate_audience
- get_status_context

`evaluate_customer_update` returns APPROVED only for wording, a cause, a timeline, or a workaround already stored. Otherwise it returns REFUSED and the assistant must not state that ETA, cause, or workaround. `evaluate_audience` refuses a channel or audience that is outside the saved limit. The assistant only calls these tools when you and the host allow it.

## Connect

Run the server and use its `/mcp` path. With the default local base, that is `http://localhost:3000/mcp`. A deployed host uses the same path on `APP_BASE_URL`.

Cursor, in `~/.cursor/mcp.json` or a project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "status": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Claude Code:

```bash
claude mcp add --transport http status http://localhost:3000/mcp
```

Do not pass an Authorization header. Other clients add the same URL, choose OAuth, and leave client id and secret empty. Status supports dynamic client registration. Full steps for ChatGPT, Claude, Gemini, Grok, and Cursor are on the server's `/connect` page.

When stdin is a terminal, Status serves Streamable HTTP. When stdin is not a terminal, it also speaks MCP on stdio. That is the same choice continuity-mcp makes, so a launcher such as Glama can attach stdin.

Registry metadata for this server is in `server.json` (`io.github.LAHutchins91/status`).

## Run

```bash
npm ci
npm test
npm run build
npm start
```

Hosted accounts use Supabase for sign-in and incident storage, and Stripe for the 14-day trial and Pro. Copy `.env.example` to `.env` and set the variables there. `supabase/schema.sql` creates the tables. Stripe price ids belong in the environment. Status never displays the amount.

Local stdio, with no account configured, stores one operator's incident wording under `STATUS_DATA_DIR` (or the system temp directory). HTTP tool calls still require OAuth and an active trial or Pro.

```bash
docker build -t status-mcp .
docker run --rm -p 3000:3000 status-mcp
```

A container without a terminal on stdin speaks MCP on stdio and still listens on port 3000.
