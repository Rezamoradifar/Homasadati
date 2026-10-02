import { z } from "zod";
import { bankCard, iban, nationalId } from "./validation";

/** Bank details for rial withdrawals; shared by the form and the server. */
export const payoutProfileSchema = z
  .object({
    holderName: z.string().trim().min(3).max(120),
    nationalId,
    cardNumber: bankCard,
    iban,
    totp: z.string().optional(),
  })
  .strict();
