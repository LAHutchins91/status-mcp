import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type RecordStatus = "APPROVED" | "RETIRED";
export type CauseDecision = "STATE" | "WITHHOLD";
export type StatementKind = "TIMELINE" | "WORKAROUND";

export type StatusBoardRecord = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
};

export type IncidentStateRecord = {
  id: string;
  boardId: string;
  name: string;
  summary: string;
  wording: string;
  status: RecordStatus;
  revision: number;
  updatedAt: string;
};

export type CauseRecord = {
  id: string;
  boardId: string;
  name: string;
  matchTerms: string[];
  decision: CauseDecision;
  wording: string;
  status: RecordStatus;
  revision: number;
  updatedAt: string;
};

export type StatementLimitRecord = {
  id: string;
  boardId: string;
  name: string;
  channel: string;
  audienceLadder: string[];
  maxAudience: string;
  allowCause: boolean;
  allowTimeline: boolean;
  allowWorkaround: boolean;
  notes: string;
  status: RecordStatus;
  revision: number;
  updatedAt: string;
};

export type ApprovedStatementRecord = {
  id: string;
  boardId: string;
  kind: StatementKind;
  name: string;
  statement: string;
  status: RecordStatus;
  revision: number;
  updatedAt: string;
};

export type StatusExport = {
  board: StatusBoardRecord;
  incidentStates: IncidentStateRecord[];
  causes: CauseRecord[];
  statementLimits: StatementLimitRecord[];
  statements: ApprovedStatementRecord[];
};

export type StatusDb = <T>(pathname: string, options?: RequestInit) => Promise<T>;

export interface StatusStore {
  listBoards(offset: number): Promise<StatusBoardRecord[]>;
  createBoard(name: string, description: string | null): Promise<StatusBoardRecord>;
  getBoard(boardId: string): Promise<StatusBoardRecord | null>;
  touchBoard(boardId: string): Promise<void>;
  deleteBoard(boardId: string): Promise<boolean>;
  exportBoard(boardId: string): Promise<StatusExport | null>;
  findState(boardId: string, name: string): Promise<IncidentStateRecord | null>;
  insertState(row: IncidentStateRecord): Promise<IncidentStateRecord>;
  updateState(row: IncidentStateRecord, expectedRevision: number): Promise<IncidentStateRecord | null>;
  listStates(boardId: string, offset: number, query: string, includeRetired: boolean): Promise<IncidentStateRecord[]>;
  listStatesForRank(boardId: string): Promise<IncidentStateRecord[]>;
  findCause(boardId: string, name: string): Promise<CauseRecord | null>;
  insertCause(row: CauseRecord): Promise<CauseRecord>;
  updateCause(row: CauseRecord, expectedRevision: number): Promise<CauseRecord | null>;
  listCauses(boardId: string, includeRetired: boolean): Promise<CauseRecord[]>;
  findLimit(boardId: string, channel: string): Promise<StatementLimitRecord | null>;
  insertLimit(row: StatementLimitRecord): Promise<StatementLimitRecord>;
  updateLimit(row: StatementLimitRecord, expectedRevision: number): Promise<StatementLimitRecord | null>;
  listLimits(boardId: string, includeRetired: boolean): Promise<StatementLimitRecord[]>;
  findStatement(boardId: string, kind: StatementKind, name: string): Promise<ApprovedStatementRecord | null>;
  insertStatement(row: ApprovedStatementRecord): Promise<ApprovedStatementRecord>;
  updateStatement(row: ApprovedStatementRecord, expectedRevision: number): Promise<ApprovedStatementRecord | null>;
  listStatements(boardId: string, kind: StatementKind | undefined, includeRetired: boolean): Promise<ApprovedStatementRecord[]>;
}

type FileShape = {
  boards: StatusBoardRecord[];
  incidentStates: IncidentStateRecord[];
  causes: CauseRecord[];
  statementLimits: StatementLimitRecord[];
  statements: ApprovedStatementRecord[];
};

const emptyFile = (): FileShape => ({ boards: [], incidentStates: [], causes: [], statementLimits: [], statements: [] });

