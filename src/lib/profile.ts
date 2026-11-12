export interface ProfileDetails {
  fullName: string;
  email: string;
  phoneNumber: string;
  dateOfBirth: string;
  address: string;
}

export const LOCAL_PROFILE_KEY = "ib.profile.v1";

const DEMO_EMAIL = "alex.morgan@industrybank.com";

const DEMO_DEFAULTS: Pick<ProfileDetails, "phoneNumber" | "dateOfBirth" | "address"> = {
  phoneNumber: "+1 (415) 555-0134",
  dateOfBirth: "1990-04-12",
  address: "128 Maple Court, Apt 4B, San Francisco, CA 94107",
};

export function readLocalProfile(fallback: {
  name: string;
  email: string;
}): ProfileDetails {
  try {
    const raw = localStorage.getItem(LOCAL_PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ProfileDetails>;
      if (typeof parsed?.fullName === "string") {
        return {
          fullName: parsed.fullName,
          email: typeof parsed.email === "string" ? parsed.email : fallback.email,
          phoneNumber:
            typeof parsed.phoneNumber === "string" ? parsed.phoneNumber : "",
          dateOfBirth:
            typeof parsed.dateOfBirth === "string" ? parsed.dateOfBirth : "",
          address: typeof parsed.address === "string" ? parsed.address : "",
        };
      }
    }
  } catch {
    // Ignore malformed local data and fall through to the defaults.
  }

  const isDemo = fallback.email.trim().toLowerCase() === DEMO_EMAIL;

  return {
    fullName: fallback.name,
    email: fallback.email,
    phoneNumber: isDemo ? DEMO_DEFAULTS.phoneNumber : "",
    dateOfBirth: isDemo ? DEMO_DEFAULTS.dateOfBirth : "",
    address: isDemo ? DEMO_DEFAULTS.address : "",
  };
}

export function writeLocalProfile(profile: ProfileDetails): void {
  localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile));
}
