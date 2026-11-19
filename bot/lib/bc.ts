/**
 * Business Central client for Bid Analyzer.
 *
 * Signs in as an Entra app (client credentials) and calls a custom API that the
 * Pharo extension must publish. Contract, base path
 *   /v2.0/{tenant}/{environment}/api/softwaredynamics/procurement/v1.0/companies({companyId})
 *
 *   GET  bidAnalyses?$filter=no eq '<no>'
 *        -> { value: [{ id, no, status, approvalStatus, consolidatedScoringDone,
 *                       analyzerDecision, analyzerBidderCode }] }
 *        analyzerDecision is "", "Accepted" or "Rejected".
 *   GET  bidScores?$filter=bidAnalysisNo eq '<no>'
 *        -> { value: [{ bidAnalysisNo, bidderCode, bidderName, bidAmount, currencyCode,
 *                       technicalScore, commercialScore, qualityScore, totalWeightedScore,
 *                       evaluatorsCount, evaluatorsSubmitted, rank, recommended }] }
 *   PATCH bidAnalyses({id})   (header If-Match: *)
 *        body { analyzerBidderCode, analyzerDecision: "Accepted" | "Rejected" }
 *        The same values again change nothing. A different decision is refused.
 *        Published by the Pharo extension: pages 50819 and 50827, codeunit 50813.
 *
 * Secrets, read at call time: BC_TENANT_ID, BC_CLIENT_ID, BC_CLIENT_SECRET,
 * BC_COMPANY_ID. Optional: BC_ENVIRONMENT (default "production").
 */
import * as z from "zod/v4";

const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const API_BASE = "https://api.businesscentral.dynamics.com";
const LOGIN_BASE = "https://login.microsoftonline.com";
const MAX_PAGES = 5;
const REQUEST_TIMEOUT_MS = 30_000;

export class BcError extends Error {}

export type BcConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  companyId: string;
  environment: string;
};

const analysisRow = z.object({
  id: z.string(),
  no: z.string(),
  status: z.string(),
  approvalStatus: z.string().optional(),
  consolidatedScoringDone: z.boolean(),
  analyzerDecision: z.string().optional(),
  analyzerBidderCode: z.string().optional(),
});

const scoreRow = z.object({
  bidderCode: z.string(),
  bidderName: z.string(),
  bidAmount: z.number(),
  currencyCode: z.string().optional(),
  technicalScore: z.number(),
  commercialScore: z.number(),
  qualityScore: z.number(),
  totalWeightedScore: z.number(),
  evaluatorsCount: z.number(),
  evaluatorsSubmitted: z.number(),
  rank: z.number(),
  recommended: z.boolean(),
});

export type BcAnalysis = z.output<typeof analysisRow>;
export type BcScore = z.output<typeof scoreRow>;
export type BcBidData = { analysis: BcAnalysis; scores: BcScore[] };
export type BcDecision = "Accepted" | "Rejected";

export function isConfigured(): boolean {
  return readConfig() !== undefined;
}

export function readConfig(): BcConfig | undefined {
  const tenantId = process.env.BC_TENANT_ID?.trim() ?? "";
  const clientId = process.env.BC_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.BC_CLIENT_SECRET?.trim() ?? "";
  const companyId = process.env.BC_COMPANY_ID?.trim() ?? "";
  const environment = process.env.BC_ENVIRONMENT?.trim() || "production";
  if (tenantId === "" || clientId === "" || clientSecret === "" || companyId === "") {
    return undefined;
  }
  if (!GUID.test(tenantId) || !GUID.test(clientId) || !GUID.test(companyId)) {
    throw new BcError("BC_TENANT_ID, BC_CLIENT_ID and BC_COMPANY_ID must be GUIDs.");
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(environment)) {
    throw new BcError("BC_ENVIRONMENT may contain only letters, digits, hyphen and underscore.");
  }
  return { tenantId, clientId, clientSecret, companyId, environment };
}

export function requireConfig(): BcConfig {
  const config = readConfig();
  if (config === undefined) {
    throw new BcError(
      "Business Central is not configured. Set BC_TENANT_ID, BC_CLIENT_ID, BC_CLIENT_SECRET and BC_COMPANY_ID.",
    );
  }
  return config;
}

