import type { CustomerPreferredLanguage } from "@/lib/customers/types";

export function completionOtpCustomerMessage(
  lang: CustomerPreferredLanguage,
  otp: string,
): string {
  const templates = {
    en: `Your service is completed. Your verification OTP is ${otp}. Please share this OTP to confirm service completion.`,
    mr: `तुमची service पूर्ण झाली आहे. तुमचा verification OTP ${otp} आहे. Service completion confirm करण्यासाठी हा OTP पाठवा.`,
    hi: `आपकी service complete हो गई है. आपका verification OTP ${otp} है. Service completion confirm करने के लिए यह OTP भेजें.`,
  };
  return templates[lang];
}

export function otpVerificationPrompt(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "Please enter the 6-digit OTP sent to you to confirm service completion.",
    mr: "Service completion confirm करण्यासाठी पाठवलेला 6-अंकी OTP enter करा.",
    hi: "Service completion confirm करने के लिए भेजा गया 6-digit OTP enter करें.",
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
    hi: `गलत OTP. ${attemptsRemaining} attempt(s) बाकी.`,
  };
  return templates[lang];
}

export function expiredOtpMessage(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "This OTP has expired. Please ask the worker to request a new completion OTP.",
    mr: "हा OTP expire झाला आहे. Worker कडून नवीन completion OTP मागवा.",
    hi: "यह OTP expire हो गया है. Worker से नया completion OTP request करें.",
  };
  return templates[lang];
}

export function tooManyOtpAttemptsMessage(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "Too many incorrect attempts. Please ask the worker to request a new completion OTP.",
    mr: "खूप चुकीचे प्रयत्न. Worker कडून नवीन completion OTP मागवा.",
    hi: "बहुत गलत attempts. Worker से नया completion OTP request करें.",
  };
  return templates[lang];
}

export function completionVerifiedMessage(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "✅ Service completion verified.",
    mr: "✅ Service completion verify झाले.",
    hi: "✅ Service completion verify हो गया.",
  };
  return templates[lang];
}

export function bookingConfirmedAwaitOtpMessage(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "Your booking is confirmed. You will receive an OTP on WhatsApp when the worker completes the service.",
    mr: "तुमची booking confirm आहे. Worker service complete करताच तुम्हाला WhatsApp वर OTP मिळेल.",
    hi: "आपकी booking confirm है. Worker service complete करte hi आपको WhatsApp par OTP milega.",
  };
  return templates[lang];
}

export function paymentModeMenu(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: `Service completion verified. Please select payment method:

1. Cash
2. Card

Reply with 1 or 2.`,
    mr: `Service completion verify झाले. Payment method निवडा:

1. Cash
2. Card

1 किंवा 2 पाठवा.`,
    hi: `Service completion verify ho gaya. Payment method chunen:

1. Cash
2. Card

1 ya 2 bhejen.`,
  };
  return templates[lang];
}

export function invalidPaymentModeReply(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "Invalid choice. Reply with 1 for Cash or 2 for Card.",
    mr: "चुकीची निवड. Cash साठी 1 किंवा Card साठी 2 पाठवा.",
    hi: "Galat choice. Cash ke liye 1 ya Card ke liye 2 bhejen.",
  };
  return `${templates[lang]}\n\n${paymentModeMenu(lang)}`;
}

export function paymentModeSavedMessage(
  lang: CustomerPreferredLanguage,
  input: { bookingRef: string; mode: "cash" | "card" },
): string {
  const label = input.mode === "cash" ? "Cash" : "Card";
  const templates = {
    en: `✅ Payment method saved: ${label}

📋 Ref: ${input.bookingRef}
Payment status: Pending

We will update you when payment is processed.`,
    mr: `✅ Payment method save झाला: ${label}

📋 Ref: ${input.bookingRef}
Payment status: Pending`,
    hi: `✅ Payment method save ho gaya: ${label}

📋 Ref: ${input.bookingRef}
Payment status: Pending`,
  };
  return templates[lang];
}

export function paymentModeAlreadySelectedMessage(
  lang: CustomerPreferredLanguage,
  input: { bookingRef: string; mode: "cash" | "card" },
): string {
  const label = input.mode === "cash" ? "Cash" : "Card";
  const templates = {
    en: `Payment method is already set to ${label} for booking ${input.bookingRef}. Payment status: Pending`,
    mr: `Booking ${input.bookingRef} साठी payment method आधीच ${label} आहे. Payment status: Pending`,
    hi: `Booking ${input.bookingRef} ke liye payment method pehle se ${label} hai. Payment status: Pending`,
  };
  return templates[lang];
}

export function cardPaymentPendingMessage(
  lang: CustomerPreferredLanguage,
  bookingRef: string,
): string {
  const templates = {
    en: `Card payment for booking ${bookingRef} is pending. We will notify you when payment processing is available.`,
    mr: `Booking ${bookingRef} साठी card payment pending आहे.`,
    hi: `Booking ${bookingRef} ke liye card payment pending hai.`,
  };
  return templates[lang];
}

export function cashPaymentPendingMessage(
  lang: CustomerPreferredLanguage,
  bookingRef: string,
): string {
  const templates = {
    en: `Cash payment for booking ${bookingRef} is pending confirmation.`,
    mr: `Booking ${bookingRef} साठी cash payment confirm होण्याची वाट पाहत आहे.`,
    hi: `Booking ${bookingRef} ke liye cash payment confirm hone ka intezar hai.`,
  };
  return templates[lang];
}

export function noOtpPendingMessage(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "No OTP is pending. Please wait for the worker to complete the service.",
    mr: "कोणताही OTP pending नाही. Worker service complete होईपर्यंत थांबा.",
    hi: "Koi OTP pending nahi hai. Worker service complete hone tak wait karein.",
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
