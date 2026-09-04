import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import type { CalculatedBookingAmounts } from "@/lib/rate-cards/calculator";
import { formatCurrency } from "@/lib/bookings/helpers";
import {
  bookingDateOptions,
  formatDisplayDate,
  formatIsoAsDdMmYyyy,
} from "./slots";
import {
  homigoRateCardTitle,
  HOMIGO_CASH_PAYMENT_AMOUNT,
  HOMIGO_UPI_DISCOUNT,
  HOMIGO_UPI_PAYMENT_AMOUNT,
} from "./homigo-services";

export const GENERIC_ERROR: Record<CustomerPreferredLanguage, string> = {
  en: "Sorry, something went wrong. Please try again in a moment.",
  mr: "क्षमस्व, काहीतरी चूक झाली. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.",
  hi: "क्षमा करें, कुछ गलत हो गया। कृपया थोड़ी देर बाद पुनः प्रयास करें।",
};

export const INVALID_SERVICE_SELECTION: Record<CustomerPreferredLanguage, string> = {
  en: "Invalid selection. Please reply with a number from the service list.",
  mr: "चुकीची निवड. कृपया सेवा यादीतून क्रमांक निवडा.",
  hi: "गलत चयन। कृपया सेवा सूची में से सही क्रमांक भेजें।",
};

export const COLLECT_AREA: Record<CustomerPreferredLanguage, string> = {
  en: "Please share your area or locality for this service:",
  mr: "कृपया या सेवेसाठी तुमचा परिसर/भाग लिहा:",
  hi: "कृपया इस सेवा के लिए अपना क्षेत्र/इलाका भेजें:",
};

export const COLLECT_PINCODE: Record<CustomerPreferredLanguage, string> = {
  en: "Please share your 6-digit pincode:",
  mr: "कृपया तुमचा 6-अंकी पिनकोड लिहा:",
  hi: "कृपया अपना 6-अंकी पिनकोड भेजें:",
};

export const COLLECT_ADDRESS: Record<CustomerPreferredLanguage, string> = {
  en: "Please share your full address for the service visit:",
  mr: "कृपया सेवेसाठी तुमचा पूर्ण पत्ता लिहा:",
  hi: "कृपया सेवा के लिए अपना पूरा पता भेजें:",
};

export const INVALID_PINCODE: Record<CustomerPreferredLanguage, string> = {
  en: "Please enter a valid 6-digit pincode.",
  mr: "कृपया वैध 6-अंकी पिनकोड लिहा.",
  hi: "कृपया मान्य 6-अंकी पिनकोड दर्ज करें।",
};

export function dateSelectionPrompt(lang: CustomerPreferredLanguage): string {
  const options = bookingDateOptions();
  const lines = options.map((o) => `${o.index}. ${o.label}`);

  const templates = {
    mr: `आपल्या सेवेसाठीची तारीख निवडा:\n\n${lines.join("\n")}\n\nकृपया पर्याय क्रमांक निवडा.`,
    hi: `अपनी सेवा के लिए तारीख चुनें:\n\n${lines.join("\n")}\n\nकृपया विकल्प क्रमांक चुनें।`,
    en: `Please select the date for your service:\n\n${lines.join("\n")}\n\nPlease reply with the option number.`,
  };

  return templates[lang];
}

export const INVALID_DATE: Record<CustomerPreferredLanguage, string> = {
  en: "That date is not available. Please choose a date within the next 7 days.",
  mr: "ही तारीख उपलब्ध नाही. कृपया पुढील 7 दिवसांतील तारीख निवडा.",
  hi: "यह तारीख उपलब्ध नहीं है। कृपया अगले 7 दिनों में से तारीख चुनें।",
};

export const CUSTOM_DATE_INSTRUCTION: Record<CustomerPreferredLanguage, string> = {
  en: `Please send the date in DD-MM-YYYY format (for example: ${formatIsoAsDdMmYyyy(bookingDateOptions()[0]?.iso ?? "01-01-2026")}).\nBookings are available for the next 7 days only.`,
  mr: `कृपया तारीख DD-MM-YYYY या स्वरूपात पाठवा.\nफक्त पुढील 7 दिवसांसाठी booking उपलब्ध आहे.`,
  hi: `कृपया तारीख DD-MM-YYYY प्रारूप में भेजें।\nबुकिंग केवल अगले 7 दिनों के लिए उपलब्ध है।`,
};

