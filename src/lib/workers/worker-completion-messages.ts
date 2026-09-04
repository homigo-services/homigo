/** Worker-facing messages for completion OTP verification. */

export function workerCompletionOtpSuccessMessage(lang: "mr" | "hi" | "en"): string {
  return {
    en: "✅ Completion OTP verified. Customer will receive payment options on WhatsApp.",
    mr: "✅ Completion OTP verify झाला. Customer ला payment options WhatsApp वर पाठवले जातील.",
    hi: "✅ Completion OTP verify ho gaya. Customer ko WhatsApp par payment options bheje jayenge.",
  }[lang];
}

export function workerCompletionOtpFailedMessage(
  lang: "mr" | "hi" | "en",
  attemptsRemaining: number,
): string {
  return {
    en: `Incorrect OTP. ${attemptsRemaining} attempt(s) remaining.`,
    mr: `चुकीचा OTP. ${attemptsRemaining} प्रयत्न शिल्लक.`,
    hi: `Galat OTP. ${attemptsRemaining} prayaas shesh.`,
  }[lang];
}

export function workerCompletionOtpExpiredMessage(lang: "mr" | "hi" | "en"): string {
  return {
    en: "OTP has expired. Please request a new completion OTP from the app.",
    mr: "OTP कालबाह्य झाला. App मधून नवीन completion OTP request करा.",
    hi: "OTP expire ho gaya. App se naya completion OTP request karein.",
  }[lang];
}

export function workerCompletionOtpTooManyAttemptsMessage(lang: "mr" | "hi" | "en"): string {
  return {
    en: "Too many incorrect attempts. Request a new completion OTP.",
    mr: "खूप चुकीचे प्रयत्न. नवीन completion OTP request करा.",
    hi: "Bahut galat prayaas. Naya completion OTP request karein.",
  }[lang];
}

export function workerCompletionOtpInvalidFormatMessage(lang: "mr" | "hi" | "en"): string {
  return {
    en: "No pending completion OTP. Enter the 6-digit OTP from the customer, or use the worker app.",
    mr: "कोणताही pending completion OTP नाही. Customer कडून 6-अंकी OTP enter करा किंवा worker app वापरा.",
    hi: "Koi pending completion OTP nahi. Customer se 6-anki OTP enter karein ya worker app use karein.",
  }[lang];
}
