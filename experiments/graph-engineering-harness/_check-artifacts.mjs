#!/usr/bin/env node
// Verification script for the graph engineering harness phase's own documents (16-01 through 16-05).
// Plain Node ESM, no dependencies, no build step. Lives under experiments/, outside the TypeScript
// project's include list, so it is not typechecked and does not touch the suite.
//
// Usage: node _check-artifacts.mjs <protocol|survey|validation|dossiers|matrix|selection|all>
//        [--entries-only] [--floors-only] [--dir <path>]
//
// Every check is a positive assertion about a parsed value, never a search for forbidden prose.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Pinned vocabularies (fixed by the search protocol's "Naming authority" section)
// ---------------------------------------------------------------------------

const SUBDOMAINS = ["knowledge-graphs", "code-architecture-graphs", "graph-db-schema"];
const SOURCE_CLASSES = ["SC-A", "SC-B", "SC-C", "SC-D"];
const SURVEY_VERDICTS = ["validated", "unvalidated", "unverifiable"];
const LEDGER_VERDICTS = ["confirmed", "refuted", "unverifiable"];
const DISPOSITIONS = ["kept", "reworked", "dropped"];
const ORACLE_KINDS = ["execution", "constructed", "replay"];
const ORACLE_STATUS = "harvested-and-existing";
const DELIVERABLE_DOMAINS = ["code-engineering", "qa-retrieval"];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function read(dir, name) {
  const p = path.join(dir, name);
  if (!existsSync(p)) throw new Error(`missing document: ${p}`);
  return readFileSync(p, "utf8");
}

/** First occurrence of a `- **Label:** value` field line in `text`. Returns trimmed value or null. */
function field(text, label) {
  const re = new RegExp(`^[ \\t]*-\\s*\\*\\*${esc(label)}:\\*\\*[ \\t]*(.+)$`, "m");
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/** Split `text` into chunks, one per line matching `headingRe` (must have the 'g' and 'm' flags),
 * running from that heading to the start of the next matching heading (or EOF). */
function splitOn(text, headingRe) {
  const matches = [...text.matchAll(headingRe)];
  return matches.map((m, i) => ({
    match: m,
    body: text.slice(m.index, i + 1 < matches.length ? matches[i + 1].index : text.length),
  }));
}

function isIsoDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) && !Number.isNaN(Date.parse(s.trim()));
}

function parseDate(s) {
  return new Date(s.trim() + "T00:00:00Z").getTime();
}

