BEGIN;
SELECT plan(2);

SELECT hasnt_function('public', 'import_register', ARRAY['uuid', 'text', 'uuid', 'jsonb'],
  'import_register dropped');
SELECT hasnt_function('public', 'import_get_existing_object', ARRAY['uuid', 'text'],
  'import_get_existing_object dropped');

SELECT * FROM finish();
ROLLBACK;
