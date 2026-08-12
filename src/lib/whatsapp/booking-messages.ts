import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import type { CalculatedBookingAmounts } from "@/lib/rate-cards/calculator";
import { formatCurrency } from "@/lib/bookings/helpers";
import {
  formatDisplayDate,
  TIME_SLOTS,
  tomorrowIso,
  todayIso,
} from "./slots";

export const GENERIC_ERROR: Record<CustomerPreferredLanguage, string> = {
  en: "Sorry, something went wrong. Please try again in a moment.",
  mr: "क्षमस्व, काहीतरी चूक झाली. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.",
  hi: "क्षमा करें, कुछ गलत हो गया। कृपया थोड़ी देर बाद पुनः प्रयास करें।",
};

export const INVALID_SERVICE_SELECTION: Record<CustomerPreferredLanguage, string> = {
  en: "Invalid selection. Reply with a number from the service list.",
  mr: "चुकीची निवड. service list मधील number पाठवा.",
  hi: "गलत चयन। service list में से number भेजें।",
};

export const COLLECT_AREA: Record<CustomerPreferredLanguage, string> = {
  en: "Please share your area/locality:",
  mr: "कृपया तुमचा area/locality पाठवा:",
  hi: "कृपया अपना area/locality भेजें:",
};

export const COLLECT_PINCODE: Record<CustomerPreferredLanguage, string> = {
  en: "Please share your 6-digit pincode:",
  mr: "कृपया तुमचा 6-अंकी pincode पाठवा:",
  hi: "कृपया अपना 6-अंकी pincode भेजें:",
};

export const COLLECT_ADDRESS: Record<CustomerPreferredLanguage, string> = {
  en: "Please share your full address:",
  mr: "कृपया तुमचा full address पाठवा:",
  hi: "कृपया अपना full address भेजें:",
};

export const INVALID_PINCODE: Record<CustomerPreferredLanguage, string> = {
  en: "Please enter a valid 6-digit pincode.",
  mr: "कृपया वैध 6-अंकी pincode प्रविष्ट करा.",
  hi: "कृपया valid 6-अंकी pincode दर्ज करें।",
};

export function dateSelectionPrompt(lang: CustomerPreferredLanguage): string {
  const today = todayIso();
  const tomorrow = tomorrowIso();
  const headers = {
    en: "When would you like the service?",
    mr: "तुम्हाला service कधी हवी आहे?",
    hi: "आपको service कब चाहिए?",
  };
  const options = {
    en: [
      `1. Today (${today})`,
      `2. Tomorrow (${tomorrow})`,
      "3. Another date (reply as DD-MM-YYYY)",
    ],
    mr: [
      `1. आज (${today})`,
      `2. उद्या (${tomorrow})`,
      "3. दुसरी तारीख (DD-MM-YYYY मध्ये reply करा)",
    ],
    hi: [
      `1. आज (${today})`,
      `2. कल (${tomorrow})`,
      "3. दूसरी तारीख (DD-MM-YYYY में reply करें)",
    ],
  };
  return `${headers[lang]}\n\n${options[lang].join("\n")}`;
}

export const INVALID_DATE: Record<CustomerPreferredLanguage, string> = {
  en: "Invalid or past date. Please choose today, tomorrow, or a future date (DD-MM-YYYY).",
  mr: "चुकीची किंवा मागील तारीख. आज, उद्या किंवा भविष्यातील तारीख (DD-MM-YYYY) निवडा.",
  hi: "गलत या past date। आज, कल या future date (DD-MM-YYYY) चुनें।",
};

export function slotSelectionPrompt(lang: CustomerPreferredLanguage): string {
  const headers = {
    en: "Please select a 2-hour time slot:",
    mr: "कृपया 2-तासाचा time slot निवडा:",
    hi: "कृपया 2-घंटे का time slot चुनें:",
  };
  const lines = TIME_SLOTS.map((s) => `${s.index}. ${s.value}`);
  return `${headers[lang]}\n\n${lines.join("\n")}`;
}

export const INVALID_SLOT: Record<CustomerPreferredLanguage, string> = {
  en: "Invalid slot. Reply with a number from 1 to 7.",
  mr: "चुकीचा slot. 1 ते 7 मधील number पाठवा.",
  hi: "गलत slot। 1 से 7 में से number भेजें।",
};

export const PRICING_UNAVAILABLE: Record<CustomerPreferredLanguage, string> = {
  en: "Pricing is currently unavailable for this service. Please contact Homigo support or try again later.\n\nReply *hi* anytime to start a new request.",
  mr: "या service साठी सध्या pricing उपलब्ध नाही. कृपया Homigo support शी संपर्क साधा किंवा नंतर पुन्हा प्रयत्न करा.\n\nनवीन request साठी *hi* पाठवा.",
  hi: "इस service के लिए अभी pricing उपलब्ध नहीं है। कृपया Homigo support से संपर्क करें या बाद में पुनः प्रयास करें।\n\nनया request शुरू करने के लिए *hi* भेजें।",
};

