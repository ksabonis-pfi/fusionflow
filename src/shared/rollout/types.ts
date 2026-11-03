import type { Stage } from "./program";

export interface Order {
  id: string;
  order_number: string;
  sow_number: string;
  access_token: string;
  stage: Stage;
  wave: string;
  region: string;
  store_number: string;
  store_name: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string;
  timezone: string;
  contact_name: string;
  contact_title: string | null;
  contact_email: string;
  contact_phone: string;
  submitted_by: string;
  template_id: string;
  model_id: string;
  phone_qty: number;
  has_poe: number;
  number_option: "new" | "port";
  port_number: string | null;
  port_carrier: string | null;
  notes: string | null;
  one_time_total: number;
  monthly_total: number;
  signed_name: string | null;
  signed_title: string | null;
  signed_at: string | null;
  scansource_order: string | null;
  zoom_site_id: string | null;
  main_number: string | null;
  carrier: string | null;
  tracking_number: string | null;
  eta: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  live_at: string | null;
  verified_at: string | null;
  autopilot: number;
  next_step_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Phone {
  id: string;
  order_id: string;
  seq: number;
  label: string;
  model_id: string;
  extension: string | null;
  mac: string | null;
  serial: string | null;
  zoom_device_id: string | null;
  setup_token: string;
  status: "pending" | "provisioned" | "registered" | "verified";
  registered_at: string | null;
  verified_at: string | null;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  ts: string;
  kind: "milestone" | "integration" | "alert" | "note";
  system: "portal" | "scansource" | "zoom" | "carrier" | "ops" | "store";
  title: string;
  detail: string | null;
  request_json: string | null;
  response_json: string | null;
}

export interface SupportRequest {
  id: string;
  order_id: string;
  phone_id: string | null;
  ts: string;
  category: string;
  message: string;
  status: "open" | "resolved";
}

export interface OrderDetail {
  order: Order;
  phones: Phone[];
  events: OrderEvent[];
  support: SupportRequest[];
}

export interface Alert {
  order_id: string;
  order_number: string;
  store: string;
  region: string;
  kind: "not_registered" | "carrier_exception" | "support_request" | "unsigned";
  message: string;
  ts: string;
}

export interface NewOrderInput {
  store_number: string;
  store_name: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  timezone: string;
  contact_name: string;
  contact_title?: string;
  contact_email: string;
  contact_phone: string;
  submitted_by: string;
  template_id: string;
  model_id: string;
  phone_qty: number;
  has_poe: boolean;
  number_option: "new" | "port";
  port_number?: string;
  port_carrier?: string;
  notes?: string;
}
