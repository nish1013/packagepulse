export type Ecosystem = "pypi" | "npm";
export type Band = "healthy" | "watch" | "at_risk" | "unknown";
export type Severity = "critical" | "warning" | "info";
export type ProviderStatus = "ok" | "not_found" | "failed" | "timeout" | "skipped";

export interface Reason {
  code: string;
  points: number;
  message: string;
  source: string;
}

export interface Dimension {
  score: number | null;
  band: Band;
  reasons: Reason[];
}

export interface Scores {
  overall: number | null;
  band: Band;
  coverage: number;
  security: Dimension;
  maintenance: Dimension;
  community: Dimension;
  supply_chain: Dimension;
}

export interface Flag {
  code: string;
  severity: Severity;
  message: string;
}

export interface Vulnerability {
  id: string;
  summary: string | null;
  url: string;
}

export interface Repository {
  name: string;
  url: string;
  stars: number;
  open_issues: number;
  archived: boolean;
  pushed_at: string | null;
}

export interface Dependents {
  total: number;
  direct: number;
}

export interface ScorecardCheck {
  name: string;
  score: number;
}

export interface Scorecard {
  score: number;
  checks: ScorecardCheck[];
}

export interface Source {
  status: ProviderStatus;
  http_status: number | null;
  ms: number;
  cached: boolean;
  reason: string | null;
}

export interface PackageReport {
  ecosystem: Ecosystem;
  name: string;
  version: string | null;
  published_at: string | null;
  deprecated: string | null;
  repository: Repository | null;
  dependents: Dependents | null;
  vulnerabilities: Vulnerability[] | null;
  scorecard: Scorecard | null;
  scores: Scores;
  flags: Flag[];
  sources: Record<string, Source>;
  timing: { elapsed_ms: number; sequential_ms: number };
}

export interface StreamError {
  code: string;
  message: string;
}

export interface StartEvent {
  request_id: string;
  ecosystem: Ecosystem;
  name: string;
  version: string | null;
  planned: string[];
}

export interface ProviderStartEvent {
  source: string;
  t_ms: number;
}

export interface ProviderEvent {
  source: string;
  status: ProviderStatus;
  http_status: number | null;
  reason: string | null;
  cached: boolean;
  t_start_ms: number;
  t_end_ms: number;
}

export type Relation = "SELF" | "DIRECT" | "INDIRECT";

export interface GraphNode {
  id: string;
  name: string;
  version: string;
  relation: Relation;
}

export interface GraphEdge {
  from: string;
  to: string;
  requirement: string;
}

export interface GraphEvent {
  root: { ecosystem: Ecosystem; name: string; version: string };
  requested_version: string;
  fallback: boolean;
  truncated: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface NodeHealthEvent {
  id: string;
  overall: number | null;
  band: Band;
  worst_flag: string | null;
}

export interface GraphDoneEvent {
  scored: number;
  unscored: number;
  elapsed_ms: number;
}

export interface ScanPackage {
  index: number;
  ecosystem: Ecosystem;
  name: string;
  dev: boolean;
}

export interface ScanStartEvent {
  kind: string;
  total: number;
  packages: ScanPackage[];
}

export interface ScanPackageEvent {
  index: number;
  dev: boolean;
  report: PackageReport;
}

export interface ScanFailedEvent extends ScanPackage {
  code: string;
}

export interface FixFirstEntry {
  ecosystem: Ecosystem;
  name: string;
  dev: boolean;
  priority: number;
  overall: number | null;
  band: Band;
  reasons: string[];
}

export interface ScanSummary {
  total: number;
  checked: number;
  failed: number;
  flagged: number;
  elapsed_ms: number;
  sequential_ms: number;
  speedup: number | null;
  cached_calls: number;
  fix_first: FixFirstEntry[];
}
