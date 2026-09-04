import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Browser Supabase client — cookie-backed session for Admin Auth (anon key only). */
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