export function checkAnalysisNo(no: string): string {
  const value = no.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_./-]{0,19}$/.test(value)) {
    throw new BcError("The bid analysis number may contain only letters, digits and . _ / -, up to 20 characters.");
  }
  return value;
}

/** Enum values come back as names, with spaces encoded as _x0020_. */
export function enumText(value: string | undefined): string {
  return (value ?? "").replace(/_x0020_/g, " ").trim();
}

export async function loadBidData(config: BcConfig, bidAnalysisNo: string): Promise<BcBidData> {
  const no = checkAnalysisNo(bidAnalysisNo);
  const literal = encodeURIComponent(`'${no.replace(/'/g, "''")}'`);
  const analyses = await getAll(config, `bidAnalyses?$filter=no eq ${literal}`, analysisRow);
  const analysis = analyses[0];
  if (analysis === undefined) {
    throw new BcError(`Bid analysis ${no} was not found in Business Central.`);
  }
  const scores = await getAll(config, `bidScores?$filter=bidAnalysisNo eq ${literal}`, scoreRow);
  return { analysis, scores };
}

export async function postDecision(
  config: BcConfig,
  analysisId: string,
  bidderCode: string,
  decision: BcDecision,
): Promise<void> {
  if (!GUID.test(analysisId)) {
    throw new BcError("Business Central returned an unexpected bid analysis id.");
  }
  await request(
    config,
    "PATCH",
    `bidAnalyses(${analysisId})`,
    { analyzerBidderCode: bidderCode, analyzerDecision: decision },
    { "if-match": "*" },
  );
}

async function getAll<T>(config: BcConfig, path: string, schema: z.ZodType<T>): Promise<T[]> {
  const rows: T[] = [];
  let next: string | undefined = path;
  for (let page = 0; next !== undefined && page < MAX_PAGES; page += 1) {
    const body = await request(config, "GET", next);
    const parsed = z
      .object({ value: z.array(z.unknown()), "@odata.nextLink": z.string().optional() })
      .safeParse(body);
    if (!parsed.success) {
      throw new BcError("Business Central returned an unexpected response.");
    }
    for (const item of parsed.data.value) {
      const row = schema.safeParse(item);
      if (!row.success) {
        throw new BcError("Business Central returned a row in an unexpected shape.");
      }
      rows.push(row.data);
    }
    next = parsed.data["@odata.nextLink"];
  }
  if (next !== undefined) {
    throw new BcError("Business Central returned more pages than this agent reads.");
  }
  return rows;
}

let cachedToken: { value: string; expiresAt: number } | undefined;

async function accessToken(config: BcConfig): Promise<string> {
  const now = Date.now();
  if (cachedToken !== undefined && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.value;
  }
  const response = await fetch(`${LOGIN_BASE}/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: `${API_BASE}/.default`,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = z.object({ access_token: z.string(), expires_in: z.number() }).safeParse(body);
  if (!response.ok || !parsed.success) {
    throw new BcError(`Business Central sign-in failed (HTTP ${response.status}). Check the Entra app and its secret.`);
  }
  cachedToken = { value: parsed.data.access_token, expiresAt: now + parsed.data.expires_in * 1000 };
  return cachedToken.value;
}

async function request(
  config: BcConfig,
  method: "GET" | "PATCH",
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  const base = `${API_BASE}/v2.0/${config.tenantId}/${config.environment}/api/softwaredynamics/procurement/v1.0/companies(${config.companyId})`;
  const url = path.startsWith("https://") ? path : `${base}/${path}`;
  if (!url.startsWith(`${API_BASE}/`)) {
    throw new BcError("Business Central returned a link to an unexpected host.");
  }
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${await accessToken(config)}`,
      accept: "application/json",
      ...extraHeaders,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401) {
    cachedToken = undefined;
  }
  const text = await response.text();
  if (!response.ok) {
    throw new BcError(`Business Central returned HTTP ${response.status}: ${errorMessage(text)}`);
  }
  if (text === "") {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new BcError("Business Central returned a response that is not JSON.");
  }
}

function errorMessage(text: string): string {
  try {
    const parsed = z.object({ error: z.object({ message: z.string() }) }).safeParse(JSON.parse(text));
    if (parsed.success) {
      return parsed.data.error.message.slice(0, 300);
    }
  } catch {
    // Not JSON. Fall through.
  }
  return "no detail";
}
