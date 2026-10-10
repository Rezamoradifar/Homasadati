import {memberCardStatus} from "./seven-card-engine";
/** Current account entitlements; never claims all positions came from this order. */
export function purchaseActivationReceipt(user:string) {
  const member=memberCardStatus(user);
  return {activePositions:member.slots.filter(slot=>slot.active).map(slot=>slot.desk),referralCapacity:member.branches ?? 0,weeklyCapToman:member.weeklyCapToman,live:member.live};
}
