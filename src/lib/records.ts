import { assertSpecificMatchTerms } from "./status.js";
import type {
  ApprovedStatementRecord,
  CauseDecision,
  CauseRecord,
  IncidentStateRecord,
  RecordStatus,
  StatementKind,
  StatementLimitRecord,
  StatusStore
} from "./store.js";

type SaveState = {
  boardId: string;
  name: string;
  summary: string;
  wording: string;
  status: RecordStatus;
  expectedRevision?: number;
};

type SaveCause = {
  boardId: string;
  name: string;
  matchTerms: string[];
  decision: CauseDecision;
  wording: string;
  status: RecordStatus;
  expectedRevision?: number;
};

type SaveLimit = {
  boardId: string;
  name: string;
  channel: string;
  audienceLadder: string[];
  maxAudience: string;
  allowCause: boolean;
  allowTimeline: boolean;
  allowWorkaround: boolean;
  notes?: string;
  status: RecordStatus;
  expectedRevision?: number;
};

type SaveStatement = {
  boardId: string;
  kind: StatementKind;
  name: string;
  statement: string;
  status: RecordStatus;
  expectedRevision?: number;
};

function sameTerms(left: string[], right: string[]): boolean {
  const normalize = (values: string[]) => values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const a = normalize(left);
  const b = normalize(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameLadder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function requireBoard(store: StatusStore, boardId: string) {
  const board = await store.getBoard(boardId);
  if (!board) throw new Error("Board not found");
  return board;
}

export async function saveIncidentState(store: StatusStore, input: SaveState): Promise<IncidentStateRecord> {
  await requireBoard(store, input.boardId);
  const existing = await store.findState(input.boardId, input.name);
  const next = { name: input.name.trim(), summary: input.summary.trim(), wording: input.wording.trim(), status: input.status };
  if (existing && existing.name === next.name && existing.summary === next.summary && existing.wording === next.wording && existing.status === next.status) {
    return existing;
  }
  const now = new Date().toISOString();
  if (existing) {
    if (input.expectedRevision !== existing.revision) throw new Error("Revision conflict");
    const saved = await store.updateState({ ...existing, ...next, revision: existing.revision + 1, updatedAt: now }, existing.revision);
    if (!saved) throw new Error("Revision conflict");
    await store.touchBoard(input.boardId);
    return saved;
  }
  if (input.expectedRevision) throw new Error("Revision conflict");
  const created = await store.insertState({ id: crypto.randomUUID(), boardId: input.boardId, ...next, revision: 1, updatedAt: now });
  await store.touchBoard(input.boardId);
  return created;
}

export async function saveApprovedCause(store: StatusStore, input: SaveCause): Promise<CauseRecord> {
  await requireBoard(store, input.boardId);
  const matchTerms = input.matchTerms.map((term) => term.trim()).filter(Boolean);
  assertSpecificMatchTerms(matchTerms);
  const existing = await store.findCause(input.boardId, input.name);
  const next = {
    name: input.name.trim(),
    matchTerms,
    decision: input.decision,
    wording: input.wording.trim(),
    status: input.status
  };
  if (
    existing &&
    existing.name === next.name &&
    sameTerms(existing.matchTerms, next.matchTerms) &&
    existing.decision === next.decision &&
    existing.wording === next.wording &&
    existing.status === next.status
  ) {
    return existing;
  }
  const now = new Date().toISOString();
  if (existing) {
    if (input.expectedRevision !== existing.revision) throw new Error("Revision conflict");
    const saved = await store.updateCause({ ...existing, ...next, revision: existing.revision + 1, updatedAt: now }, existing.revision);
    if (!saved) throw new Error("Revision conflict");
    await store.touchBoard(input.boardId);
    return saved;
  }
  if (input.expectedRevision) throw new Error("Revision conflict");
  const created = await store.insertCause({ id: crypto.randomUUID(), boardId: input.boardId, ...next, revision: 1, updatedAt: now });
  await store.touchBoard(input.boardId);
  return created;
}

export async function saveStatementLimit(store: StatusStore, input: SaveLimit): Promise<StatementLimitRecord> {
  await requireBoard(store, input.boardId);
  const audienceLadder = input.audienceLadder.map((tier) => tier.trim()).filter(Boolean);
  const maxAudience = input.maxAudience.trim();
  if (!audienceLadder.length || !audienceLadder.includes(maxAudience)) throw new Error("Audience is not on the ladder");
  const existing = await store.findLimit(input.boardId, input.channel);
  const next = {
    name: input.name.trim(),
    channel: input.channel.trim().toLocaleLowerCase(),
    audienceLadder,
    maxAudience,
    allowCause: input.allowCause,
    allowTimeline: input.allowTimeline,
    allowWorkaround: input.allowWorkaround,
    notes: input.notes?.trim() ?? "",
    status: input.status
  };
  if (
    existing &&
    existing.name === next.name &&
    existing.channel === next.channel &&
    sameLadder(existing.audienceLadder, next.audienceLadder) &&
    existing.maxAudience === next.maxAudience &&
    existing.allowCause === next.allowCause &&
    existing.allowTimeline === next.allowTimeline &&
    existing.allowWorkaround === next.allowWorkaround &&
    existing.notes === next.notes &&
    existing.status === next.status
  ) {
    return existing;
  }
  const now = new Date().toISOString();
  if (existing) {
    if (input.expectedRevision !== existing.revision) throw new Error("Revision conflict");
    const saved = await store.updateLimit({ ...existing, ...next, revision: existing.revision + 1, updatedAt: now }, existing.revision);
    if (!saved) throw new Error("Revision conflict");
    await store.touchBoard(input.boardId);
    return saved;
  }
  if (input.expectedRevision) throw new Error("Revision conflict");
  const created = await store.insertLimit({ id: crypto.randomUUID(), boardId: input.boardId, ...next, revision: 1, updatedAt: now });
  await store.touchBoard(input.boardId);
  return created;
}

export async function saveApprovedStatement(store: StatusStore, input: SaveStatement): Promise<ApprovedStatementRecord> {
  await requireBoard(store, input.boardId);
  const existing = await store.findStatement(input.boardId, input.kind, input.name);
  const next = { kind: input.kind, name: input.name.trim(), statement: input.statement.trim(), status: input.status };
  if (existing && existing.kind === next.kind && existing.name === next.name && existing.statement === next.statement && existing.status === next.status) {
    return existing;
  }
  const now = new Date().toISOString();
  if (existing) {
    if (input.expectedRevision !== existing.revision) throw new Error("Revision conflict");
    const saved = await store.updateStatement({ ...existing, ...next, revision: existing.revision + 1, updatedAt: now }, existing.revision);
    if (!saved) throw new Error("Revision conflict");
    await store.touchBoard(input.boardId);
    return saved;
  }
  if (input.expectedRevision) throw new Error("Revision conflict");
  const created = await store.insertStatement({ id: crypto.randomUUID(), boardId: input.boardId, ...next, revision: 1, updatedAt: now });
  await store.touchBoard(input.boardId);
  return created;
}
