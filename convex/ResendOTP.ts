import { Email } from "@convex-dev/auth/providers/Email";
import { createOtpDeliveryEnvelope } from "./otpDelivery";

const OWNER_OTP_WEBHOOK = "https://n8n.viaczakaznikov.sk/webhook/chief-of-staff-owner-otp";

function generateOTP(length: number): string {
  const digits = "0123456789";
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (num) => digits[num % digits.length]).join("");
}

export const ResendOTP = Email({
  id: "resend-otp",
  maxAge: 60 * 15,
  async generateVerificationToken() {
    return generateOTP(6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const signingSecret = process.env.JWT_PRIVATE_KEY;
    if (!signingSecret) throw new Error("OTP signing is not configured");
    const envelope = await createOtpDeliveryEnvelope(email, token, signingSecret);
    const response = await fetch(OWNER_OTP_WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(envelope),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to send verification email");
    }
  },
});
