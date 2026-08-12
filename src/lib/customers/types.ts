/** Matches `public.customers` (live schema). */
export type CustomerStatus = "active" | "inactive" | string;

export type CustomerPreferredLanguage = "mr" | "en" | "hi";

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  area: string;
  pincode: string;
  address_line: string;
  created_at: string;
  landmark: string | null;
  alternate_mobile: string | null;
  preferred_language: CustomerPreferredLanguage;
  is_whatsapp_verified: boolean;
  status: CustomerStatus;
  source: string;
  subscription_status: string;
  updated_at: string;
  is_blocked: boolean;
  block_reason: string | null;
  notes: string | null;
  deleted_at: string | null;
}
