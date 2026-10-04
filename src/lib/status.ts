import type { ApprovedStatementRecord, CauseRecord, IncidentStateRecord, StatementLimitRecord } from "./store.js";

export type UpdateKind = "WORDING" | "CAUSE" | "TIMELINE" | "WORKAROUND";

export type UpdateVerdict = {
  kind: UpdateKind;
  decision: "APPROVED" | "REFUSED";
  allowed: boolean;
  statesCause: boolean;
  sayOnly: string | null;
  matchedRuleId: string | null;
  matchedName: string | null;
  approvedStatements?: string[];
  moreApprovedMayExist?: boolean;
  audienceChecked: boolean;
  audienceDecision?: "APPROVED" | "REFUSED";
  instruction: string;
};

export type AudienceAction = "STATE_CAUSE" | "STATE_TIMELINE" | "STATE_WORKAROUND" | "PUBLISH";

export type AudienceVerdict = {
  decision: "APPROVED" | "REFUSED";
  allowed: boolean;
  action: AudienceAction;
  maxAudience: string | null;
  audienceLadder: string[];
  instruction: string;
};

const GENERIC_WORDS = new Set([
  "a", "an", "the", "and", "or", "to", "for", "of", "in", "on", "at", "by", "with",
  "cause", "causes", "outage", "outages", "incident", "incidents", "issue", "issues",
  "problem", "problems", "downtime", "error", "errors", "service", "services", "status",
  "timeline", "timelines", "workaround", "workarounds", "eta", "update", "updates",
  "customer", "customers", "impact", "impacted", "investigating", "resolved", "delay",
  "delayed", "unavailable", "degraded", "degradation", "partial", "currently", "experiencing",
  "please", "thanks", "hello", "team", "we", "you", "your", "our", "can", "cannot", "will", "would"
]);

const EXTRA_DETAIL_WORDS = new Set([
  "tomorrow", "today", "tonight", "asap", "immediately", "soon", "shortly", "guarantee", "guaranteed",
  "hour", "hours", "minute", "minutes", "eta",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"
]);

export function normalizeStatement(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?]+$/g, "");
}

export function termIsSpecific(term: string): boolean {
  const words = normalizeStatement(term).split(" ").filter(Boolean);
  return words.some((word) => word.length >= 4 && !GENERIC_WORDS.has(word));
}

export function assertSpecificMatchTerms(terms: string[]): void {
  const cleaned = terms.map((term) => term.trim()).filter(Boolean);
  if (!cleaned.some(termIsSpecific)) {
    throw new Error("Cause rule needs a specific incident phrase");
  }
}

function usableCauses(rules: CauseRecord[]): CauseRecord[] {
  return rules.filter((rule) => rule.status === "APPROVED" && rule.wording.trim() && rule.matchTerms.some(termIsSpecific));
}

function specificity(rule: CauseRecord): number {
  return rule.matchTerms.filter(termIsSpecific).reduce((total, term) => total + normalizeStatement(term).length, 0);
}

function situationMatches(rule: CauseRecord, proposal: string): boolean {
  const haystack = normalizeStatement(proposal);
  const terms = rule.matchTerms.filter(termIsSpecific).map(normalizeStatement);
  return terms.length > 0 && terms.every((term) => haystack.includes(term));
}

function baseVerdict(kind: UpdateKind, instruction: string, partial: Partial<UpdateVerdict> = {}): UpdateVerdict {
  return {
    kind,
    decision: "REFUSED",
    allowed: false,
    statesCause: false,
    sayOnly: null,
    matchedRuleId: null,
    matchedName: null,
    audienceChecked: false,
    instruction,
    ...partial
  };
}

export function evaluateWording(proposal: string, rows: IncidentStateRecord[]): UpdateVerdict {
  const usable = rows.filter((row) => row.status === "APPROVED" && row.wording.trim());
  const exact = usable.find((row) => normalizeStatement(row.wording) === normalizeStatement(proposal));
  if (exact) {
    return baseVerdict(
      "WORDING",
      "APPROVED. Repeat sayOnly verbatim. Do not add a cause, an ETA, or a workaround that is not in sayOnly.",
      {
        decision: "APPROVED",
        allowed: true,
        sayOnly: exact.wording,
        matchedRuleId: exact.id,
        matchedName: exact.name
      }
    );
  }
  const listed = usable.slice(0, 20).map((row) => row.wording);
  return baseVerdict(
    "WORDING",
    usable.length
      ? "REFUSED. This wording is not an approved incident update. Do not say it and do not invent a similar update. You may only say a statement in approvedStatements, verbatim, after evaluate_customer_update returns APPROVED for that exact text."
      : "REFUSED. No approved incident wording exists. Do not invent an update, a cause, an ETA, or a workaround.",
    {
      approvedStatements: listed,
      moreApprovedMayExist: usable.length > listed.length
    }
  );
}