export function rateCardQuoteMessage(
  lang: CustomerPreferredLanguage,
  serviceName: string,
  serviceDate: string,
  slot: string,
  amounts: CalculatedBookingAmounts,
): string {
  const dateLabel = formatDisplayDate(serviceDate, lang);
  const base = formatCurrency(amounts.base_amount);
  const lead = formatCurrency(amounts.lead_charge);
  const total = formatCurrency(amounts.final_amount);

  const templates = {
    en: `📋 Service quote for *${serviceName}*

📅 Date: ${dateLabel}
⏰ Slot: ${slot}

Base amount: ${base}
Lead charge: ${lead}
*Total: ${total}*

Reply:
1️⃣ Accept
2️⃣ Reject`,
    mr: `📋 *${serviceName}* साठी quote

📅 तारीख: ${dateLabel}
⏰ Slot: ${slot}

Base amount: ${base}
Lead charge: ${lead}
*एकूण: ${total}*

Reply:
1️⃣ Accept
2️⃣ Reject`,
    hi: `📋 *${serviceName}* के लिए quote

📅 Date: ${dateLabel}
⏰ Slot: ${slot}

Base amount: ${base}
Lead charge: ${lead}
*Total: ${total}*

Reply:
1️⃣ Accept
2️⃣ Reject`,
  };

  return templates[lang];
}

export const RATE_CARD_ACCEPTED: Record<CustomerPreferredLanguage, string> = {
  en: "Thank you! Your quote has been accepted. We are finding a worker for you — you will hear from us shortly.",
  mr: "धन्यवाद! तुमचा quote accept झाला आहे. आम्ही worker शोधत आहोत — लवकरच संपर्क करू.",
  hi: "धन्यवाद! आपका quote accept हो गया है। हम worker ढूंढ रहे हैं — जल्द ही संपर्क करेंगे।",
};

export const RATE_CARD_REJECTED: Record<CustomerPreferredLanguage, string> = {
  en: "No problem. Your request has been cancelled. Reply *hi* anytime to book a new service.",
  mr: "काही हरकत नाही. तुमची request cancel झाली. नवीन service booking साठी *hi* पाठवा.",
  hi: "कोई बात नहीं। आपका request cancel हो गया। नई service book करने के लिए *hi* भेजें।",
};

export const INVALID_RATE_CARD_REPLY: Record<CustomerPreferredLanguage, string> = {
  en: "Please reply with 1 to Accept or 2 to Reject.",
  mr: "Accept साठी 1 किंवा Reject साठी 2 reply करा.",
  hi: "Accept के लिए 1 या Reject के लिए 2 reply करें।",
};

export const WORKER_MATCHING_PENDING: Record<CustomerPreferredLanguage, string> = {
  en: "Your request is being processed. We will notify you when a worker is assigned.",
  mr: "तुमची request process होत आहे. worker assign झाल्यावर आम्ही कळवू.",
  hi: "आपका request process हो रहा है। worker assign होने पर हम सूचित करेंगे।",
};

export const WORKER_MATCHING_STARTED: Record<
  CustomerPreferredLanguage,
  (offerCount: number) => string
> = {
  en: (n) =>
    n > 0
      ? `Thank you! Your quote is accepted. We are contacting ${n} nearby worker(s). You will be notified when one accepts.`
      : "Thank you! Your quote is accepted. We could not find available workers right now — our team will follow up shortly.",
  mr: (n) =>
    n > 0
      ? `धन्यवाद! Quote accept झाला. आम्ही ${n} worker ला contact करत आहोत. कोणी accept केल्यावर कळवू.`
      : "धन्यवाद! Quote accept झाला. सध्या available worker सापडले नाहीत — team लवकर contact करेल.",
  hi: (n) =>
    n > 0
      ? `धन्यवाद! Quote accept हो गया। हम ${n} workers को contact कर रहे हैं। accept होने पर सूचित करेंगे।`
      : "धन्यवाद! Quote accept हो गया। अभी available worker नहीं मिला — team जल्द contact करेगी।",
};

export function returningCustomerGreetingWithMenu(
  lang: CustomerPreferredLanguage,
  menuBody: string,
): string {
  const greetings = {
    en: "Hello! 👋 Welcome back to Homigo.\n\n",
    mr: "नमस्कार! 👋 Homigo मध्ये परत स्वागत आहे.\n\n",
    hi: "नमस्ते! 👋 Homigo में वापस स्वागत है।\n\n",
  };
  return `${greetings[lang]}${menuBody}`;
}

export function languageConfirmationWithMenu(
  lang: CustomerPreferredLanguage,
  confirmation: string,
  menuBody: string,
): string {
  return `${confirmation}\n\n${menuBody}`;
}
