import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import {
  HOMIGO_CASH_PAYMENT_AMOUNT,
  HOMIGO_UPI_DISCOUNT,
  HOMIGO_UPI_PAYMENT_AMOUNT,
} from "./homigo-services";

export function completionOtpCustomerMessage(
  lang: CustomerPreferredLanguage,
  otp: string,
): string {
  const templates = {
    en: `Your service is complete. Your verification OTP is ${otp}.

Please share this OTP with the Homigo technician. The technician will enter it to confirm completion.`,
    mr: `तुमची सेवा पूर्ण झाली आहे. तुमचा verification OTP ${otp} आहे.

कृपया हा OTP Homigo Technician ला सांगा. Technician completion confirm करण्यासाठी OTP enter करेल.`,
    hi: `Aapki service complete ho gayi hai. Aapka verification OTP ${otp} hai.

Kripya yeh OTP Homigo Technician ko batayein. Technician completion confirm karne ke liye OTP enter karega.`,
  };
  return templates[lang];
}

/** Customer must NOT enter OTP — share with worker instead. */
export function customerAwaitingWorkerOtpMessage(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "Please share the OTP you received with the Homigo technician. They will enter it to confirm service completion. You do not need to type the OTP here.",
    mr: "कृपया तुम्हाला मिळालेला OTP Homigo Technician ला सांगा. ते completion confirm करण्यासाठी OTP enter करतील. तुम्हाला येथे OTP टाइप करण्याची गरज नाही.",
    hi: "Kripya aapko mila OTP Homigo Technician ko batayein. Woh completion confirm karne ke liye OTP enter karenge. Aapko yahan OTP type karne ki zarurat nahi hai.",
  };
  return templates[lang];
}

export function wrongOtpMessage(
  lang: CustomerPreferredLanguage,
  attemptsRemaining: number,
): string {
  const templates = {
    en: `Incorrect OTP. ${attemptsRemaining} attempt(s) remaining. Please try again.`,
    mr: `चुकीचा OTP. ${attemptsRemaining} प्रयत्न शिल्लक.`,
    hi: `गलत OTP. ${attemptsRemaining} प्रयास शेष हैं।`,
  };
  return templates[lang];
}

export function expiredOtpMessage(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "This OTP has expired. Please ask the technician to request a new completion OTP.",
    mr: "हा OTP कालबाह्य झाला आहे. Technician कडून नवीन OTP मागवा.",
    hi: "यह OTP समाप्त हो गया है। Technician से नया OTP मांगें।",
  };
  return templates[lang];
}

export function tooManyOtpAttemptsMessage(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "Too many incorrect attempts. Please ask the technician to request a new completion OTP.",
    mr: "खूप चुकीचे प्रयत्न. Technician कडून नवीन OTP मागवा.",
    hi: "बहुत गलत प्रयास। Technician से नया OTP मांगें।",
  };
  return templates[lang];
}

export function completionVerifiedMessage(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "✅ Service completion verified.",
    mr: "✅ सेवा पूर्ण झाल्याची पुष्टी झाली.",
    hi: "✅ सेवा पूर्ण होने की पुष्टि हो गई।",
  };
  return templates[lang];
}

export function bookingConfirmedAwaitOtpMessage(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "Your booking is confirmed. You will receive an OTP on WhatsApp when the technician completes the service.",
    mr: "तुमची booking confirm आहे. Technician सेवा पूर्ण करताच तुम्हाला WhatsApp वर OTP मिळेल.",
    hi: "आपकी booking confirm है। Technician सेवा पूर्ण करte hi आपको WhatsApp par OTP milega.",
  };
  return templates[lang];
}

export function paymentModeMenu(lang: CustomerPreferredLanguage): string {
  const cash = HOMIGO_CASH_PAYMENT_AMOUNT;
  const upi = HOMIGO_UPI_PAYMENT_AMOUNT;
  const discount = HOMIGO_UPI_DISCOUNT;

  const templates = {
    en: `Service completion verified. Please select payment method:

1. Cash — ₹${cash}
2. UPI — ₹${upi} (₹${discount} discount)

Reply with 1 or 2.`,
    mr: `सेवा पूर्ण झाल्याची पुष्टी झाली. Payment method निवडा:

1. Cash — ₹${cash}
2. UPI — ₹${upi} (₹${discount} सवलत)

1 किंवा 2 पाठवा.`,
    hi: `सेवा पूर्ण होने की पुष्टि हो गई। Payment method चुनें:

1. Cash — ₹${cash}
2. UPI — ₹${upi} (₹${discount} छूट)

1 या 2 भेजें।`,
  };
  return templates[lang];
}

export function invalidPaymentModeReply(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "Invalid choice. Reply with 1 for Cash or 2 for UPI.",
    mr: "चुकीची निवड. Cash साठी 1 किंवा UPI साठी 2 पाठवा.",
    hi: "गलत चयन। Cash के लिए 1 या UPI के लिए 2 भेजें।",
  };
  return `${templates[lang]}\n\n${paymentModeMenu(lang)}`;
}

function paymentModeLabel(mode: "cash" | "upi", lang: CustomerPreferredLanguage): string {
  if (mode === "cash") {
    return { en: "Cash", mr: "Cash", hi: "Cash" }[lang];
  }
  return { en: "UPI", mr: "UPI", hi: "UPI" }[lang];
}