function ok(subcommand, details) {
  console.log(`OK ${subcommand.toUpperCase()} ${details}`);
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// protocol
// ---------------------------------------------------------------------------

function parseProtocol(dir) {
  const text = read(dir, "SEARCH-PROTOCOL.md");

  const windowMatch = text.match(/\*\*Recency window:\*\*\s*(\d{4})-(\d{4})/);
  if (!windowMatch) throw new Error("protocol: recency window declaration missing");
  const window = [Number(windowMatch[1]), Number(windowMatch[2])];

  const subdomainRe = /^- \*\*Subdomain:\*\*\s*([a-z-]+)[^\n]*\n[ \t]*-\s*\*\*Minimum entries:\*\*\s*(\d+)/gm;
  const classRe = /^- \*\*Source class:\*\*\s*(SC-[A-D])[^\n]*\n[ \t]*-\s*\*\*Minimum entries:\*\*\s*(\d+)/gm;

  const subdomains = {};
  for (const m of text.matchAll(subdomainRe)) subdomains[m[1]] = Number(m[2]);
  const classes = {};
  for (const m of text.matchAll(classRe)) classes[m[1]] = Number(m[2]);

  for (const id of SUBDOMAINS) {
    if (!(id in subdomains)) throw new Error(`protocol: subdomain identifier missing a declared minimum: ${id}`);
  }
  for (const id of SOURCE_CLASSES) {
    if (!(id in classes)) throw new Error(`protocol: source class identifier missing a declared minimum: ${id}`);
  }

  // Hold floors as a map from identifier to its own minimum. Never collapsed to one number.
  const floors = { ...classes, ...subdomains };

  return { text, window, subdomains, classes, floors };
}

function cmdProtocol(dir) {
  const p = parseProtocol(dir);
  const classesStr = SOURCE_CLASSES.map((id) => `${id}:${p.classes[id]}`).join(",");
  const subdomainsStr = SUBDOMAINS.map((id) => `${id}:${p.subdomains[id]}`).join(",");
  ok("protocol", `classes=${classesStr} subdomains=${subdomainsStr} window=${p.window[0]}-${p.window[1]}`);
}

// ---------------------------------------------------------------------------
// survey
// ---------------------------------------------------------------------------

const SURVEY_FIELD_LABELS = [
  "Source class",
  "Subdomain",
  "Primary source",
  "Published",
  "Fetch-verified",
  "Quote",
  "Verdict",
  "Bar applied",
  "Relevance",
];

function parseSurveyEntries(dir) {
  const text = read(dir, "SURVEY.md");
  const headingRe = /^### (E|B)-(\d+) —.*$/gm;
  const sections = splitOn(text, headingRe);
  const entries = sections.map(({ match, body }) => {
    const kind = match[1]; // "E" or "B"
    const num = match[2];
    const id = `${kind}-${num}`;
    const fields = {};
    for (const label of SURVEY_FIELD_LABELS) fields[label] = field(body, label);
    return {
      id,
      isBackground: kind === "B",
      fields,
      dropped: field(body, "Status") === "dropped",
      body,
    };
  });
  return { text, entries };
}

function checkSurveyEntry(entry) {
  const { id, fields, isBackground } = entry;

  for (const label of SURVEY_FIELD_LABELS) {
    if (!fields[label]) throw new Error(`survey ${id}: missing or empty field "${label}"`);
  }

  if (!/^https?:\/\/\S+$/.test(fields["Primary source"])) {
    throw new Error(`survey ${id}: primary source is not an http(s) URL: ${fields["Primary source"]}`);
  }

  const publishedRaw = fields["Published"];
  const publishedDateMatch = publishedRaw.match(/^(\d{4})-\d{2}-\d{2}/);
  if (!publishedDateMatch || !isIsoDate(publishedDateMatch[0])) {
    throw new Error(`survey ${id}: published date does not parse: ${publishedRaw}`);
  }
  const publishedYear = Number(publishedDateMatch[1]);

  const fetchVerified = fields["Fetch-verified"];
  const fvUrlMatch = fetchVerified.match(/https?:\/\/\S+/);
  const fvDateMatch = fetchVerified.match(/retrieved\s+(\d{4}-\d{2}-\d{2})/);
  if (!fvUrlMatch) throw new Error(`survey ${id}: fetch-verified line carries no URL`);
  if (!fvDateMatch || !isIsoDate(fvDateMatch[1])) {
    throw new Error(`survey ${id}: fetch-verified line carries no parseable retrieval date`);
  }
  if (parseDate(fvDateMatch[1]) < parseDate(publishedDateMatch[0])) {
    throw new Error(`survey ${id}: retrieval date ${fvDateMatch[1]} is earlier than published date ${publishedDateMatch[0]}`);
  }

  const quote = fields["Quote"];
  const quoteMatch = quote.match(/"([^"]+)"/);
  if (!quoteMatch || quoteMatch[1].trim().length === 0) {
    throw new Error(`survey ${id}: quote field carries no non-empty quoted string`);
  }

  if (!SOURCE_CLASSES.includes(fields["Source class"])) {
    throw new Error(`survey ${id}: source class not in ${SOURCE_CLASSES.join("/")}: ${fields["Source class"]}`);
  }
  if (!SUBDOMAINS.includes(fields["Subdomain"])) {
    throw new Error(`survey ${id}: subdomain not in ${SUBDOMAINS.join("/")}: ${fields["Subdomain"]}`);
  }

  if (!isBackground && (publishedYear < 0)) {
    // unreachable guard; year comparison against the protocol window happens in cmdSurvey,
    // where the window is available.
  }

  return { publishedYear };
}