export function savedAddressConfirmationMessage(
  lang: CustomerPreferredLanguage,
  input: { area: string; pincode: string; addressLine: string },
): string {
  const templates = {
    mr: `तुमचा सेवेसाठीचा पत्ता:

📍 परिसर: ${input.area}
📮 पिनकोड: ${input.pincode}
🏠 पत्ता: ${input.addressLine}

हा पत्ता वापरायचा आहे का?
1 — हो, हा पत्ता वापरा
2 — नाही, नवीन पत्ता द्या`,
    hi: `आपकी सेवा का पता:

📍 क्षेत्र: ${input.area}
📮 पिनकोड: ${input.pincode}
🏠 पता: ${input.addressLine}

इस पते का उपयोग करने के लिए 1 भेजें।
पता बदलने के लिए 2 भेजें।`,
    en: `Your address for this service:

📍 Area: ${input.area}
📮 Pincode: ${input.pincode}
🏠 Address: ${input.addressLine}

Reply 1 to use this address.
Reply 2 to enter a new address.`,
  };
  return templates[lang];
}

export const INVALID_ADDRESS_CONFIRM_REPLY: Record<CustomerPreferredLanguage, string> = {
  en: "Please reply with 1 to use this address or 2 to enter a new address.",
  mr: "या पत्त्यासाठी 1 किंवा नवीन पत्त्यासाठी 2 पाठवा.",
  hi: "इस पते के लिए 1 या नया पता दर्ज करने के लिए 2 भेजें।",
};

function pairSlotLines(items: string[]): string {
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 2) {
    if (i + 1 < items.length) {
      rows.push(`${items[i]}, ${items[i + 1]}`);
    } else {
      rows.push(items[i]!);
    }
  }
  return rows.join("\n");
}

export function slotSelectionPrompt(lang: CustomerPreferredLanguage): string {
  const templates = {
    mr: {
      header: "कृपया आपला पसंतीचा वेळ निवडा:",
      items: [
        "1. 08:00–10:00",
        "2. 10:00–12:00",
        "3. 12:00–14:00",
        "4. 14:00–16:00",
        "5. 16:00–18:00",
        "6. 18:00–20:00",
        "7. 20:00–22:00",
      ],
      footer: "कृपया आपल्या पसंतीचा पर्याय निवडा.",
    },
    hi: {
      header: "कृपया अपनी सेवा के लिए सुविधानुसार समय चुनें:",
      items: [
        "1. 08:00–10:00",
        "2. 10:00–12:00",
        "3. 12:00–14:00",
        "4. 14:00–16:00",
        "5. 16:00–18:00",
        "6. 18:00–20:00",
        "7. 20:00–22:00",
      ],
      footer: "कृपया अपना पसंदीदा विकल्प चुनें।",
    },
    en: {
      header: "Please select your preferred time for the service:",
      items: [
        "1. 8:00 AM – 10:00 AM",
        "2. 10:00 AM – 12:00 PM",
        "3. 12:00 PM – 02:00 PM",
        "4. 02:00 PM – 04:00 PM",
        "5. 04:00 PM – 06:00 PM",
        "6. 06:00 PM – 08:00 PM",
        "7. 08:00 PM – 10:00 PM",
      ],
      footer: "Please reply with your preferred option.",
    },
  };

  const t = templates[lang];
  return `${t.header}\n\n${pairSlotLines(t.items)}\n\n${t.footer}`;
}

export const INVALID_SLOT: Record<CustomerPreferredLanguage, string> = {
  en: "Invalid selection. Please reply with a number from 1 to 7.",
  mr: "चुकीची निवड. कृपया 1 ते 7 मधील क्रमांक निवडा.",
  hi: "गलत चयन। कृपया 1 से 7 में से सही क्रमांक भेजें।",
};

