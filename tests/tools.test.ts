import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { FileStatusStore } from "../src/lib/store.js";
import { createStatusServer } from "../src/status-tools.js";

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function connected() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "status-test-"));
  const store = new FileStatusStore(dir, "local");
  const server = createStatusServer(store);
  const client = new Client({ name: "status-test", version: "0.0.1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  servers.push(client, server);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.find((item) => item.type === "text");
  const payload = text && "text" in text ? JSON.parse(text.text) : null;
  return { result, payload };
}

describe("status tools", () => {
  it("lists the incident wording tools", async () => {
    const client = await connected();
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "create_status_board",
      "evaluate_audience",
      "evaluate_customer_update",
      "get_status_context",
      "list_approved_causes",
      "list_approved_statements",
      "list_statement_limits",
      "list_status_boards",
      "save_approved_cause",
      "save_approved_statement",
      "save_incident_state",
      "save_statement_limit",
      "search_incident_states"
    ]);
  });

  it("stores incident wording and refuses an unapproved cause, timeline, and workaround", async () => {
    const client = await connected();
    const board = await call(client, "create_status_board", { name: "Acme status" });
    const boardId = board.payload.id as string;
    const wording = "We are investigating checkout errors. We have not confirmed a cause or a timeline.";
    await call(client, "save_incident_state", {
      boardId,
      name: "Investigating",
      summary: "Checkout errors in one region",
      wording
    });
    await call(client, "save_approved_cause", {
      boardId,
      name: "Checkout database",
      matchTerms: ["checkout database"],
      decision: "STATE",
      wording: "Checkout errors are limited to the primary database in one region."
    });
    await call(client, "save_statement_limit", {
      boardId,
      name: "Status page",
      channel: "status-page",
      audienceLadder: ["internal", "customers"],
      maxAudience: "customers",
      allowCause: true,
      allowTimeline: false,
      allowWorkaround: false
    });
    await call(client, "save_approved_statement", {
      boardId,
      kind: "TIMELINE",
      name: "No restoration time",
      statement: "We do not have a restoration time."
    });

    const lookup = await call(client, "search_incident_states", { boardId, query: "checkout errors" });
    expect(lookup.payload.states).toHaveLength(1);
    expect(lookup.payload.gap).toBeNull();

    const missing = await call(client, "search_incident_states", { boardId, query: "satellite warranty" });
    expect(missing.payload.states).toHaveLength(0);
    expect(missing.payload.gap).toMatch(/Do not invent/);

    const inventedCause = await call(client, "evaluate_customer_update", {
      boardId,
      kind: "CAUSE",
      proposal: "The checkout database crashed and will be back in 2 hours."
    });
    expect(inventedCause.payload.decision).toBe("REFUSED");
    expect(inventedCause.payload.statesCause).toBe(false);

    const timeline = await call(client, "evaluate_customer_update", {
      boardId,
      kind: "TIMELINE",
      proposal: "This will be fixed by Friday."
    });
    expect(timeline.payload.decision).toBe("REFUSED");

    const workaround = await call(client, "evaluate_customer_update", {
      boardId,
      kind: "WORKAROUND",
      proposal: "Customers can retry on the mobile app."
    });
    expect(workaround.payload.decision).toBe("REFUSED");

    const blockedTimeline = await call(client, "evaluate_customer_update", {
      boardId,
      kind: "TIMELINE",
      proposal: "We do not have a restoration time.",
      channel: "status-page"
    });
    expect(blockedTimeline.payload.decision).toBe("REFUSED");
    expect(blockedTimeline.payload.sayOnly).toBeNull();

    const approved = await call(client, "evaluate_customer_update", {
      boardId,
      kind: "WORDING",
      proposal: wording
    });
    expect(approved.payload.decision).toBe("APPROVED");
    expect(approved.payload.sayOnly).toBe(wording);

    const audience = await call(client, "evaluate_audience", {
      boardId,
      channel: "status-page",
      action: "PUBLISH",
      targetAudience: "public"
    });
    expect(audience.payload.decision).toBe("REFUSED");

    const context = await call(client, "get_status_context", { boardId, question: "What is happening with checkout?" });
    expect(context.payload.incident_states).toHaveLength(1);
    expect(context.payload.guidance).toMatch(/REFUSED/);
  });
});