function cmdSurvey(dir, { entriesOnly, floorsOnly }) {
  const { window, floors } = parseProtocol(dir);
  const { text: surveyText, entries } = parseSurveyEntries(dir);

  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`survey: duplicate entry id ${entry.id}`);
    ids.add(entry.id);
  }

  const runEntryChecks = !floorsOnly;
  const runFloorChecks = !entriesOnly;
  const runIntegrityCheck = !entriesOnly && !floorsOnly;

  if (runEntryChecks) {
    for (const entry of entries) {
      const { publishedYear } = checkSurveyEntry(entry);
      if (!entry.isBackground) {
        if (publishedYear < window[0] || publishedYear > window[1]) {
          throw new Error(
            `survey ${entry.id}: published year ${publishedYear} is outside the recency window ${window[0]}-${window[1]}`
          );
        }
      }
    }
  }

  let floorsSummary = "";
  if (runFloorChecks) {
    const counts = {};
    for (const entry of entries) {
      if (entry.isBackground || entry.dropped) continue;
      const cls = entry.fields["Source class"];
      const sub = entry.fields["Subdomain"];
      if (cls) counts[cls] = (counts[cls] || 0) + 1;
      if (sub) counts[sub] = (counts[sub] || 0) + 1;
    }
    for (const [id, floor] of Object.entries(floors)) {
      const count = counts[id] || 0;
      if (count < floor) {
        throw new Error(`survey: identifier ${id} has ${count} surviving entries, below its floor of ${floor}`);
      }
    }
    // Every identifier with its own surviving count and its own declared minimum, read from the
    // same floors map the enforcement above already used — no second parser, just a printout of it.
    floorsSummary = " " + Object.entries(floors).map(([id, floor]) => `${id}:${counts[id] || 0}/${floor}`).join(",");
  }

  if (runIntegrityCheck) {
    const heading = /^## Graph integrity practice\s*$/m;
    const headingMatch = surveyText.match(heading);
    if (!headingMatch) throw new Error("survey: graph integrity practice section missing");
    const rest = surveyText.slice(headingMatch.index + headingMatch[0].length);
    const nextHeading = rest.match(/^## /m);
    const sectionBody = nextHeading ? rest.slice(0, nextHeading.index) : rest;
    if (!/\bE-\d+\b/.test(sectionBody)) {
      throw new Error("survey: graph integrity practice section names no survey entry id");
    }
  }

  const mode = entriesOnly ? "entries-only" : floorsOnly ? "floors-only" : "full";
  ok("survey", `mode=${mode} entries=${entries.length}${floorsSummary}`);
}

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

function parseValidationEntries(dir) {
  const text = read(dir, "VALIDATION.md");
  const headingRe = /^### V-(\d+) —.*$/gm;
  const sections = splitOn(text, headingRe);
  const entries = sections.map(({ match, body }) => {
    const id = `V-${match[1]}`;
    return {
      id,
      claimUnderCheck: field(body, "Claim under check"),
      reFetched: field(body, "Re-fetched"),
      verdict: field(body, "Verdict"),
      disposition: field(body, "Disposition"),
    };
  });
  return { text, entries };
}