export const PRICING_UNAVAILABLE: Record<CustomerPreferredLanguage, string> = {
  en: "Pricing is currently unavailable for this service. Please contact Homigo support or try again later.\n\nSend *hi* anytime to start a new request.",
  mr: "या सेवेसाठी सध्या दर उपलब्ध नाहीत. कृपया Homigo सपोर्टशी संपर्क साधा किंवा नंतर पुन्हा प्रयत्न करा.\n\nनवीन विनंतीसाठी *hi* पाठवा.",
  hi: "इस सेवा के लिए अभी दर उपलब्ध नहीं है। कृपया Homigo सपोर्ट से संपर्क करें या बाद में पुनः प्रयास करें।\n\nनई अनुरोध के लिए *hi* भेजें।",
};

export function rateCardQuoteMessage(
  lang: CustomerPreferredLanguage,
  serviceName: string,
  serviceDate: string,
  slot: string,
  _amounts: CalculatedBookingAmounts,
): string {
  const dateLabel = formatDisplayDate(serviceDate, lang);
  const cash = formatCurrency(HOMIGO_CASH_PAYMENT_AMOUNT);
  const upi = formatCurrency(HOMIGO_UPI_PAYMENT_AMOUNT);
  const discount = formatCurrency(HOMIGO_UPI_DISCOUNT);

  const title = homigoRateCardTitle(serviceName);
  const templates = {
    en: `📋 *${title}*

📅 Date: ${dateLabel}
⏰ Time: ${slot}

*Pricing:*
Cash — ${cash}
UPI — ${upi} (${discount} discount)

Reply:
1 — Accept
2 — Decline`,
    mr: `📋 *${title}*

📅 तारीख: ${dateLabel}
⏰ वेळ: ${slot}

*दर:*
Cash — ${cash}
UPI — ${upi} (₹${HOMIGO_UPI_DISCOUNT} सवलत)

उत्तर द्या:
1 — मान्य करा
2 — नकार करा`,
    hi: `📋 *${title}*

📅 तारीख: ${dateLabel}
⏰ समय: ${slot}

*दर:*
Cash — ${cash}
UPI — ${upi} (₹${HOMIGO_UPI_DISCOUNT} छूट)

उत्तर दें:
1 — स्वीकार करें
2 — अस्वीकार करें`,
  };

  return templates[lang];
}

export const RATE_CARD_ACCEPTED: Record<CustomerPreferredLanguage, string> = {
  en: "Thank you! Homigo has received your service request. Our technician will contact you shortly.",
  mr: "धन्यवाद! Homigo ने आपली विनंती नोंदवली आहे. आमचा Technician लवकरच आपल्याशी संपर्क साधेल.",
  hi: "धन्यवाद! Homigo ने आपकी सेवा अनुरोध दर्ज कर ली है. हमारा Technician जल्द ही आपसे संपर्क करेगा.",
};

export const RATE_CARD_REJECTED: Record<CustomerPreferredLanguage, string> = {
  en: "No problem. Your request has been cancelled. Send *hi* anytime to book a new service.",
  mr: "काही हरकत नाही. तुमची विनंती रद्द केली आहे. नवीन सेवेसाठी *hi* पाठवा.",
  hi: "कोई बात नहीं। आपका अनुरोध रद्द कर दिया गया है। नई सेवा के लिए *hi* भेजें।",
};

export const INVALID_RATE_CARD_REPLY: Record<CustomerPreferredLanguage, string> = {
  en: "Please reply with 1 to accept or 2 to decline.",
  mr: "स्वीकारासाठी 1 किंवा नकारासाठी 2 पाठवा.",
  hi: "स्वीकार के लिए 1 या अस्वीकार के लिए 2 भेजें।",
};

export const WORKER_MATCHING_PENDING: Record<CustomerPreferredLanguage, string> = {
  en: RATE_CARD_ACCEPTED.en,
  mr: RATE_CARD_ACCEPTED.mr,
  hi: RATE_CARD_ACCEPTED.hi,
};

export const WORKER_MATCHING_STARTED: Record<
  CustomerPreferredLanguage,
  (offerCount: number) => string
> = {
  en: () => RATE_CARD_ACCEPTED.en,
  mr: () => RATE_CARD_ACCEPTED.mr,
  hi: () => RATE_CARD_ACCEPTED.hi,
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
