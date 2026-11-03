import { supabase } from "./supabase.ts";

const SLIDE_URL_SECONDS = 60 * 60 * 6;

// NO I or O, so codes aren't easily confused with 1 or 0
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateRoomCode(length = 4): string {
  const values = crypto.getRandomValues(new Uint32Array(length));
  let code = "";
  for (const v of values) code += LETTERS[v % LETTERS.length];
  return code;
}

// Reuse the existing anonymous user if there is one; otherwise, create a new anonymous user
export async function ensureSignedIn() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user;

  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signIn.user)
    throw error ?? new Error("Failed to sign in anonymously");
  return signIn.user;
}

export type SessionStatus = "lobby" | "live" | "ended";

export type Session = {
  id: string;
  room_code: string;
  current_slide: number;
  slide_count: number | null;
  slides_path: string | null;
  slides_url: string | null;
  ended_at: string | null;
  course: string | null;
  title: string | null;
  alert_threshold: number;
  status: SessionStatus;
  presenting_started_at: string | null;
  share_with_students: boolean;
};

export type NewSessionInput = {
  course?: string | null;
  title?: string | null;
  alert_threshold?: number;
};

export const SESSION_COLUMNS =
  "id, room_code, current_slide, slide_count, slides_path, slides_url, ended_at, course, title, alert_threshold, status, presenting_started_at, share_with_students";

export type HostSessionLookup =
  | { kind: "ready"; session: Session }
  | { kind: "missing" }
  | { kind: "not-host" };

// The database stores the object path. This mints a URL the PDF viewer can fetch.
export async function signedSlideUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("slides")
    .createSignedUrl(path, SLIDE_URL_SECONDS);
  if (error || !data?.signedUrl) {
    if (error) console.error(error);
    return null;
  }
  return data.signedUrl;
}

export async function attachSlideUrl(session: Session): Promise<Session> {
  const slides_url = await signedSlideUrl(session.slides_path);
  return slides_url ? { ...session, slides_url } : session;
}

export async function createSession(input: NewSessionInput = {}): Promise<Session> {
  const user = await ensureSignedIn();

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("sessions")
      .insert({ room_code: generateRoomCode(), host_id: user.id, ...input })
      .select(SESSION_COLUMNS)
      .single();

    if (!error) return attachSlideUrl(data as Session);
    if (error.code !== "23505") throw error;
  }
  throw new Error("Couldn't create a unique room code. Try again.");
}

export async function setCurrentSlide(sessionId: string, slide: number) {
  const { data, error } = await supabase
    .from("sessions")
    .update({ current_slide: slide })
    .eq("id", sessionId)
    .select("id");
  if (error) throw error;
  if (!data.length)
    throw new Error("Not allowed to change slides for this session.");
}


export async function updateSession(
  sessionId: string,
  patch: Partial<Omit<Session, "id" | "room_code">>,
): Promise<Session> {
  const { data, error } = await supabase
    .from("sessions")
    .update(patch)
    .eq("id", sessionId)
    .select(SESSION_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Not allowed to change this session.");
  return attachSlideUrl(data as Session);
}

function messageFrom(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (/slow down/i.test(message)) {
    return "Too many tries. Wait a minute, then try the code again.";
  }
  return message || fallback;
}

// One code entry. The database enrolls only when this call finds the room and
// the phone is still under the join cap. A wrong code does not create a member.
export async function joinSession(code: string) {
  const user = await ensureSignedIn();
  const { data, error } = await supabase.rpc("join_session", {
    p_code: code.toUpperCase(),
  });
  if (error) throw new Error(messageFrom(error, "Couldn't join."));
  if (!data) throw new Error("No session found with that code.");
  return { session: await attachSlideUrl(data as Session), deviceId: user.id };
}

// The host gets the session. Looking up someone else's code does not enroll,
// and shares the same guess limit as a wrong join.
export async function getHostSession(code: string): Promise<HostSessionLookup> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc("host_session_lookup", {
    p_code: code.toUpperCase(),
  });
  if (error) throw new Error(messageFrom(error, "Couldn't load the session."));
  const lookup = data as { kind?: string; session?: Session } | null;
  if (!lookup || lookup.kind === "missing" || !lookup.session) {
    return lookup?.kind === "not-host" ? { kind: "not-host" } : { kind: "missing" };
  }
  if (lookup.kind !== "ready") return { kind: "not-host" };
  return { kind: "ready", session: await attachSlideUrl(lookup.session) };
}

// The host's most recent unfinished session, if any (used to offer "Resume")
export async function getMyActiveSession(): Promise<Session | null> {
  const user = await ensureSignedIn();
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("host_id", user.id)
    .in("status", ["lobby", "live"])
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? attachSlideUrl(data as Session) : null;
}




