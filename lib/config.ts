import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

export const APP_NAME = PRODUCT_NAME;
export const APP_DESCRIPTION = PRODUCT_TAGLINE;

export const BIRTH_TIME_CONFIDENCE_OPTIONS = [
  "exact",
  "approximate",
  "unknown",
] as const;

export const TONE_PREFERENCE_OPTIONS = [
  "grounded",
  "warm",
  "direct",
] as const;

export const BAZI_CALCULATION_MARKER_OPTIONS = ["M", "F"] as const;