function sameText(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function ownerFile(ownerId: string): string {
  const safe = /^[a-zA-Z0-9_-]{1,80}$/.test(ownerId) ? ownerId : "local";
  return `${safe}.json`;
}

export class FileStatusStore implements StatusStore {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly directory: string, private readonly ownerId: string) {}

  private async locked<T>(fn: (data: FileShape) => Promise<T> | T): Promise<T> {
    const run = this.chain.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const file = path.join(this.directory, ownerFile(this.ownerId));
      let data = emptyFile();
      try {
        const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<FileShape>;
        data = {
          boards: parsed.boards ?? [],
          incidentStates: parsed.incidentStates ?? [],
          causes: parsed.causes ?? [],
          statementLimits: parsed.statementLimits ?? [],
          statements: parsed.statements ?? []
        };
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
        if (code !== "ENOENT") throw error;
      }
      const result = await fn(data);
      const next = path.join(this.directory, `${ownerFile(this.ownerId)}.tmp`);
      await writeFile(next, JSON.stringify(data));
      await rename(next, file);
      return result;
    });
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  listBoards(offset: number) {
    return this.locked((data) => data.boards.slice().sort(byUpdated).slice(offset, offset + 50).map(clone));
  }
  createBoard(name: string, description: string | null) {
    return this.locked((data) => {
      const row: StatusBoardRecord = { id: crypto.randomUUID(), name, description, updatedAt: new Date().toISOString() };
      data.boards.push(row);
      return clone(row);
    });
  }
  getBoard(boardId: string) {
    return this.locked((data) => clone(data.boards.find((board) => board.id === boardId) ?? null));
  }
  touchBoard(boardId: string) {
    return this.locked((data) => {
      const board = data.boards.find((item) => item.id === boardId);
      if (board) board.updatedAt = new Date().toISOString();
    });
  }
  deleteBoard(boardId: string) {
    return this.locked((data) => {
      const before = data.boards.length;
      data.boards = data.boards.filter((board) => board.id !== boardId);
      data.incidentStates = data.incidentStates.filter((row) => row.boardId !== boardId);
      data.causes = data.causes.filter((row) => row.boardId !== boardId);
      data.statementLimits = data.statementLimits.filter((row) => row.boardId !== boardId);
      data.statements = data.statements.filter((row) => row.boardId !== boardId);
      return data.boards.length !== before;
    });
  }
  exportBoard(boardId: string) {
    return this.locked((data) => {
      const board = data.boards.find((item) => item.id === boardId);
      if (!board) return null;
      return {
        board: clone(board),
        incidentStates: data.incidentStates.filter((row) => row.boardId === boardId).map(clone),
        causes: data.causes.filter((row) => row.boardId === boardId).map(clone),
        statementLimits: data.statementLimits.filter((row) => row.boardId === boardId).map(clone),
        statements: data.statements.filter((row) => row.boardId === boardId).map(clone)
      };
    });
  }
  findState(boardId: string, name: string) {
    return this.locked((data) => clone(data.incidentStates.find((row) => row.boardId === boardId && sameText(row.name, name)) ?? null));
  }
  insertState(row: IncidentStateRecord) {
    return this.locked((data) => { data.incidentStates.push(clone(row)); return clone(row); });
  }
  updateState(row: IncidentStateRecord, expectedRevision: number) {
    return this.locked((data) => replace(data.incidentStates, row, expectedRevision));
  }
  listStates(boardId: string, offset: number, query: string, includeRetired: boolean) {
    return this.locked((data) => sliceMatches(data.incidentStates, boardId, includeRetired, query, ["name", "summary", "wording"], offset));
  }
  listStatesForRank(boardId: string) {
    return this.locked((data) => data.incidentStates.filter((row) => row.boardId === boardId && row.status === "APPROVED").slice(0, 1000).map(clone));
  }
  findCause(boardId: string, name: string) {
    return this.locked((data) => clone(data.causes.find((row) => row.boardId === boardId && sameText(row.name, name)) ?? null));
  }
  insertCause(row: CauseRecord) {
    return this.locked((data) => { data.causes.push(clone(row)); return clone(row); });
  }
  updateCause(row: CauseRecord, expectedRevision: number) {
    return this.locked((data) => replace(data.causes, row, expectedRevision));
  }
  listCauses(boardId: string, includeRetired: boolean) {
    return this.locked((data) => data.causes.filter((row) => row.boardId === boardId && (includeRetired || row.status === "APPROVED")).map(clone));
  }
  findLimit(boardId: string, channel: string) {
    return this.locked((data) => clone(data.statementLimits.find((row) => row.boardId === boardId && sameText(row.channel, channel)) ?? null));
  }
  insertLimit(row: StatementLimitRecord) {
    return this.locked((data) => { data.statementLimits.push(clone(row)); return clone(row); });
  }
  updateLimit(row: StatementLimitRecord, expectedRevision: number) {
    return this.locked((data) => replace(data.statementLimits, row, expectedRevision));
  }
  listLimits(boardId: string, includeRetired: boolean) {
    return this.locked((data) => data.statementLimits.filter((row) => row.boardId === boardId && (includeRetired || row.status === "APPROVED")).map(clone));
  }
  findStatement(boardId: string, kind: StatementKind, name: string) {
    return this.locked((data) => clone(data.statements.find((row) => row.boardId === boardId && row.kind === kind && sameText(row.name, name)) ?? null));
  }
  insertStatement(row: ApprovedStatementRecord) {
    return this.locked((data) => { data.statements.push(clone(row)); return clone(row); });
  }
  updateStatement(row: ApprovedStatementRecord, expectedRevision: number) {
    return this.locked((data) => replace(data.statements, row, expectedRevision));
  }
  listStatements(boardId: string, kind: StatementKind | undefined, includeRetired: boolean) {
    return this.locked((data) => data.statements.filter((row) => row.boardId === boardId && (!kind || row.kind === kind) && (includeRetired || row.status === "APPROVED")).map(clone));
  }
}

