export interface SafetyResult {
  cleanedText: string;
  flags: string[];
  blocked: boolean;
  reason?: string;
}

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?\d{1,3}[ -]?)?(?:\(?\d{3}\)?[ -]?)\d{3}[ -]?\d{4}\b/g;
const MEDICAL_DIAGNOSIS_PATTERN =
  /\b(diagnose|diagnosis|medical advice|prescribe|treatment plan)\b/i;

export const applySafetyGuards = (rawInput: string): SafetyResult => {
  const flags: string[] = [];
  let cleanedText = rawInput;

  if (EMAIL_PATTERN.test(cleanedText)) {
    cleanedText = cleanedText.replace(EMAIL_PATTERN, '[redacted-email]');
    flags.push('email_redacted');
  }

  if (PHONE_PATTERN.test(cleanedText)) {
    cleanedText = cleanedText.replace(PHONE_PATTERN, '[redacted-phone]');
    flags.push('phone_redacted');
  }

  if (MEDICAL_DIAGNOSIS_PATTERN.test(cleanedText)) {
    return {
      cleanedText,
      flags: [...flags, 'medical_diagnosis_refused'],
      blocked: true,
      reason: 'Medical diagnosis requests are not supported in this platform.',
    };
  }

  return {
    cleanedText,
    flags,
    blocked: false,
  };
};
