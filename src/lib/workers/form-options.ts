/**
 * Options mirrored from the Google Worker Registration Form.
 * Services are loaded from public.services — not listed here.
 */

export const WORKER_FORM_GENDER_OPTIONS = [
  "Male",
  "Female",
  "Other",
] as const;

export const WORKER_FORM_QUALIFICATION_OPTIONS = [
  "10th",
  "12th",
  "ITI",
  "Diploma",
  "Graduate",
  "Electrician License",
  "Wireman License",
  "AC Technician Certification",
  "Plumbing Certification",
  "Other",
] as const;

export const WORKER_FORM_PREFERRED_TIMING_OPTIONS = [
  "Morning",
  "Afternoon",
  "Evening",
  "Flexible",
  "Full Day",
] as const;
