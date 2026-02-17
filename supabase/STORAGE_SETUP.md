# PKS Storage bucket (Phase 6)

After running the Phase 6 migration, create the file bucket in Supabase:

1. **Dashboard → Storage → New bucket**
   - Name: `pks-files`
   - **Private** (not public)

2. **Policies** (Storage → pks-files → Policies → New policy)

   - **Allow uploads** (INSERT):  
     Name: `Users upload own`  
     Policy: `(bucket_id = 'pks-files') AND ((storage.foldername(name))[1] = (auth.uid())::text)`

   - **Allow reads** (SELECT): same expression

   - **Allow deletes** (DELETE): same expression

This restricts access so each user can only read/upload/delete under their own folder (`user_id/...`).
