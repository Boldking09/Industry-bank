import { useEffect, useState, type FormEvent } from "react";
import type { AccountKind } from "../data/seed";
import {
  formatAccountNumber,
  formatRoutingNumber,
  maskNumber,
} from "../lib/format";
import {
  readLocalProfile,
  writeLocalProfile,
  type ProfileDetails,
} from "../lib/profile";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext";
import { useBank } from "../state/BankContext";

interface ProfileRow {
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  date_of_birth: string | null;
  address: string | null;
}

interface Status {
  type: "success" | "error";
  message: string;
}

const ACCOUNT_TYPE_LABELS: Record<AccountKind, string> = {
  checking: "Checking",
  savings: "Savings",
  credit: "Credit card",
};

function initialsFor(name: string): string {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "IB";
}

function revealOrMask(
  value: string,
  show: boolean,
  formatter: (value: string) => string,
): string {
  if (!value.replace(/\D/g, "")) {
    return "—";
  }
  return show ? formatter(value) : maskNumber(value);
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
      <path
        d="M2.2 10S4.9 5.2 10 5.2 17.8 10 17.8 10 15.1 14.8 10 14.8 2.2 10 2.2 10Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="10" cy="10" r="2.3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
      <path
        d="M3 3l14 14M8.2 8.4a2.3 2.3 0 0 0 3.2 3.2M5.5 5.8C3.7 7 2.2 10 2.2 10s2.7 4.8 7.8 4.8c1.2 0 2.3-.3 3.3-.8M8.2 5.4c.6-.1 1.2-.2 1.8-.2 5.1 0 7.8 4.8 7.8 4.8s-.7 1.2-1.9 2.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="M10 2.5l6 2.2v4.6c0 3.6-2.4 6.4-6 8.2-3.6-1.8-6-4.6-6-8.2V4.7l6-2.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7.4 10.1l1.8 1.8 3.5-3.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ProfilePage() {
  const { session, updateProfile } = useAuth();
  const { accounts, loading: accountsLoading } = useBank();

  const [profile, setProfile] = useState<ProfileDetails>(() =>
    readLocalProfile({
      name: session?.name ?? "",
      email: session?.email ?? "",
    }),
  );
  const [draft, setDraft] = useState<ProfileDetails>(profile);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [showNumbers, setShowNumbers] = useState(false);
  const [profileLoading, setProfileLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !session?.id) {
      setProfileLoading(false);
      return;
    }

    let active = true;
    const client = supabase;
    setProfileLoading(true);

    client
      .from("profiles")
      .select("full_name, email, phone_number, date_of_birth, address")
      .eq("id", session.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) {
          return;
        }
        if (error) {
          setStatus({
            type: "error",
            message: `Could not load your profile: ${error.message}`,
          });
        } else if (data) {
          const row = data as ProfileRow;
          const next: ProfileDetails = {
            fullName: row.full_name ?? session.name,
            email: row.email ?? session.email,
            phoneNumber: row.phone_number ?? "",
            dateOfBirth: row.date_of_birth ?? "",
            address: row.address ?? "",
          };
          setProfile(next);
          setDraft(next);
          setStatus(null);
        }
        setProfileLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session?.id]);

  useEffect(() => {
    if (isSupabaseConfigured) {
      return;
    }
    const next = readLocalProfile({
      name: session?.name ?? "",
      email: session?.email ?? "",
    });
    setProfile(next);
    setDraft(next);
  }, [session?.name, session?.email]);

  if (!session) {
    return null;
  }

  function setField<K extends keyof ProfileDetails>(key: K, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function handleEdit() {
    setDraft(profile);
    setEditing(true);
    setStatus(null);
  }

  function handleCancel() {
    setDraft(profile);
    setEditing(false);
    setStatus(null);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      return;
    }

    const next: ProfileDetails = {
      fullName: draft.fullName.trim(),
      email: draft.email.trim().toLowerCase(),
      phoneNumber: draft.phoneNumber.trim(),
      dateOfBirth: draft.dateOfBirth,
      address: draft.address.trim(),
    };

    if (!next.fullName) {
      setStatus({ type: "error", message: "Enter your full name." });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) {
      setStatus({ type: "error", message: "Enter a valid email address." });
      return;
    }

    if (
      next.phoneNumber &&
      next.phoneNumber.replace(/\D/g, "").length < 7
    ) {
      setStatus({ type: "error", message: "Enter a valid phone number." });
      return;
    }

    const emailChanged = next.email !== profile.email;
    setSaving(true);
    setStatus(null);

    try {
      if (isSupabaseConfigured && supabase) {
        const { error: authError } = await supabase.auth.updateUser({
          ...(emailChanged ? { email: next.email } : {}),
          data: {
            full_name: next.fullName,
            phone_number: next.phoneNumber || null,
            date_of_birth: next.dateOfBirth || null,
            address: next.address || null,
          },
        });

        if (authError) {
          throw new Error(authError.message);
        }

        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            full_name: next.fullName,
            email: next.email,
            phone_number: next.phoneNumber || null,
            date_of_birth: next.dateOfBirth || null,
            address: next.address || null,
          })
          .eq("id", session.id);

        if (profileError) {
          throw new Error(profileError.message);
        }
      } else {
        writeLocalProfile(next);
      }

      updateProfile({ name: next.fullName, email: next.email });
      setProfile(next);
      setDraft(next);
      setEditing(false);
      setStatus({
        type: "success",
        message: emailChanged
          ? "Profile saved. Check your inbox to confirm your new email address."
          : "Profile updated.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not save your profile. Try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  const avatar = initialsFor(profile.fullName || session.name);

  return (
    <>
      <header className="page__header profile__head">
        <div className="profile__identity">
          <span className="profile__avatar" aria-hidden="true">
            {avatar}
          </span>
          <div>
            <p className="greeting">Account</p>
            <h1 className="page__title">Profile</h1>
            <p className="page__sub">
              Manage your personal details and the accounts connected to your
              profile.
            </p>
          </div>
        </div>
      </header>

      <div className="profile">
        <section className="card card--pad profile-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Personal info</h2>
              <p className="section-sub">Keep your contact details up to date.</p>
            </div>
            {!editing ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={handleEdit}
              >
                Edit
              </button>
            ) : null}
          </div>

          {profileLoading ? (
            <p className="page__sub">Loading your profile…</p>
          ) : (
            <form className="profile-form" onSubmit={handleSave}>
              <div className="form-row">
                <div className="field">
                  <label className="field__label" htmlFor="profile-name">
                    Full name
                  </label>
                  <input
                    id="profile-name"
                    className="input"
                    type="text"
                    autoComplete="name"
                    value={draft.fullName}
                    readOnly={!editing}
                    onChange={(event) => setField("fullName", event.target.value)}
                  />
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="profile-email">
                    Email
                  </label>
                  <input
                    id="profile-email"
                    className="input"
                    type="email"
                    autoComplete="email"
                    value={draft.email}
                    readOnly={!editing}
                    onChange={(event) => setField("email", event.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="field">
                  <label className="field__label" htmlFor="profile-phone">
                    Phone number
                  </label>
                  <input
                    id="profile-phone"
                    className="input"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+1 (555) 000-0000"
                    value={draft.phoneNumber}
                    readOnly={!editing}
                    onChange={(event) =>
                      setField("phoneNumber", event.target.value)
                    }
                  />
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="profile-dob">
                    Date of birth
                  </label>
                  <input
                    id="profile-dob"
                    className="input"
                    type="date"
                    autoComplete="bday"
                    max={new Date().toISOString().slice(0, 10)}
                    value={draft.dateOfBirth}
                    readOnly={!editing}
                    onChange={(event) =>
                      setField("dateOfBirth", event.target.value)
                    }
                  />
                </div>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="profile-address">
                  Residential address
                </label>
                <input
                  id="profile-address"
                  className="input"
                  type="text"
                  autoComplete="street-address"
                  placeholder="Street, city, state, ZIP"
                  value={draft.address}
                  readOnly={!editing}
                  onChange={(event) => setField("address", event.target.value)}
                />
              </div>

              {status ? (
                <p
                  className={
                    status.type === "success"
                      ? "profile-status profile-status--success"
                      : "profile-status profile-status--error"
                  }
                  role="status"
                >
                  {status.message}
                </p>
              ) : null}

              {editing ? (
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={handleCancel}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              ) : null}
            </form>
          )}
        </section>

        <section className="card card--pad profile-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Bank account info</h2>
              <p className="section-sub">Share these details to receive money.</p>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setShowNumbers((previous) => !previous)}
              aria-pressed={showNumbers}
            >
              {showNumbers ? <EyeOffIcon /> : <EyeIcon />}
              {showNumbers ? "Hide" : "Show"}
            </button>
          </div>

          <div className="bank-list">
            {accounts.map((account) => (
              <div key={account.id} className="bank-row">
                <span
                  className={`dot dot--${account.kind}`}
                  aria-hidden="true"
                />
                <div className="bank-row__main">
                  <span className="bank-row__name">{account.name}</span>
                  <span className="bank-row__type">
                    {ACCOUNT_TYPE_LABELS[account.kind]}
                  </span>
                </div>
                <div className="bank-row__numbers">
                  <div>
                    <span className="bank-row__label">Account number</span>
                    <span className="bank-row__value">
                      {revealOrMask(
                        account.accountNumber,
                        showNumbers,
                        formatAccountNumber,
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="bank-row__label">Routing number</span>
                    <span className="bank-row__value">
                      {revealOrMask(
                        account.routingNumber,
                        showNumbers,
                        formatRoutingNumber,
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {accounts.length === 0 && !accountsLoading ? (
              <p className="section-sub">No accounts found.</p>
            ) : null}
          </div>

          <p className="profile-note">
            <ShieldIcon /> Account and routing numbers are read-only. Contact
            support if something looks wrong.
          </p>
        </section>
      </div>
    </>
  );
}