export function evaluateCause(proposal: string, rules: CauseRecord[]): UpdateVerdict {
  const usable = usableCauses(rules);
  const exact = usable
    .filter((rule) => normalizeStatement(rule.wording) === normalizeStatement(proposal))
    .sort((a, b) => Number(b.decision === "WITHHOLD") - Number(a.decision === "WITHHOLD"));
  if (exact[0]) {
    const rule = exact[0];
    const statesCause = rule.decision === "STATE";
    return baseVerdict(
      "CAUSE",
      statesCause
        ? "APPROVED. Say sayOnly verbatim. This is the approved cause. Do not add a timeline, a workaround, or a different cause."
        : "APPROVED. Say sayOnly verbatim. This script does not state a cause. Do not add a cause, a timeline, or a workaround.",
      {
        decision: "APPROVED",
        allowed: true,
        statesCause,
        sayOnly: rule.wording,
        matchedRuleId: rule.id,
        matchedName: rule.name
      }
    );
  }

  const matched = usable
    .filter((rule) => situationMatches(rule, proposal))
    .sort((a, b) => specificity(b) - specificity(a) || Number(b.decision === "WITHHOLD") - Number(a.decision === "WITHHOLD"));
  const rule = matched[0];
  if (!rule) {
    return baseVerdict(
      "CAUSE",
      "REFUSED. Do not state a cause. No approved cause covers this update. Do not invent a cause, an ETA, or a workaround."
    );
  }
  return baseVerdict(
    "CAUSE",
    rule.decision === "STATE"
      ? "REFUSED. Do not say the proposal. The only approved cause wording for this incident is sayOnly. Say that verbatim, or do not mention a cause. Do not invent an ETA or a workaround."
      : "REFUSED. Do not state a cause. The matched rule withholds one. The only approved wording is sayOnly. Do not invent a cause that is not in sayOnly.",
    {
      sayOnly: rule.wording,
      matchedRuleId: rule.id,
      matchedName: rule.name
    }
  );
}

export function evaluateStatement(kind: "TIMELINE" | "WORKAROUND", proposal: string, rows: ApprovedStatementRecord[]): UpdateVerdict {
  const usable = rows.filter((row) => row.status === "APPROVED" && row.kind === kind && row.statement.trim());
  const exact = usable.find((row) => normalizeStatement(row.statement) === normalizeStatement(proposal));
  if (exact) {
    return baseVerdict(
      kind,
      kind === "TIMELINE"
        ? "APPROVED. Repeat sayOnly verbatim. Do not add a cause, a different time, or a workaround that is not in sayOnly."
        : "APPROVED. Repeat sayOnly verbatim. Do not add a cause, an ETA, or a step that is not in sayOnly.",
      {
        decision: "APPROVED",
        allowed: true,
        sayOnly: exact.statement,
        matchedRuleId: exact.id,
        matchedName: exact.name
      }
    );
  }
  const listed = usable.slice(0, 20).map((row) => row.statement);
  const noun = kind === "TIMELINE" ? "timeline" : "workaround";
  const invented = kind === "TIMELINE" ? "ETA" : "workaround";
  return baseVerdict(
    kind,
    usable.length
      ? `REFUSED. This ${noun} is not an approved statement. Do not promise it and do not invent a similar ${invented}. You may only say a statement in approvedStatements, verbatim, after evaluate_customer_update returns APPROVED for that exact text.`
      : `REFUSED. No approved ${noun} statements exist. Do not invent a ${invented}.`,
    {
      approvedStatements: listed,
      moreApprovedMayExist: usable.length > listed.length
    }
  );
}

function kindAllowed(limit: StatementLimitRecord, kind: UpdateKind): boolean {
  if (kind === "WORDING") return true;
  if (kind === "CAUSE") return limit.allowCause;
  if (kind === "TIMELINE") return limit.allowTimeline;
  return limit.allowWorkaround;
}

function kindLabel(kind: UpdateKind): string {
  if (kind === "WORDING") return "incident wording";
  if (kind === "CAUSE") return "cause";
  if (kind === "TIMELINE") return "timeline";
  return "workaround";
}

