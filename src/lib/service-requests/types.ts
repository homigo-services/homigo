/** Matches `public."service-request"` (live schema). */
export type ServiceRequestStatus = "new" | string;

export interface ServiceRequest {
  id: string;
  original_message: string;
  service_type: string;
  issue_type: string | null;
  preferred_time_slot: string;
  area: string;
  pincode: string;
  address: string | null;
  service_date: string;
  status: ServiceRequestStatus;
  created_at: string | null;
  service_frequency: string | null;
  service_duration: string | null;
  customer_id: string;
  rate_card_sent: boolean | null;
  rate_card_accepted: boolean | null;
  customer_mobile: string | null;
}
