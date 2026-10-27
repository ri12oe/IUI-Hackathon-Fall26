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

    const { data: signIn, error} = await supabase.auth.signInAnonymously();
    if (error || !signIn.user ) throw error ?? new Error("Failed to sign in anonymously");
    return signIn.user;
}

export type Session = {
    id: string;
    room_code: string;
    current_slide: number;
};

export async function createSession(): Promise<Session> {
    const user = await ensureSignedIn();

    // Retry if the random code is already taken
    for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error } = await supabase
            .from("sessions")
            .insert({ room_code: generateRoomCode(), host_id: user.id})
            .select("id, room_code, current_slide")
            .single();
        if (!error) return data;
        if (error.code !== "23505") throw error; // 23505 is unique violation, retry if code is taken
    }
    throw new Error("Couldn't create a unique room code. Try again.");
}