/** A channel limit can only tighten a verdict. It never turns a refusal into permission. */
export function applyChannelLimit(
  verdict: UpdateVerdict,
  channel: string | undefined,
  limit: StatementLimitRecord | null
): UpdateVerdict {
  if (!channel) {
    return {
      ...verdict,
      audienceChecked: false,
      instruction: `${verdict.instruction} Audience was not checked. Call evaluate_audience before sending.`
    };
  }
  if (!limit || limit.status !== "APPROVED") {
    return {
      ...verdict,
      decision: "REFUSED",
      allowed: false,
      statesCause: false,
      sayOnly: null,
      audienceChecked: true,
      audienceDecision: "REFUSED",
      instruction: "REFUSED. No approved statement limit covers this channel. Do not state a cause, an ETA, or a workaround, and do not invent an audience."
    };
  }
  if (!kindAllowed(limit, verdict.kind)) {
    return {
      ...verdict,
      decision: "REFUSED",
      allowed: false,
      statesCause: false,
      sayOnly: null,
      audienceChecked: true,
      audienceDecision: "REFUSED",
      instruction: `REFUSED. The approved statement limit for this channel does not allow a ${kindLabel(verdict.kind)}. Do not offer one. The widest approved audience on this limit is ${limit.maxAudience}.`
    };
  }
  return {
    ...verdict,
    audienceChecked: true,
    audienceDecision: "APPROVED",
    instruction: `${verdict.instruction} This channel's statement limit allows this kind of update only when decision is APPROVED.`
  };
}

export function evaluateAudience(action: AudienceAction, targetAudience: string | undefined, limit: StatementLimitRecord | null): AudienceVerdict {
  if (!limit || limit.status !== "APPROVED") {
    return {
      decision: "REFUSED",
      allowed: false,
      action,
      maxAudience: null,
      audienceLadder: [],
      instruction: "REFUSED. No approved statement limit covers this channel. Do not state a cause, an ETA, or a workaround, and do not invent an audience."
    };
  }
  const ladder = limit.audienceLadder;
  if (action === "PUBLISH") {
    const target = targetAudience?.trim() ?? "";
    const maxIndex = ladder.indexOf(limit.maxAudience);
    const targetIndex = ladder.indexOf(target);
    if (!target || targetIndex < 0 || maxIndex < 0 || targetIndex > maxIndex) {
      return {
        decision: "REFUSED",
        allowed: false,
        action,
        maxAudience: limit.maxAudience,
        audienceLadder: ladder,
        instruction: "REFUSED. That audience is not within the approved statement limit. Do not invent a destination. Stay on the recorded ladder at or below maxAudience."
      };
    }
    return {
      decision: "APPROVED",
      allowed: true,
      action,
      maxAudience: limit.maxAudience,
      audienceLadder: ladder,
      instruction: `APPROVED. You may publish to ${target}. Do not state a cause, an ETA, or a workaround unless a separate evaluate_customer_update call returns APPROVED.`
    };
  }
  const kind: UpdateKind = action === "STATE_CAUSE" ? "CAUSE" : action === "STATE_TIMELINE" ? "TIMELINE" : "WORKAROUND";
  if (!kindAllowed(limit, kind)) {
    const noun = kind === "TIMELINE" ? "an ETA" : kind === "CAUSE" ? "a cause" : "a workaround";
    return {
      decision: "REFUSED",
      allowed: false,
      action,
      maxAudience: limit.maxAudience,
      audienceLadder: ladder,
      instruction: `REFUSED. This channel cannot state ${noun}. Do not offer one. The widest approved audience is ${limit.maxAudience}.`
    };
  }
  const noun = kind === "TIMELINE" ? "timeline" : kind === "CAUSE" ? "cause" : "workaround";
  const invented = kind === "TIMELINE" ? "an ETA" : kind === "CAUSE" ? "a cause" : "a workaround";
  return {
    decision: "APPROVED",
    allowed: true,
    action,
    maxAudience: limit.maxAudience,
    audienceLadder: ladder,
    instruction: `APPROVED. This channel may state a ${noun} only when evaluate_customer_update returns APPROVED for the exact wording. Do not invent ${invented}.`
  };
}

export function selectIncidentStates<T extends { status: string; name: string; summary: string; wording: string }>(
  query: string,
  rows: T[],
  limit: number
): T[] {
  const words = new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  return rows
    .filter((row) => row.status === "APPROVED")
    .map((row, index) => {
      const hay = new Set(`${row.name} ${row.summary} ${row.wording}`.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
      let score = 0;
      for (const word of words) if (word.length > 2 && hay.has(word)) score += 3;
      if (row.summary.length > 8 && query.toLocaleLowerCase().includes(row.summary.toLocaleLowerCase())) score += 20;
      if (row.name.length > 8 && query.toLocaleLowerCase().includes(row.name.toLocaleLowerCase())) score += 12;
      return { row, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.row);
}

export function proposalAddsUnapprovedDetail(proposal: string, approved: string): boolean {
  const extraWords = new Set(normalizeStatement(proposal).split(" ").filter((word) => EXTRA_DETAIL_WORDS.has(word)));
  const approvedWords = new Set(normalizeStatement(approved).split(" "));
  for (const word of extraWords) if (!approvedWords.has(word)) return true;
  const proposalNumbers = proposal.match(/\d+/g) ?? [];
  const approvedNumbers = new Set(approved.match(/\d+/g) ?? []);
  return proposalNumbers.some((value) => !approvedNumbers.has(value));
}