function byUpdated(a: { updatedAt: string }, b: { updatedAt: string }) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function clone<T>(value: T): T {
  return value == null ? value : structuredClone(value);
}

function replace<T extends { id: string; revision: number }>(rows: T[], row: T, expectedRevision: number): T | null {
  const index = rows.findIndex((item) => item.id === row.id && item.revision === expectedRevision);
  if (index < 0) return null;
  rows[index] = clone(row);
  return clone(row);
}

function sliceMatches<T extends { boardId: string; status: RecordStatus }>(
  rows: T[],
  boardId: string,
  includeRetired: boolean,
  query: string,
  fields: Array<keyof T>,
  offset: number
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return rows
    .filter((row) => row.boardId === boardId && (includeRetired || row.status === "APPROVED"))
    .filter((row) => !needle || fields.some((field) => String(row[field]).toLocaleLowerCase().includes(needle)))
    .slice(offset, offset + 50)
    .map(clone);
}

type Row = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}
function asBoolean(value: unknown): boolean {
  return value === true;
}
function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function asStatus(value: unknown): RecordStatus {
  return value === "RETIRED" ? "RETIRED" : "APPROVED";
}

function mapBoard(row: Row): StatusBoardRecord {
  return { id: asString(row.id), name: asString(row.name), description: asStringOrNull(row.description), updatedAt: asString(row.updated_at) };
}
function mapState(row: Row): IncidentStateRecord {
  return {
    id: asString(row.id), boardId: asString(row.board_id), name: asString(row.name), summary: asString(row.summary),
    wording: asString(row.wording), status: asStatus(row.status), revision: asNumber(row.revision), updatedAt: asString(row.updated_at)
  };
}
function mapCause(row: Row): CauseRecord {
  return {
    id: asString(row.id), boardId: asString(row.board_id), name: asString(row.name), matchTerms: asStrings(row.match_terms),
    decision: row.decision === "WITHHOLD" ? "WITHHOLD" : "STATE", wording: asString(row.wording),
    status: asStatus(row.status), revision: asNumber(row.revision), updatedAt: asString(row.updated_at)
  };
}
function mapLimit(row: Row): StatementLimitRecord {
  return {
    id: asString(row.id), boardId: asString(row.board_id), name: asString(row.name), channel: asString(row.channel),
    audienceLadder: asStrings(row.audience_ladder), maxAudience: asString(row.max_audience),
    allowCause: asBoolean(row.allow_cause), allowTimeline: asBoolean(row.allow_timeline), allowWorkaround: asBoolean(row.allow_workaround),
    notes: asString(row.notes), status: asStatus(row.status), revision: asNumber(row.revision), updatedAt: asString(row.updated_at)
  };
}
function mapStatement(row: Row): ApprovedStatementRecord {
  return {
    id: asString(row.id), boardId: asString(row.board_id), kind: row.kind === "WORKAROUND" ? "WORKAROUND" : "TIMELINE",
    name: asString(row.name), statement: asString(row.statement), status: asStatus(row.status),
    revision: asNumber(row.revision), updatedAt: asString(row.updated_at)
  };
}

function literalIlike(column: string, value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/[%_*]/g, "\\$&").replace(/"/g, '\\"');
  return `${column}=ilike.${encodeURIComponent(`"${escaped}"`)}`;
}

function searchOr(query: string, columns: string[]): string {
  if (!query) return "";
  const q = query.replace(/\\/g, "\\\\").replace(/[%_*]/g, "\\$&").replace(/"/g, '\\"');
  const clause = `(${columns.map((column) => `${column}.ilike."%${q}%"`).join(",")})`;
  return `&or=${encodeURIComponent(clause)}`;
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("23505") || message.toLowerCase().includes("duplicate")) throw new Error("Revision conflict");
    throw error;
  }
}