function checkValidationEntry(entry, surveyById) {
  const { id, claimUnderCheck, reFetched, verdict, disposition } = entry;

  if (!claimUnderCheck) throw new Error(`validation ${id}: missing "Claim under check"`);
  if (!reFetched) throw new Error(`validation ${id}: missing "Re-fetched"`);
  if (!verdict) throw new Error(`validation ${id}: missing "Verdict"`);
  if (!disposition) throw new Error(`validation ${id}: missing "Disposition"`);

  if (!LEDGER_VERDICTS.includes(verdict)) {
    throw new Error(`validation ${id}: verdict not in ${LEDGER_VERDICTS.join("/")}: ${verdict}`);
  }
  if (!DISPOSITIONS.includes(disposition)) {
    throw new Error(`validation ${id}: disposition not in ${DISPOSITIONS.join("/")}: ${disposition}`);
  }
  if (verdict !== "confirmed" && disposition === "kept") {
    throw new Error(`validation ${id}: verdict "${verdict}" may not carry disposition "kept"`);
  }

  const refetchDateMatch = reFetched.match(/retrieved\s+(\d{4}-\d{2}-\d{2})/);
  if (!refetchDateMatch || !isIsoDate(refetchDateMatch[1])) {
    throw new Error(`validation ${id}: re-fetched field carries no parseable retrieval date`);
  }

  const surveyEntry = surveyById.get(claimUnderCheck);
  if (surveyEntry) {
    const surveyFv = surveyEntry.fields["Fetch-verified"] || "";
    const surveyDateMatch = surveyFv.match(/retrieved\s+(\d{4}-\d{2}-\d{2})/);
    if (surveyDateMatch && parseDate(refetchDateMatch[1]) < parseDate(surveyDateMatch[1])) {
      throw new Error(
        `validation ${id}: re-fetch date ${refetchDateMatch[1]} is earlier than the survey entry's own retrieval date ${surveyDateMatch[1]}`
      );
    }
  }
}

function cmdValidation(dir, { entriesOnly }) {
  const { entries: surveyEntries } = parseSurveyEntries(dir);
  const surveyById = new Map(surveyEntries.map((e) => [e.id, e]));
  const { text: ledgerText, entries: ledgerEntries } = parseValidationEntries(dir);

  for (const entry of ledgerEntries) checkValidationEntry(entry, surveyById);

  if (entriesOnly) {
    ok("validation", `mode=entries-only entries=${ledgerEntries.length}`);
    return;
  }

  const surveyIds = new Set(surveyEntries.map((e) => e.id));
  const ledgerIds = ledgerEntries.map((e) => e.claimUnderCheck);
  const ledgerIdCounts = new Map();
  for (const id of ledgerIds) ledgerIdCounts.set(id, (ledgerIdCounts.get(id) || 0) + 1);

  for (const id of ledgerIdCounts.keys()) {
    if (!surveyIds.has(id)) throw new Error(`validation: ledger entry checks claim "${id}", which is not a survey entry id`);
  }
  for (const id of surveyIds) {
    const n = ledgerIdCounts.get(id) || 0;
    if (n === 0) throw new Error(`validation: survey entry "${id}" has no ledger entry checking it`);
    if (n > 1) throw new Error(`validation: survey entry "${id}" is checked ${n} times, expected exactly once`);
  }

  const computed = { confirmed: 0, refuted: 0, unverifiable: 0 };
  for (const entry of ledgerEntries) computed[entry.verdict]++;

  const totalsMatch = ledgerText.match(
    /\*\*Totals:\*\*\s*confirmed=(\d+),\s*refuted=(\d+),\s*unverifiable=(\d+)/
  );
  if (!totalsMatch) throw new Error("validation: totals line missing or does not match the pinned format");
  const stated = { confirmed: Number(totalsMatch[1]), refuted: Number(totalsMatch[2]), unverifiable: Number(totalsMatch[3]) };
  for (const key of Object.keys(computed)) {
    if (stated[key] !== computed[key]) {
      throw new Error(`validation: stated total ${key}=${stated[key]} does not equal computed count ${computed[key]}`);
    }
  }

  ok("validation", `mode=full entries=${ledgerEntries.length} confirmed=${computed.confirmed} refuted=${computed.refuted} unverifiable=${computed.unverifiable}`);
}

// ---------------------------------------------------------------------------
// dossiers
// ---------------------------------------------------------------------------

