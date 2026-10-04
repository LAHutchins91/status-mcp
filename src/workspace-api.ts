import type { Express, Request, Response } from "express";
import { z } from "zod";
import { publicError } from "./lib/errors.js";
import { saveApprovedCause, saveApprovedStatement, saveIncidentState, saveStatementLimit } from "./lib/records.js";
import type { StatusStore } from "./lib/store.js";

export type Account = { user: { id: string }; token: string };
export type SubscriptionState = "ok" | "inactive" | "error";

export type WorkspaceDeps = {
  appBaseUrl: string;
  authenticate: (req: Request) => Promise<Account>;
  subscriptionState: (userId: string, token: string) => Promise<SubscriptionState>;
  createStore: (userId: string, token: string) => StatusStore;
  allow: (key: string) => boolean;
};

const boardId = z.string().uuid();
const status = z.enum(["APPROVED", "RETIRED"]).default("APPROVED");

const stateBody = z.object({
  boardId,
  name: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(500),
  wording: z.string().trim().min(1).max(8000),
  status,
  expectedRevision: z.number().int().positive().optional()
});
const causeBody = z.object({
  boardId,
  name: z.string().trim().min(1).max(200),
  matchTerms: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
  decision: z.enum(["STATE", "WITHHOLD"]),
  wording: z.string().trim().min(1).max(4000),
  status,
  expectedRevision: z.number().int().positive().optional()
});
const limitBody = z.object({
  boardId,
  name: z.string().trim().min(1).max(200),
  channel: z.string().trim().min(1).max(80),
  audienceLadder: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
  maxAudience: z.string().trim().min(1).max(80),
  allowCause: z.boolean().default(false),
  allowTimeline: z.boolean().default(false),
  allowWorkaround: z.boolean().default(false),
  notes: z.string().trim().max(4000).optional(),
  status,
  expectedRevision: z.number().int().positive().optional()
});
const statementBody = z.object({
  boardId,
  kind: z.enum(["TIMELINE", "WORKAROUND"]),
  name: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(2000),
  status,
  expectedRevision: z.number().int().positive().optional()
});

function sendFailure(res: Response, error: unknown) {
  const safe = publicError(error);
  res.status(safe.status).json({ error: safe.error });
}

export function installWorkspaceApi(app: Express, deps: WorkspaceDeps) {
  async function open(req: Request, res: Response): Promise<{ store: StatusStore } | null> {
    if (!deps.allow(`workspace:${req.ip}`)) {
      res.status(429).json({ error: "Too many requests. Retry in one minute." });
      return null;
    }
    let account: Account;
    try {
      account = await deps.authenticate(req);
    } catch {
      res.set("WWW-Authenticate", `Bearer resource_metadata="${deps.appBaseUrl}/.well-known/oauth-protected-resource/mcp"`);
      res.status(401).json({ error: "Sign in to Status to use incident tools." });
      return null;
    }
    const state = await deps.subscriptionState(account.user.id, account.token);
    if (state === "error") {
      res.status(503).json({ error: "Could not verify your subscription. Please retry." });
      return null;
    }
    if (state === "inactive") {
      res.status(403).json({ error: "A Status Pro subscription or active trial is required.", access_information: `${deps.appBaseUrl}/access` });
      return null;
    }
    return { store: deps.createStore(account.user.id, account.token) };
  }

  app.get("/api/workspace/boards", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const offset = z.coerce.number().int().min(0).max(100000).catch(0).parse(req.query.offset);
    res.json({ data: await ctx.store.listBoards(offset) });
  });

  app.post("/api/workspace/boards", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = z.object({ name: z.string().trim().min(1).max(200), description: z.string().trim().max(4000).optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Enter a board name." });
    try {
      res.json({ data: await ctx.store.createBoard(body.data.name, body.data.description ?? null) });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.get("/api/workspace/export", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({ boardId }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Board not found" });
    const data = await ctx.store.exportBoard(parsed.data.boardId);
    if (!data) return res.status(404).json({ error: "Board not found" });
    res.json({ data });
  });

  app.delete("/api/workspace/boards/:boardId", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({ boardId }).safeParse(req.params);
    if (!parsed.success) return res.status(404).json({ error: "Board not found" });
    const removed = await ctx.store.deleteBoard(parsed.data.boardId);
    if (!removed) return res.status(404).json({ error: "Board not found" });
    res.json({ data: { deleted: true } });
  });

  app.get("/api/workspace/states", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({
      boardId,
      query: z.string().max(200).optional(),
      offset: z.coerce.number().int().min(0).max(100000).optional(),
      includeRetired: z.enum(["true", "false"]).optional()
    }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Board not found" });
    try {
      const rows = await ctx.store.listStates(parsed.data.boardId, parsed.data.offset ?? 0, parsed.data.query ?? "", parsed.data.includeRetired === "true");
      res.json({ data: rows });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.post("/api/workspace/states", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = stateBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Check the incident wording and try again." });
    try {
      res.json({ data: await saveIncidentState(ctx.store, body.data) });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.get("/api/workspace/causes", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({ boardId, includeRetired: z.enum(["true", "false"]).optional() }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Board not found" });
    res.json({ data: await ctx.store.listCauses(parsed.data.boardId, parsed.data.includeRetired === "true") });
  });

  app.post("/api/workspace/causes", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = causeBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Cause rule needs a specific incident phrase" });
    try {
      res.json({ data: await saveApprovedCause(ctx.store, body.data) });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.get("/api/workspace/statement-limits", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({ boardId, includeRetired: z.enum(["true", "false"]).optional() }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Board not found" });
    res.json({ data: await ctx.store.listLimits(parsed.data.boardId, parsed.data.includeRetired === "true") });
  });

  app.post("/api/workspace/statement-limits", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = limitBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Audience is not on the ladder" });
    try {
      res.json({ data: await saveStatementLimit(ctx.store, body.data) });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.get("/api/workspace/statements", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({
      boardId,
      kind: z.enum(["TIMELINE", "WORKAROUND"]).optional(),
      includeRetired: z.enum(["true", "false"]).optional()
    }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Board not found" });
    res.json({ data: await ctx.store.listStatements(parsed.data.boardId, parsed.data.kind, parsed.data.includeRetired === "true") });
  });

  app.post("/api/workspace/statements", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = statementBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Check the approved statement and try again." });
    try {
      res.json({ data: await saveApprovedStatement(ctx.store, body.data) });
    } catch (error) {
      sendFailure(res, error);
    }
  });
}
