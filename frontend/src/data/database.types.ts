export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// PLACEHOLDER: regenerate with `npm run gen:types` once the Supabase project is reachable
// (it was paused/unreachable when this branch was built). Rows are intentionally loose until
// then; the CI database job warns while this file differs from the branch's migrations.
export type Database = {
  public: {
    Tables: Record<string, {
      Row: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      Insert: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      Update: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      Relationships: unknown[];
    }>;
    Views: Record<string, never>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