const returning = { Prefer: "return=representation" };

export class SupabaseStatusStore implements StatusStore {
  constructor(private readonly ownerId: string, private readonly db: StatusDb) {}

  private async rows<T>(pathname: string, map: (row: Row) => T, options?: RequestInit): Promise<T[]> {
    const result = await this.db<Row[]>(pathname, options);
    return (result ?? []).map(map);
  }

  async listBoards(offset: number) {
    return this.rows(`/rest/v1/status_boards?select=id,name,description,updated_at&order=updated_at.desc,id&limit=50&offset=${offset}`, mapBoard);
  }
  async createBoard(name: string, description: string | null) {
    const rows = await guard(() => this.rows("/rest/v1/status_boards", mapBoard, {
      method: "POST", headers: returning,
      body: JSON.stringify({ owner_id: this.ownerId, name, description, updated_at: new Date().toISOString() })
    }));
    if (!rows[0]) throw new Error("Board not found");
    return rows[0];
  }
  async getBoard(boardId: string) {
    const rows = await this.rows(`/rest/v1/status_boards?id=eq.${boardId}&select=id,name,description,updated_at`, mapBoard);
    return rows[0] ?? null;
  }
  async touchBoard(boardId: string) {
    await this.db(`/rest/v1/status_boards?id=eq.${boardId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ updated_at: new Date().toISOString() })
    });
  }
  async deleteBoard(boardId: string) {
    const board = await this.getBoard(boardId);
    if (!board) return false;
    await this.db(`/rest/v1/status_boards?id=eq.${boardId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return true;
  }
  async exportBoard(boardId: string) {
    const board = await this.getBoard(boardId);
    if (!board) return null;
    const [incidentStates, causes, statementLimits, statements] = await Promise.all([
      this.rows(`/rest/v1/incident_states?board_id=eq.${boardId}&select=*&order=updated_at.desc,id&limit=1000`, mapState),
      this.rows(`/rest/v1/approved_causes?board_id=eq.${boardId}&select=*&order=name,id&limit=200`, mapCause),
      this.rows(`/rest/v1/statement_limits?board_id=eq.${boardId}&select=*&order=channel,id&limit=100`, mapLimit),
      this.rows(`/rest/v1/approved_statements?board_id=eq.${boardId}&select=*&order=name,id&limit=200`, mapStatement)
    ]);
    return { board, incidentStates, causes, statementLimits, statements };
  }
  async findState(boardId: string, name: string) {
    const rows = await this.rows(`/rest/v1/incident_states?board_id=eq.${boardId}&${literalIlike("name", name)}&select=*&limit=1`, mapState);
    return rows[0] ?? null;
  }
  async insertState(row: IncidentStateRecord) {
    const rows = await guard(() => this.rows("/rest/v1/incident_states", mapState, { method: "POST", headers: returning, body: JSON.stringify(statePayload(row)) }));
    if (!rows[0]) throw new Error("Board not found");
    return rows[0];
  }
  async updateState(row: IncidentStateRecord, expectedRevision: number) {
    const rows = await this.rows(`/rest/v1/incident_states?id=eq.${row.id}&revision=eq.${expectedRevision}`, mapState, {
      method: "PATCH", headers: returning, body: JSON.stringify(statePayload(row))
    });
    return rows[0] ?? null;
  }
  listStates(boardId: string, offset: number, query: string, includeRetired: boolean) {
    const status = includeRetired ? "" : "&status=eq.APPROVED";
    return this.rows(`/rest/v1/incident_states?board_id=eq.${boardId}${status}&select=*&order=updated_at.desc,id&limit=50&offset=${offset}${searchOr(query, ["name", "summary", "wording"])}`, mapState);
  }
  listStatesForRank(boardId: string) {
    return this.rows(`/rest/v1/incident_states?board_id=eq.${boardId}&status=eq.APPROVED&select=*&order=updated_at.desc,id&limit=1000`, mapState);
  }
  async findCause(boardId: string, name: string) {
    const rows = await this.rows(`/rest/v1/approved_causes?board_id=eq.${boardId}&${literalIlike("name", name)}&select=*&limit=1`, mapCause);
    return rows[0] ?? null;
  }
  async insertCause(row: CauseRecord) {
    const rows = await guard(() => this.rows("/rest/v1/approved_causes", mapCause, { method: "POST", headers: returning, body: JSON.stringify(causePayload(row)) }));
    if (!rows[0]) throw new Error("Board not found");
    return rows[0];
  }
  async updateCause(row: CauseRecord, expectedRevision: number) {
    const rows = await this.rows(`/rest/v1/approved_causes?id=eq.${row.id}&revision=eq.${expectedRevision}`, mapCause, {
      method: "PATCH", headers: returning, body: JSON.stringify(causePayload(row))
    });
    return rows[0] ?? null;
  }
  listCauses(boardId: string, includeRetired: boolean) {
    const status = includeRetired ? "" : "&status=eq.APPROVED";
    return this.rows(`/rest/v1/approved_causes?board_id=eq.${boardId}${status}&select=*&order=name,id&limit=200`, mapCause);
  }
  async findLimit(boardId: string, channel: string) {
    const rows = await this.rows(`/rest/v1/statement_limits?board_id=eq.${boardId}&${literalIlike("channel", channel)}&select=*&limit=1`, mapLimit);
    return rows[0] ?? null;
  }
  async insertLimit(row: StatementLimitRecord) {
    const rows = await guard(() => this.rows("/rest/v1/statement_limits", mapLimit, { method: "POST", headers: returning, body: JSON.stringify(limitPayload(row)) }));
    if (!rows[0]) throw new Error("Board not found");
    return rows[0];
  }
  async updateLimit(row: StatementLimitRecord, expectedRevision: number) {
    const rows = await this.rows(`/rest/v1/statement_limits?id=eq.${row.id}&revision=eq.${expectedRevision}`, mapLimit, {
      method: "PATCH", headers: returning, body: JSON.stringify(limitPayload(row))
    });
    return rows[0] ?? null;
  }
  listLimits(boardId: string, includeRetired: boolean) {
    const status = includeRetired ? "" : "&status=eq.APPROVED";
    return this.rows(`/rest/v1/statement_limits?board_id=eq.${boardId}${status}&select=*&order=channel,id&limit=100`, mapLimit);
  }
  async findStatement(boardId: string, kind: StatementKind, name: string) {
    const rows = await this.rows(`/rest/v1/approved_statements?board_id=eq.${boardId}&kind=eq.${kind}&${literalIlike("name", name)}&select=*&limit=1`, mapStatement);
    return rows[0] ?? null;
  }
  async insertStatement(row: ApprovedStatementRecord) {
    const rows = await guard(() => this.rows("/rest/v1/approved_statements", mapStatement, { method: "POST", headers: returning, body: JSON.stringify(statementPayload(row)) }));
    if (!rows[0]) throw new Error("Board not found");
    return rows[0];
  }
  async updateStatement(row: ApprovedStatementRecord, expectedRevision: number) {
    const rows = await this.rows(`/rest/v1/approved_statements?id=eq.${row.id}&revision=eq.${expectedRevision}`, mapStatement, {
      method: "PATCH", headers: returning, body: JSON.stringify(statementPayload(row))
    });
    return rows[0] ?? null;
  }
  listStatements(boardId: string, kind: StatementKind | undefined, includeRetired: boolean) {
    const status = includeRetired ? "" : "&status=eq.APPROVED";
    const kindFilter = kind ? `&kind=eq.${kind}` : "";
    return this.rows(`/rest/v1/approved_statements?board_id=eq.${boardId}${kindFilter}${status}&select=*&order=name,id&limit=200`, mapStatement);
  }
}

function statePayload(row: IncidentStateRecord) {
  return { id: row.id, board_id: row.boardId, name: row.name, summary: row.summary, wording: row.wording, status: row.status, revision: row.revision, updated_at: row.updatedAt };
}
function causePayload(row: CauseRecord) {
  return {
    id: row.id, board_id: row.boardId, name: row.name, match_terms: row.matchTerms, decision: row.decision,
    wording: row.wording, status: row.status, revision: row.revision, updated_at: row.updatedAt
  };
}
function limitPayload(row: StatementLimitRecord) {
  return {
    id: row.id, board_id: row.boardId, name: row.name, channel: row.channel, audience_ladder: row.audienceLadder, max_audience: row.maxAudience,
    allow_cause: row.allowCause, allow_timeline: row.allowTimeline, allow_workaround: row.allowWorkaround,
    notes: row.notes, status: row.status, revision: row.revision, updated_at: row.updatedAt
  };
}
function statementPayload(row: ApprovedStatementRecord) {
  return { id: row.id, board_id: row.boardId, kind: row.kind, name: row.name, statement: row.statement, status: row.status, revision: row.revision, updated_at: row.updatedAt };
}