export function paymentModeSavedMessage(
  lang: CustomerPreferredLanguage,
  input: { bookingRef: string; mode: "cash" | "upi"; amount: number },
): string {
  const label = paymentModeLabel(input.mode, lang);
  const amount = Math.round(input.amount);
  const templates = {
    en: `✅ Payment method saved: ${label}

📋 Ref: ${input.bookingRef}
💰 Amount: ₹${amount}
Payment status: Pending

We will update you when payment is processed.`,
    mr: `✅ Payment method save झाला: ${label}

📋 Ref: ${input.bookingRef}
💰 रक्कम: ₹${amount}
Payment status: Pending`,
    hi: `✅ Payment method save ho gaya: ${label}

📋 Ref: ${input.bookingRef}
💰 राशि: ₹${amount}
Payment status: Pending`,
  };
  return templates[lang];
}

export function paymentModeAlreadySelectedMessage(
  lang: CustomerPreferredLanguage,
  input: { bookingRef: string; mode: "cash" | "upi"; amount: number },
): string {
  const label = paymentModeLabel(input.mode, lang);
  const amount = Math.round(input.amount);
  const templates = {
    en: `Payment method is already set to ${label} for booking ${input.bookingRef}.

💰 Amount: ₹${amount}
Payment status: Pending`,
    mr: `Booking ${input.bookingRef} साठी payment method आधीच ${label} आहे.

💰 रक्कम: ₹${amount}
Payment status: Pending`,
    hi: `Booking ${input.bookingRef} ke liye payment method pehle se ${label} hai.

💰 राशि: ₹${amount}
Payment status: Pending`,
  };
  return templates[lang];
}

export function upiPaymentPendingMessage(
  lang: CustomerPreferredLanguage,
  bookingRef: string,
  amount: number,
): string {
  const value = Math.round(amount);
  const templates = {
    en: `UPI payment of ₹${value} for booking ${bookingRef} is pending. We will notify you when payment processing is available.`,
    mr: `Booking ${bookingRef} साठी ₹${value} UPI payment pending आहे.`,
    hi: `Booking ${bookingRef} ke liye ₹${value} UPI payment pending hai.`,
  };
  return templates[lang];
}

export function upiPaymentLinkMessage(
  lang: CustomerPreferredLanguage,
  input: { bookingRef: string; amount: number; url: string },
): string {
  const value = Math.round(input.amount);
  const templates = {
    en: `✅ UPI payment selected for booking ${input.bookingRef}

💰 Amount: ₹${value}

Pay securely here:
${input.url}

We will confirm once payment is received.`,
    mr: `✅ Booking ${input.bookingRef} — UPI payment

💰 रक्कम: ₹${value}

येथे pay करा:
${input.url}

Payment मिळाल्यावर confirm करू.`,
    hi: `✅ Booking ${input.bookingRef} — UPI payment

💰 राशि: ₹${value}

Yahan pay karein:
${input.url}

Payment milne par confirm karenge.`,
  };
  return templates[lang];
}

export function upiPaymentCompletedMessage(
  lang: CustomerPreferredLanguage,
  bookingRef: string,
  amount: number,
): string {
  const value = Math.round(amount);
  const templates = {
    en: `✅ UPI payment of ₹${value} received for booking ${bookingRef}. Thank you for choosing Homigo!`,
    mr: `✅ Booking ${bookingRef} साठी ₹${value} UPI payment मिळाले. Homigo निवडल्याबद्दल धन्यवाद!`,
    hi: `✅ Booking ${bookingRef} ke liye ₹${value} UPI payment mil gaya. Homigo chunne ke liye dhanyavaad!`,
  };
  return templates[lang];
}

export function cashPaymentPendingMessage(
  lang: CustomerPreferredLanguage,
  bookingRef: string,
  amount: number,
): string {
  const value = Math.round(amount);
  const templates = {
    en: `Cash payment of ₹${value} for booking ${bookingRef} is pending confirmation.`,
    mr: `Booking ${bookingRef} साठी ₹${value} cash payment confirm होण्याची वाट पाहत आहे.`,
    hi: `Booking ${bookingRef} ke liye ₹${value} cash payment confirm hone ka intezar hai.`,
  };
  return templates[lang];
}

export function noOtpPendingMessage(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "No OTP is pending. Please wait for the technician to complete the service.",
    mr: "कोणताही OTP pending नाही. Technician सेवा पूर्ण होईपर्यंत थांबा.",
    hi: "Koi OTP pending nahi hai. Technician service complete hone tak wait karein.",
  };
  return templates[lang];
}

export function alreadyVerifiedOtpMessage(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "Service completion is already verified.",
    mr: "Service completion आधीच verify झाले आहे.",
    hi: "Service completion pehle se verify ho chuka hai.",
  };
  return templates[lang];
}

export function cashPaymentCompletedMessage(
  lang: CustomerPreferredLanguage,
  input: {
    bookingRef: string;
    serviceType: string;
    finalAmount: number;
    workerName: string;
  },
): string {
  const amount = Math.round(Number(input.finalAmount) || 0);
  const templates = {
    en: `✅ Your service has been completed and cash payment of ₹${amount} has been received.

📋 Ref: ${input.bookingRef}
🔧 ${input.serviceType}
👷 ${input.workerName}
💳 Payment: Cash — Completed

Thank you for choosing Homigo!`,
    mr: `✅ तुमची service पूर्ण झाली आणि ₹${amount} cash payment received झाले.

📋 Ref: ${input.bookingRef}
🔧 ${input.serviceType}
👷 ${input.workerName}
💳 Payment: Cash — Completed

Homigo निवडल्याबद्दल धन्यवाद!`,
    hi: `✅ Aapki service complete ho gayi aur ₹${amount} cash payment receive ho gaya.

📋 Ref: ${input.bookingRef}
🔧 ${input.serviceType}
👷 ${input.workerName}
💳 Payment: Cash — Completed

Homigo choose karne ke liye dhanyavaad!`,
  };
  return templates[lang];
}

/** @deprecated use upiPaymentPendingMessage */
export const cardPaymentPendingMessage = upiPaymentPendingMessage;
