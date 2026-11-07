export type AdminMemberAddress = {
  id: string;
  label: string;
  country: string;
  city: string;
  postalCode: string;
  address: string;
};

export type AdminMemberPersonal = {
  name: string;
  email: string | null;
  phone: string | null;
  preferences: { email: boolean; sms: boolean; inApp: boolean };
  firstName: string;
  lastName: string;
  country: string;
  city: string;
  occupation: string;
  language: "fa" | "en" | "ar";
  interests: ("tourism" | "craft" | "beauty" | "ai" | "leather")[];
  nationalId: string | null;
};

export type AdminMemberProfileData = {
  id: string;
  version: string;
  personal: AdminMemberPersonal;
  addresses: AdminMemberAddress[];
  membership: {
    role: string;
    createdAt: string;
    lastSeen: string;
    blocked: boolean;
    referralCode: string;
    contactVerifiedAt: string;
    detailsUpdatedAt: string | null;
    consent: { version: string; acceptedAt: string } | null;
  };
};

export type AdminMemberProfilePatch = {
  expectedVersion: string;
  personal: AdminMemberPersonal;
  addresses: {
    upsert: (Omit<AdminMemberAddress, "id"> & { id?: string })[];
    deleteIds: string[];
  };
  reason: string;
};
