import { describe, expect, it } from "vitest";
import {
  applyChannelLimit,
  assertSpecificMatchTerms,
  evaluateAudience,
  evaluateCause,
  evaluateStatement,
  evaluateWording,
  proposalAddsUnapprovedDetail,
  termIsSpecific
} from "../src/lib/status.js";
import type { ApprovedStatementRecord, CauseRecord, IncidentStateRecord, StatementLimitRecord } from "../src/lib/store.js";

const cause = (partial: Partial<CauseRecord>): CauseRecord => ({
  id: "cause-1",
  boardId: "board",
  name: "Checkout database",
  matchTerms: ["checkout database"],
  decision: "STATE",
  wording: "Checkout errors are limited to the primary database in one region.",
  status: "APPROVED",
  revision: 1,
  updatedAt: "2026-10-04T00:00:00.000Z",
  ...partial
});

const limit = (partial: Partial<StatementLimitRecord> = {}): StatementLimitRecord => ({
  id: "limit-1",
  boardId: "board",
  name: "Status page",
  channel: "status-page",
  audienceLadder: ["internal", "customers"],
  maxAudience: "customers",
  allowCause: false,
  allowTimeline: false,
  allowWorkaround: false,
  notes: "",
  status: "APPROVED",
  revision: 1,
  updatedAt: "2026-10-04T00:00:00.000Z",
  ...partial
});

const state = (wording: string): IncidentStateRecord => ({
  id: "state-1",
  boardId: "board",
  name: "Investigating",
  summary: "Checkout errors in one region",
  wording,
  status: "APPROVED",
  revision: 1,
  updatedAt: "2026-10-04T00:00:00.000Z"
});

const timeline = (statement: string): ApprovedStatementRecord => ({
  id: "statement-1",
  boardId: "board",
  kind: "TIMELINE",
  name: "No restoration time",
  statement,
  status: "APPROVED",
  revision: 1,
  updatedAt: "2026-10-04T00:00:00.000Z"
});

describe("cause decisions", () => {
  it("refuses a cause that is not in the approved set", () => {
    const verdict = evaluateCause("A network provider is down", [cause({})]);
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.statesCause).toBe(false);
    expect(verdict.sayOnly).toBeNull();
  });

  it("refuses invented wording even when the incident matches", () => {
    const verdict = evaluateCause("The checkout database failed and will be back in 2 hours", [cause({})]);
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.sayOnly).toBe("Checkout errors are limited to the primary database in one region.");
    expect(verdict.statesCause).toBe(false);
  });

  it("approves only the stored cause wording", () => {
    const wording = "Checkout errors are limited to the primary database in one region.";
    const verdict = evaluateCause(wording, [cause({})]);
    expect(verdict.decision).toBe("APPROVED");
    expect(verdict.statesCause).toBe(true);
    expect(verdict.sayOnly).toBe(wording);
  });

  it("does not let a generic outage word authorize anything", () => {
    expect(termIsSpecific("outage")).toBe(false);
    expect(() => assertSpecificMatchTerms(["cause"])).toThrow(/specific incident/);
    const verdict = evaluateCause("Please explain the outage", [cause({ matchTerms: ["outage"], wording: "Everything is down." })]);
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.sayOnly).toBeNull();
  });

  it("refuses a cause when the matching rule withholds it", () => {
    const verdict = evaluateCause("What caused the checkout database problem", [
      cause({ decision: "WITHHOLD", wording: "We have not confirmed a cause for the checkout database errors." })
    ]);
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.statesCause).toBe(false);
    expect(verdict.sayOnly).toContain("not confirmed a cause");
  });
});

describe("wording, timeline, and workaround decisions", () => {
  it("approves exact incident wording and refuses an ETA added to it", () => {
    const wording = "We are investigating checkout errors. We have not confirmed a cause or a timeline.";
    expect(evaluateWording(wording, [state(wording)]).decision).toBe("APPROVED");
    const refused = evaluateWording(`${wording} It will be fixed Friday.`, [state(wording)]);
    expect(refused.decision).toBe("REFUSED");
    expect(refused.sayOnly).toBeNull();
    expect(proposalAddsUnapprovedDetail(`${wording} It will be fixed Friday.`, wording)).toBe(true);
  });

  it("refuses a timeline that was never approved", () => {
    const verdict = evaluateStatement("TIMELINE", "We will restore service next Tuesday.", []);
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.approvedStatements).toEqual([]);
  });

  it("approves an exact workaround and refuses a different step", () => {
    const statement = "Customers can use the backup checkout page while we investigate.";
    const row: ApprovedStatementRecord = { ...timeline(statement), kind: "WORKAROUND", name: "Backup checkout" };
    expect(evaluateStatement("WORKAROUND", statement, [row]).decision).toBe("APPROVED");
    expect(evaluateStatement("WORKAROUND", "Customers can wait and retry in an hour.", [row]).decision).toBe("REFUSED");
  });
});

describe("audience", () => {
  it("refuses a timeline the channel is not allowed to state", () => {
    const policy = evaluateStatement("TIMELINE", "We do not have a restoration time.", [timeline("We do not have a restoration time.")]);
    const verdict = applyChannelLimit(policy, "status-page", limit());
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.sayOnly).toBeNull();
  });

  it("refuses an audience above the limit and approves one on the ladder", () => {
    const saved = limit({ allowCause: true });
    expect(evaluateAudience("PUBLISH", "public", saved).decision).toBe("REFUSED");
    expect(evaluateAudience("PUBLISH", "internal", saved).decision).toBe("APPROVED");
  });

  it("refuses a cause statement when no limit exists", () => {
    expect(evaluateAudience("STATE_CAUSE", undefined, null).decision).toBe("REFUSED");
  });
});
