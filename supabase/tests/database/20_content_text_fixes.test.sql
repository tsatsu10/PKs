BEGIN;
SELECT plan(16);

-- blocknote_plain_text ------------------------------------------------------------------------
SELECT is(public.blocknote_plain_text(
  '[{"type":"paragraph","content":[{"type":"text","text":"see "},{"type":"link","href":"http://x","content":[{"type":"text","text":"here"}]}],"children":[]}]'),
  'see here', 'link text appears once');
SELECT is(public.blocknote_plain_text(
  '[{"type":"table","content":{"type":"tableContent","rows":[{"cells":[[{"type":"text","text":"a"}],{"type":"tableCell","content":[{"type":"text","text":"b"}]}]}]},"children":[]}]'),
  'ab', 'table cell text appears once');
SELECT is(public.blocknote_plain_text(
  '[{"type":"paragraph","content":[{"type":"text","text":"1"}],"children":[{"type":"paragraph","content":[{"type":"text","text":"1.1"}],"children":[{"type":"paragraph","content":[{"type":"text","text":"1.1.1"}],"children":[]}]},{"type":"paragraph","content":[{"type":"text","text":"1.2"}],"children":[]}]},{"type":"paragraph","content":[{"type":"text","text":"2"}],"children":[]}]'),
  E'1\n1.1\n1.1.1\n1.2\n2', 'blocks come out depth-first, children after their parent');
SELECT is(public.blocknote_plain_text(NULL), NULL, 'NULL input gives NULL');
SELECT is(public.blocknote_plain_text('{}'), NULL, 'non-array input gives NULL');
SELECT is(public.blocknote_plain_text('[]'), '', 'an empty document gives an empty string');

CREATE TEMP TABLE big AS
SELECT jsonb_agg(jsonb_build_object('type', 'paragraph', 'children', '[]'::jsonb,
         'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'line ' || i)))) AS doc
FROM generate_series(1, 8000) AS i;
CREATE TEMP TABLE timing AS
SELECT clock_timestamp() AS t0, length(public.blocknote_plain_text(doc)) AS len, clock_timestamp() AS t1 FROM big;
SELECT ok((SELECT len > 0 AND t1 - t0 < interval '2 seconds' FROM timing),
  '8000 blocks convert in under 2 seconds (was quadratic)');

-- markdown_plain_text -------------------------------------------------------------------------
SELECT is(public.markdown_plain_text(E'Intro\n\n- one\n- [x] two'), E'Intro\n\none\ntwo',
  'the blank line before a list is kept');
SELECT is(public.markdown_plain_text(E'Intro\n\n# Head'), E'Intro\n\nHead',
  'the blank line before a heading is kept');
SELECT is(public.markdown_plain_text(E'> a\n>\n> b'), E'a\n\nb',
  'an empty quote line does not join its neighbours');
SELECT is(public.markdown_plain_text(E'Intro\n\n```js\ncode\n```'), E'Intro\n\n\ncode\n',
  'fences are removed without eating the blank line before them');

-- sync_object_content -------------------------------------------------------------------------
SELECT tests.create_user('owner');
INSERT INTO public.knowledge_objects (id, user_id, title, content) VALUES
  ('00000000-0000-0000-0000-000000000001', tests.uid('owner'), 'Sync', '**hi**');
SELECT is((SELECT content_text FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  'hi', 'insert derives content_text');

-- Plant a stale value with the trigger off, to see whether later updates re-derive.
ALTER TABLE public.knowledge_objects DISABLE TRIGGER trg_knowledge_objects_sync_content;
UPDATE public.knowledge_objects SET content_text = 'stale' WHERE id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.knowledge_objects ENABLE TRIGGER trg_knowledge_objects_sync_content;

SELECT tests.act_as('owner');
UPDATE public.knowledge_objects SET is_pinned = true WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is((SELECT content_text FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  'stale', 'a pin toggle does not re-derive content_text');
UPDATE public.knowledge_objects SET content_text = 'forged' WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is((SELECT content_text FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  'stale', 'a client cannot write content_text');
UPDATE public.knowledge_objects SET content = '_new_' WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is((SELECT content_text FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  'new', 'a content edit re-derives content_text');
UPDATE public.knowledge_objects SET content = 'j', content_json =
  '[{"type":"paragraph","content":[{"type":"text","text":"json"}],"children":[]}]'
WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is((SELECT content_text FROM public.knowledge_objects WHERE id = '00000000-0000-0000-0000-000000000001'),
  'json', 'a content_json edit re-derives from the JSON');
RESET ROLE; SELECT set_config('request.jwt.claims', '', true);

SELECT * FROM finish();
ROLLBACK;
