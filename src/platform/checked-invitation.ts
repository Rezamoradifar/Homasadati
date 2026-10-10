import {api} from './client';
import {invitationState,invitationCopy,type InvitationState} from './invitation-state';
export class InvitationNotReady extends Error {
  constructor(readonly state:InvitationState){super(invitationCopy[state].text);}
}
/** A consumed placement or renamed code must be checked before copying/sharing. */
export async function checkedInvitation() {
  const data=await api('referral'),state=invitationState(data);
  if(state!=='ready')throw new InvitationNotReady(state);
  return {code:String(data.code),link:location.origin+'/register?ref='+encodeURIComponent(data.code)};
}
