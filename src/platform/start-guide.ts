import { one, type Row } from "./schema";
import { companyPositionStatus } from "./company-members";
import { memberDetailsSchema } from "./registration-model";
import { buildStartGuide } from "./start-guide-model";
/** Read only status fields; bank details stay encrypted and never enter dashboard data. */
export function memberStartGuide(user:Row,club:Row,invitation:Row,commissions:Row[]) {
  let profileComplete=false;
  const details=one("SELECT details FROM p_member_details WHERE user_id=?",user.id)?.details;
  try {profileComplete=!!details && memberDetailsSchema.safeParse(JSON.parse(details)).success;}catch {}
  const company=companyPositionStatus(user.id);
  const exempt=!!company && "exempt" in company && company.exempt;
  return buildStartGuide({
    profileComplete,bankStatus:one("SELECT status FROM p_payout_profiles WHERE user_id=?",user.id)?.status || null,
    twoFactor:!!user.otp_secret,activeDesks:club.desks,
    permanent:exempt && company?.status==="qualified",
    companyNeedsPurchase:!!company && !exempt && ["grace","not_started"].includes(company.status),
    invitationState:invitation.state,directMembers:invitation.directMembers,
    hasNetworkActivity:club.leftVolume>0 || club.rightVolume>0 || club.pendingRewards>0 || commissions.length>0,
  });
}
