import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut, type User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { auth } from "@/lib/firebase";
import { isOfficeRole, type OfficeRole } from "@/lib/access";
import { watchStaffProfile, type StaffProfile } from "@/services/staffService";

/**
 * Who is signed in, and whether they may use Technofluid Office.
 *
 * States:
 *  - loading   → still asking Firebase
 *  - signedOut → show the sign-in screen
 *  - blocked   → signed in, but not an approved, active admin/accounts/supervisor
 *  - ready     → signed in with an office role
 */
export type Session =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "blocked"; user: User; reason: string }
  | { status: "ready"; user: User; profile: StaffProfile; role: OfficeRole };

interface SessionApi {
  session: Session;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<StaffProfile | null | undefined>(undefined);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  useEffect(() => {
    setProfile(undefined);
    setProfileError(null);
    if (!user) return;
    return watchStaffProfile(
      user.uid,
      (p) => setProfile(p),
      (err) => setProfileError(err.message),
    );
  }, [user]);

  const session = useMemo<Session>(() => {
    if (user === undefined) return { status: "loading" };
    if (user === null) return { status: "signedOut" };
    if (profileError) return { status: "blocked", user, reason: "Your account details could not be loaded. Check your connection and try again." };
    if (profile === undefined) return { status: "loading" };
    if (profile === null || profile.deleted) {
      return { status: "blocked", user, reason: "This account is not set up for Technofluid Office. Ask the admin to add you." };
    }
    if (profile.status !== "approved" || !profile.isActive) {
      return { status: "blocked", user, reason: "This account is not active. Ask the admin to activate it." };
    }
    if (!isOfficeRole(profile.role)) {
      return {
        status: "blocked",
        user,
        reason: "Technofluid Office is for Admin, Accounts and Stock & Production staff. Your account uses the Technofluid website instead.",
      };
    }
    return { status: "ready", user, profile, role: profile.role };
  }, [user, profile, profileError]);

  const api = useMemo<SessionApi>(
    () => ({
      session,
      async signIn(email, password) {
        try {
          await signInWithEmailAndPassword(auth, email.trim(), password);
        } catch (error) {
          throw new Error(friendlyAuthError(error));
        }
      },
      async signOut() {
        await fbSignOut(auth);
      },
    }),
    [session],
  );

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/** The signed-in office user. Only call inside screens rendered after the session is ready. */
export function useStaff(): Extract<Session, { status: "ready" }> {
  const { session } = useSession();
  if (session.status !== "ready") throw new Error("useStaff used before sign-in completed");
  return session;
}

function friendlyAuthError(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "That email and password don't match. Check them and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes, then try again.";
    case "auth/network-request-failed":
      return "No internet connection. Connect and try again.";
    case "auth/user-disabled":
      return "This account has been switched off. Ask the admin.";
    default:
      return "Sign-in failed. Please try again.";
  }
}
