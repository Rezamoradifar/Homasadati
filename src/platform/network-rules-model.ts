import { z } from "zod";
const whole = z.number().int().min(0).max(1e12);
export const binaryRulesSchema = z
  .object({
    leftRatio: z.number().int().min(1).max(100),
    rightRatio: z.number().int().min(1).max(100),
    dailyCap: whole,
    carryDays: z.number().int().min(0).max(3650),
    personalMinimum: whole,
    activityDays: z.number().int().min(1).max(3650),
    directMinimum: z.number().int().min(0).max(10000),
  })
  .strict();
export const legacyBinaryRules = {
  leftRatio: 1,
  rightRatio: 1,
  dailyCap: 0,
  carryDays: 0,
  personalMinimum: 0,
  activityDays: 30,
  directMinimum: 0,
};
export type BinaryRules = z.infer<typeof binaryRulesSchema>;
export const simulationSchema = z
  .object({
    rules: binaryRulesSchema,
    left: whole,
    right: whole,
    budget: whole,
    alreadyEarned: whole,
    rateBps: z.number().int().min(0).max(10000),
    eligible: z.boolean(),
  })
  .strict();
/** Shared integer-only calculation for the simulator and live matching engine. */
export function binaryQuote(input: z.infer<typeof simulationSchema>) {
  const { rules, rateBps } = input;
  const allowance = Math.min(
    input.budget,
    rules.dailyCap
      ? Math.max(0, rules.dailyCap - input.alreadyEarned)
      : input.budget,
  );
  const units =
    input.eligible && rateBps
      ? Math.min(
          Math.floor(input.left / rules.leftRatio),
          Math.floor(input.right / rules.rightRatio),
          Number((BigInt(allowance) * 10000n) / BigInt(rateBps)),
        )
      : 0;
  const amount = Number((BigInt(units) * BigInt(rateBps)) / 10000n);
  const volume = amount ? units : 0;
  return {
    volume,
    amount,
    leftConsumed: volume * rules.leftRatio,
    rightConsumed: volume * rules.rightRatio,
    leftCarry: input.left - volume * rules.leftRatio,
    rightCarry: input.right - volume * rules.rightRatio,
    allowance,
  };
}
