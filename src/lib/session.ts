import { supabase } from "./supabase.ts";

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
  "id, room_code, current_slide, slide_count, slides_url, ended_at, course, title, alert_threshold, status, presenting_started_at, share_with_students";

export async function createSession(input: NewSessionInput = {}): Promise<Session> {
  const user = await ensureSignedIn();

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("sessions")
      .insert({ room_code: generateRoomCode(), host_id: user.id, ...input })
      .select(SESSION_COLUMNS)
      .single();

    if (!error) return data as Session;
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

export async function getSessionByCode(code: string): Promise<Session | null> {
  await ensureSignedIn();
  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("room_code", code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data as Session | null;
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
  return data as Session;
}

export async function joinSession(code: string) {
  const user = await ensureSignedIn();
  const session = await getSessionByCode(code);
  if (!session) throw new Error("No session found with that code.");
  if (session.status === "ended") throw new Error("That session has ended.");
  return { session, deviceId: user.id };
}

// Loads a session for the host screens and says whether this browser is its host
export async function getHostSession(
  code: string,
): Promise<{ session: Session | null; isHost: boolean }> {
  const user = await ensureSignedIn();
  const { data, error } = await supabase
    .from("sessions")
    .select(`${SESSION_COLUMNS}, host_id`)
    .eq("room_code", code.toUpperCase())
    .maybeSingle();

  if (error) throw error;
  if (!data) return { session: null, isHost: false };

  const { host_id, ...session } = data as Session & { host_id: string };
  return { session: session as Session, isHost: host_id === user.id };
}

// The host's most recent unfinished session, if any (used to offer "Resume")
export async function getMyActiveSession(): Promise<Session | null> {
  const user = await ensureSignedIn();
  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("host_id", user.id)
    .in("status", ["lobby", "live"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as Session | null;
}




