/** Provider formatting only; account/OTP identity remains unchanged in storage.
 * Kavenegar's REST examples use domestic 09... receptors for Iranian mobiles:
 * https://kavenegar.com/rest.html (Send and Verify/Lookup).
 * Preserve the existing 00 prefix for other international numbers. */
export function smsReceptor(target: string) {
  return target
    .replace(/^(?:\+98|0098|98)(9\d{9})$/, "0$1")
    .replace(/^\+/, "00");
}