const SLATE_SECTIONS = [
  "### Exogenous-oracle analysis",
  "### Backbone-fit map",
  "### Collaborative-mode sketch",
  "### Effort and risk estimate",
  "### Validated evidence trail",
];

function splitH2(text) {
  return splitOn(text, /^## (.+)$/gm).map(({ match, body }) => ({ title: match[1].trim(), body }));
}

function parseDossierCandidates(dir) {
  const text = read(dir, "CANDIDATE-DOSSIERS.md");
  const sections = splitH2(text);
  const candidates = sections
    .filter((s) => /^C-\d+\b/.test(s.title))
    .map((s) => {
      const idMatch = s.title.match(/^(C-\d+)\b/);
      return {
        id: idMatch[1],
        title: s.title,
        body: s.body,
        oracleKind: field(s.body, "Oracle kind"),
        oracleStatus: field(s.body, "Oracle status"),
        deliverableDomain: field(s.body, "Deliverable domain"),
        evidence: field(s.body, "Evidence"),
      };
    });
  const hasScreenedOut = sections.some((s) => /^Screened out\b/.test(s.title));
  return { text, sections, candidates, hasScreenedOut };
}

function checkDossierCandidate(candidate, surveyById, ledgerByClaimId) {
  const { id, body, oracleKind, oracleStatus, deliverableDomain, evidence } = candidate;

  if (!oracleKind) throw new Error(`dossiers ${id}: missing "Oracle kind"`);
  if (!ORACLE_KINDS.includes(oracleKind)) {
    throw new Error(`dossiers ${id}: oracle kind not in the exogenous set ${ORACLE_KINDS.join("/")}: ${oracleKind}`);
  }
  if (oracleStatus !== ORACLE_STATUS) {
    throw new Error(`dossiers ${id}: oracle status must be "${ORACLE_STATUS}", got "${oracleStatus}"`);
  }
  if (!deliverableDomain || !DELIVERABLE_DOMAINS.includes(deliverableDomain)) {
    throw new Error(`dossiers ${id}: deliverable domain not in ${DELIVERABLE_DOMAINS.join("/")}: ${deliverableDomain}`);
  }
  if (!evidence) throw new Error(`dossiers ${id}: missing "Evidence"`);

  const evidenceIds = evidence.split(",").map((s) => s.trim()).filter(Boolean);
  if (evidenceIds.length === 0) throw new Error(`dossiers ${id}: evidence field names no survey entry id`);
  for (const evId of evidenceIds) {
    if (!surveyById.has(evId)) throw new Error(`dossiers ${id}: evidence cites "${evId}", which is not a survey entry`);
    const ledgerEntry = ledgerByClaimId.get(evId);
    if (!ledgerEntry || ledgerEntry.verdict !== "confirmed" || ledgerEntry.disposition !== "kept") {
      throw new Error(`dossiers ${id}: evidence cites "${evId}", which is not confirmed and kept in the validation ledger`);
    }
  }

  for (const section of SLATE_SECTIONS) {
    if (!body.includes(section)) throw new Error(`dossiers ${id}: missing slate section "${section}"`);
  }
}

function cmdDossiers(dir, { entriesOnly }) {
  const { entries: surveyEntries } = parseSurveyEntries(dir);
  const surveyById = new Map(surveyEntries.map((e) => [e.id, e]));
  let ledgerByClaimId = new Map();
  if (existsSync(path.join(dir, "VALIDATION.md"))) {
    const { entries: ledgerEntries } = parseValidationEntries(dir);
    ledgerByClaimId = new Map(ledgerEntries.map((e) => [e.claimUnderCheck, e]));
  }

  const { candidates, hasScreenedOut } = parseDossierCandidates(dir);
  if (candidates.length === 0) throw new Error("dossiers: no candidate headings found");

  for (const candidate of candidates) checkDossierCandidate(candidate, surveyById, ledgerByClaimId);

  if (entriesOnly) {
    ok("dossiers", `mode=entries-only candidates=${candidates.length}`);
    return;
  }

  if (candidates.length < 3 || candidates.length > 5) {
    throw new Error(`dossiers: candidate count ${candidates.length} is outside the required 3-5 bound`);
  }
  if (!hasScreenedOut) throw new Error('dossiers: "## Screened out" section missing');

  ok("dossiers", `mode=full candidates=${candidates.length}`);
}

// ---------------------------------------------------------------------------
// matrix
// ---------------------------------------------------------------------------

function splitH3(text) {
  return splitOn(text, /^### (.+)$/gm).map(({ match, body }) => ({ title: match[1].trim(), body }));
}

function cmdMatrix(dir) {
  const text = read(dir, "DECISION-MATRIX.md");
  const h2 = splitH2(text);

  const criteriaSection = h2.find((s) => s.title === "Criteria");
  if (!criteriaSection) throw new Error('matrix: "## Criteria" section missing');
  const criterionRe = /^- \*\*Criterion:\*\*\s*(.+?)[ \t]*\n[ \t]*-\s*\*\*Weight:\*\*\s*(\d+)/gm;
  const criteria = [];
  for (const m of criteriaSection.body.matchAll(criterionRe)) {
    const weight = Number(m[2]);
    if (!Number.isInteger(weight) || weight <= 0) {
      throw new Error(`matrix: criterion "${m[1]}" has non-positive-integer weight ${m[2]}`);
    }
    criteria.push({ name: m[1].trim(), weight });
  }
  if (criteria.length === 0) throw new Error("matrix: no criteria declared with a positive integer weight");

  const scoresSection = h2.find((s) => s.title === "Scores");
  if (!scoresSection) throw new Error('matrix: "## Scores" section missing');
  const rows = splitH3(scoresSection.body).filter((s) => /^C-\d+\b/.test(s.title));
  if (rows.length === 0) throw new Error("matrix: no candidate rows found under Scores");

  let candidateIds = null;
  if (existsSync(path.join(dir, "CANDIDATE-DOSSIERS.md"))) {
    const { candidates } = parseDossierCandidates(dir);
    candidateIds = new Set(candidates.map((c) => c.id));
  }

  const seenRowIds = new Set();
  for (const row of rows) {
    const idMatch = row.title.match(/^(C-\d+)\b/);
    const id = idMatch[1];
    if (candidateIds && !candidateIds.has(id)) {
      throw new Error(`matrix: row "${id}" does not match a candidate in the dossiers`);
    }
    seenRowIds.add(id);

    let weightedSum = 0;
    for (const { name, weight } of criteria) {
      const cellRe = new RegExp(`^[ \\t]*-\\s*\\*\\*${esc(name)}:\\*\\*[ \\t]*(\\d+)`, "m");
      const cellMatch = row.body.match(cellRe);
      if (!cellMatch) throw new Error(`matrix: row "${id}" missing a cell for criterion "${name}"`);
      const cell = Number(cellMatch[1]);
      if (!Number.isInteger(cell) || cell < 0 || cell > 3) {
        throw new Error(`matrix: row "${id}" cell for "${name}" is not an integer in 0-3: ${cellMatch[1]}`);
      }
      weightedSum += cell * weight;
    }

    const totalMatch = row.body.match(/^[ \t]*-\s*\*\*Row total:\*\*\s*(\d+)/m);
    if (!totalMatch) throw new Error(`matrix: row "${id}" missing "Row total"`);
    const statedTotal = Number(totalMatch[1]);
    if (statedTotal !== weightedSum) {
      throw new Error(`matrix: row "${id}" stated total ${statedTotal} does not equal the recomputed weighted sum ${weightedSum}`);
    }
  }

  if (candidateIds) {
    for (const id of candidateIds) {
      if (!seenRowIds.has(id)) throw new Error(`matrix: candidate "${id}" has no row in the matrix`);
    }
  }

  if (!/^- \*\*Aggregation rule:\*\*\s*\S+/m.test(text)) throw new Error('matrix: "Aggregation rule" line missing');
  if (!/^- \*\*Decision authority:\*\*\s*\S+/m.test(text)) throw new Error('matrix: "Decision authority" line missing');

  ok("matrix", `criteria=${criteria.length} rows=${rows.length}`);
}

// ---------------------------------------------------------------------------
// selection
// ---------------------------------------------------------------------------

function cmdSelection(dir) {
  const text = read(dir, "SELECTION.md");

  const selectedMatches = [...text.matchAll(/^- \*\*Selected:\*\*\s*(\S+)/gm)];
  if (selectedMatches.length === 0) throw new Error('selection: "Selected" field missing');
  if (selectedMatches.length > 1) throw new Error(`selection: "Selected" field appears ${selectedMatches.length} times, expected exactly once`);
  const selectedId = selectedMatches[0][1];
  if (!/^C-\d+$/.test(selectedId)) throw new Error(`selection: selected id "${selectedId}" is not a candidate-shaped id`);

  if (existsSync(path.join(dir, "CANDIDATE-DOSSIERS.md"))) {
    const { candidates } = parseDossierCandidates(dir);
    if (!candidates.some((c) => c.id === selectedId)) {
      throw new Error(`selection: selected id "${selectedId}" does not exist among the candidate dossiers`);
    }
  }

  if (!/^## Scope of this decision\s*$/m.test(text)) throw new Error('selection: "## Scope of this decision" heading missing');

  const decidedBy = field(text, "Decided by");
  const decidedOn = field(text, "Decided on");
  const governingText = field(text, "Governing text");
  if (!decidedBy) throw new Error('selection: "Decided by" field missing');
  if (!decidedOn) throw new Error('selection: "Decided on" field missing');
  if (!governingText) throw new Error('selection: "Governing text" field missing');
  const decidedOnDate = decidedOn.match(/\d{4}-\d{2}-\d{2}/);
  if (!decidedOnDate || !isIsoDate(decidedOnDate[0])) {
    throw new Error(`selection: "Decided on" does not carry a parseable date: ${decidedOn}`);
  }

  ok("selection", `selected=${selectedId}`);
}

// ---------------------------------------------------------------------------
// all
// ---------------------------------------------------------------------------

function cmdAll(dir) {
  cmdProtocol(dir);
  cmdSurvey(dir, {});
  cmdValidation(dir, {});
  cmdDossiers(dir, {});
  cmdMatrix(dir);
  cmdSelection(dir);
  ok("all", "protocol,survey,validation,dossiers,matrix,selection");
}

// ---------------------------------------------------------------------------
// entrypoint
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const [subcommand, ...rest] = argv;
  const flags = { entriesOnly: false, floorsOnly: false, dir: SCRIPT_DIR };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--entries-only") flags.entriesOnly = true;
    else if (a === "--floors-only") flags.floorsOnly = true;
    else if (a === "--dir") flags.dir = rest[++i];
  }
  return { subcommand, flags };
}

function main() {
  const { subcommand, flags } = parseArgs(process.argv.slice(2));
  const dir = flags.dir;

  if (flags.entriesOnly && flags.floorsOnly) {
    fail("--entries-only and --floors-only are mutually exclusive");
  }

  const dispatch = {
    protocol: () => cmdProtocol(dir),
    survey: () => cmdSurvey(dir, flags),
    validation: () => cmdValidation(dir, flags),
    dossiers: () => cmdDossiers(dir, flags),
    matrix: () => cmdMatrix(dir),
    selection: () => cmdSelection(dir),
    all: () => cmdAll(dir),
  };

  if (!dispatch[subcommand]) {
    fail(`unknown subcommand "${subcommand}". Use one of: ${Object.keys(dispatch).join(", ")}`);
  }

  try {
    dispatch[subcommand]();
  } catch (err) {
    fail(err.message);
  }
}

main();
