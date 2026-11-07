export type Role = 'LGU Coordinator' | 'Barangay Representative' | 'Delivery Personnel';
export type ReportStatus = 'Pending' | 'Verified' | 'Rejected' | 'Correction requested' | 'Resolved' | 'Withdrawn';

export interface Barangay {
  id: string;
  psgc: string;
  name: string;
  population: number;
  households: number;
  householdPopulation: number;
  referenceDate: string;
  sourceUrl: string;
  lat: number | null;
  lng: number | null;
  coordinateSource?: string;
  coordinateAccuracy?: string;
  sourceUrls?: string[];
  metadata?: Record<string, unknown>;
}

export interface Report {
  id: string;
  province: string;
  municipality: string;
  barangay: string;
  households: number;
  population: number;
  local: number;
  days: number;
  planningDays: number;
  planningDate: string;
  urgency: boolean;
  description: string;
  date: string;
  status: ReportStatus;
  reason: string;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Resource { id: string; name: string; liters: number; updated: string; active: boolean; notes: string }
export interface Team { id: string; name: string; vehicle: string; capacity: number; active: boolean }
export type DeliveryStatus = 'Pending' | 'Assigned' | 'In Transit' | 'Completed' | 'Failed' | 'Partially Delivered' | 'Cancelled';
export interface Delivery {
  id: string;
  reportId: string;
  liters: number;
  actual: number;
  status: DeliveryStatus;
  teamId: string;
  person: string;
  vehicle: string;
  scheduled: string;
  completed: string;
  notes: string;
  sources: { resourceId: string; liters: number }[];
  receipt: { liters: number; notes: string; confirmedAt: string } | null;
}
export interface Audit { id?: string; date: string; actor: string; action: string; command?: string; community?: string; teamId?: string }
export interface State { baseline: number; drinkingBaseline: number; cookingBaseline: number; reports: Report[]; resources: Resource[]; deliveries: Delivery[]; audit: Audit[]; barangays: Barangay[]; teams: Team[]; revision: number }
export interface WorkspaceContext { role: Role; community: string; teamId: string }
export type Command =
  | 'report.create' | 'report.update' | 'report.withdraw' | 'report.review' | 'report.resolve'
  | 'resource.create' | 'resource.update' | 'resource.archive' | 'settings.update'
  | 'allocation.approve' | 'delivery.assign' | 'delivery.start' | 'delivery.confirm'
  | 'delivery.cancel' | 'delivery.receipt' | 'delivery.split' | 'team.create' | 'team.update';
