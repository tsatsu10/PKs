/** Throw the Supabase error (so queries enter their error state) or return the data. */
export function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
