import { supabase } from "./supabase";
import { getPageCount } from "./pdf";
import { attachSlideUrl, SESSION_COLUMNS, type Session } from "./session";

const MAX_MB = 25;

export async function uploadSlides(sessionId: string, file: File): Promise<Session> {
  if (file.type !== "application/pdf") throw new Error("Please choose a PDF file.");
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`The PDF must be under ${MAX_MB} MB.`);

  const pageCount = await getPageCount(file);
  const path = `${sessionId}/${Date.now()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("slides")
    .upload(path, file, { contentType: "application/pdf" });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("sessions")
    .update({
      slides_path: path,
      slides_url: null,
      slide_count: pageCount,
      current_slide: 1,
    })
    .eq("id", sessionId)
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw error;

  return attachSlideUrl(data as Session);
}