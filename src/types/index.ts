export type Role='LGU Coordinator'|'Barangay Representative'|'Delivery Personnel';
export type ReportStatus='Pending'|'Verified'|'Rejected'|'Correction requested';
export interface Report {id:string; province:string; municipality:string; barangay:string;households:number;population:number;local:number;days:number;urgency:boolean;description:string;date:string;status:ReportStatus;reason:string;lat:number;lng:number}
export interface Resource {id:string;name:string;liters:number;updated:string}
export type DeliveryStatus='Pending'|'Assigned'|'In Transit'|'Completed'|'Failed'|'Partially Delivered';
export interface Delivery {id:string;reportId:string;liters:number;actual:number;status:DeliveryStatus;person:string;vehicle:string;scheduled:string;completed:string;notes:string;sources:{resourceId:string;liters:number}[]}
export interface Audit {date:string;actor:string;action:string}
export interface State {reports:Report[];resources:Resource[];deliveries:Delivery[];audit:Audit[];baseline:number}
