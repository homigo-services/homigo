import type { CustomerPreferredLanguage } from "@/lib/customers/types";

export const HOMIGO_WELCOME = `Welcome to Homigo! 🏠
घरच्या कामांसाठी trusted professional book करण्यासाठी आम्ही इथे आहोत.`;

export const LANGUAGE_SELECTION_PROMPT = `कृपया तुमची भाषा निवडा:

1. मराठी
2. हिंदी
3. English

कृपया 1, 2 किंवा 3 पाठवा.`;

/** First onboarding reply: Homigo welcome + language menu. */
export const ONBOARDING_WELCOME_WITH_LANGUAGE = `${HOMIGO_WELCOME}

${LANGUAGE_SELECTION_PROMPT}`;

/** @deprecated Use ONBOARDING_WELCOME_WITH_LANGUAGE for new conversations. */
export const LANGUAGE_PROMPT = ONBOARDING_WELCOME_WITH_LANGUAGE;

export const COMPLETED_BOOKING_NUDGE: Record<CustomerPreferredLanguage, string> = {
  en: "Your booking is complete. Send hi to book a new service.",
  mr: "तुमची booking complete आहे. नवीन service साठी hi पाठवा.",
  hi: "Aapki booking complete hai. Nayi service ke liye hi bhejen.",
};

export const LANGUAGE_CONFIRMATION: Record<
  CustomerPreferredLanguage,
  string
> = {
  mr: `छान! 😊
तुमची preferred language मराठी म्हणून save केली आहे.

आता मी तुम्हाला Homigo वर service booking करण्यासाठी मदत करतो.`,
  en: `Great! 😊
Your preferred language has been saved as English.

I'll now help you book a Homigo service.`,
  hi: `बहुत बढ़िया! 😊
आपकी preferred language हिंदी के रूप में save कर दी गई है।

अब मैं आपको Homigo service book करने में मदद करूंगा।`,
};

export const RETURNING_GREETING: Record<CustomerPreferredLanguage, string> = {
  mr: "नमस्कार! 👋 Homigo मध्ये परत स्वागत आहे. लवकरच service booking सुरू होईल.",
  en: "Hello! 👋 Welcome back to Homigo. Service booking will begin shortly.",
  hi: "नमस्ते! 👋 Homigo में वापस स्वागत है। जल्द ही service booking शुरू होगी।",
};

export const READY_ACKNOWLEDGMENT: Record<CustomerPreferredLanguage, string> = {
  mr: "धन्यवाद! Service booking लवकरच उपलब्ध होईल. कृपया थोडा वेळ थांबा.",
  en: "Thank you! Service booking will be available soon. Please check back shortly.",
  hi: "धन्यवाद! Service booking जल्द ही उपलब्ध होगी। कृपया थोड़ी देर बाद देखें।",
};

export const UNSUPPORTED_MESSAGE_TYPE =
  "Sorry, I can only read text messages right now. Please type your message.";

export const INVALID_LANGUAGE_SELECTION = `कृपया भाषा निवडा:
1 — मराठी
2 — हिंदी
3 — English`;

/** Map user reply to canonical language code, or null if not a language choice. */
export function parseLanguageSelection(
  text: string,
): CustomerPreferredLanguage | null {
  const normalized = text.trim().toLowerCase();

  if (
    normalized === "1" ||
    normalized === "marathi" ||
    normalized === "mr" ||
    normalized === "मराठी"
  ) {
    return "mr";
  }

  if (
    normalized === "2" ||
    normalized === "hindi" ||
    normalized === "hi language" ||
    normalized === "हिंदी"
  ) {
    return "hi";
  }

  if (
    normalized === "3" ||
    normalized === "english" ||
    normalized === "en"
  ) {
    return "en";
  }

  return null;
}

export function isValidPreferredLanguage(
  value: string | null | undefined,
): value is CustomerPreferredLanguage {
  return value === "en" || value === "mr" || value === "hi";
}
