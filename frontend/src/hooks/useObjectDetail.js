import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getDraft, DRAFT_KEYS } from '../lib/draftStorage';
import { getErrorMessage } from '../lib/errors';

/**
 * Loads a single knowledge object and all related data (versions, domains, tags, links, files, prompts, suggestions).
 * @param {{ id: string | undefined, userId: string | undefined }} options
 * @returns { object, setObject, loading, error, setError, reload, draft, initialEditForm, ...related state }
 */
export function useObjectDetail({ id, userId }) {
  const [object, setObject] = useState(null);
  const [versions, setVersions] = useState([]);
  const [objectDomains, setObjectDomains] = useState([]);
  const [objectTags, setObjectTags] = useState([]);
  const [allDomains, setAllDomains] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [outgoingLinks, setOutgoingLinks] = useState([]);
  const [incomingLinks, setIncomingLinks] = useState([]);
  const [otherObjects, setOtherObjects] = useState([]);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [promptTemplates, setPromptTemplates] = useState([]);
  const [promptRuns, setPromptRuns] = useState([]);
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [suggestedLinkedObjects, setSuggestedLinkedObjects] = useState([]);
  const [myShare, setMyShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id || !userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    try {
      // Fetch object without content (smaller payload); fetch content in parallel for large docs.
      const OBJECT_COLS = 'id, user_id, type, title, source, summary, key_points, is_deleted, current_version, created_at, updated_at, is_pinned, status, slug, cover_url, due_at, remind_at';
      const [objRes, contentRes] = await Promise.all([
        supabase.from('knowledge_objects').select(OBJECT_COLS).eq('id', id).single(),
        supabase.from('knowledge_objects').select('content').eq('id', id).single(),
      ]);
      if (cancelled) return;
      const e1 = objRes.error;
      const obj = objRes.data;
      if (e1 || !obj) {
        setError(getErrorMessage(e1, 'Not found'));
        setObject(null);
        setLoading(false);
        return;
      }
      if (obj.is_deleted) {
        setError('This object has been deleted');
        setObject(null);
        setLoading(false);
        return;
      }
      obj.content = contentRes.data?.content ?? null;
      setObject(obj);

      const myShareRes = await supabase
        .from('share_permissions')
        .select('id, role')
        .eq('knowledge_object_id', id)
        .eq('shared_with_user_id', userId)
        .maybeSingle();
      if (!cancelled) setMyShare(myShareRes.data || null);

      const [
        versRes,
        kodRes,
        kotRes,
        domRes,
        tagRes,
        outRes,
        inRes,
        othersRes,
        kofRes,
        ptRes,
        prRes,
      ] = await Promise.all([
        supabase
          .from('knowledge_object_versions')
          .select('id, version, title, content, summary, key_points, created_at, edited_by')
          .eq('knowledge_object_id', id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('knowledge_object_domains').select('domain_id, domains(id, name)').eq('knowledge_object_id', id),
        supabase.from('knowledge_object_tags').select('tag_id, tags(id, name)').eq('knowledge_object_id', id),
        supabase.from('domains').select('id, name').eq('user_id', userId).order('name'),
        supabase.from('tags').select('id, name').eq('user_id', userId).order('name'),
        supabase.from('link_edges').select('id, to_object_id, relationship_type').eq('from_object_id', id),
        supabase.from('link_edges').select('id, from_object_id, relationship_type').eq('to_object_id', id),
        supabase
          .from('knowledge_objects')
          .select('id, title, type')
          .eq('user_id', userId)
          .eq('is_deleted', false)
          .neq('id', id)
          .order('title')
          .limit(200),
        supabase
          .from('knowledge_object_files')
          .select('file_id, files(id, filename, mime_type, size_bytes, storage_key)')
          .eq('knowledge_object_id', id),
        supabase.from('prompt_templates').select('id, name, applies_to_types, prompt_text').eq('user_id', userId).order('name'),
        supabase
          .from('prompt_runs')
          .select('id, prompt_template_id, status, output, created_at')
          .eq('knowledge_object_id', id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      if (cancelled) return;

      setAttachedFiles((kofRes.data || []).map((r) => r.files).filter(Boolean));
      setPromptTemplates(ptRes.data || []);
      setPromptRuns(prRes.data || []);
      setVersions(versRes.data || []);
      setObjectDomains((kodRes.data || []).map((r) => r.domains).filter(Boolean));
      setObjectTags((kotRes.data || []).map((r) => r.tags).filter(Boolean));
      setAllDomains(domRes.data || []);
      setAllTags(tagRes.data || []);

      const outRows = outRes.data || [];
      const inRows = inRes.data || [];
      const toIds = [...new Set(outRows.map((r) => r.to_object_id))];
      const fromIds = [...new Set(inRows.map((r) => r.from_object_id))];
      const allLinkIds = [...new Set([...toIds, ...fromIds])];
      let targetMap = {};
      if (allLinkIds.length > 0) {
        const { data: objs, error: objsErr } = await supabase.from('knowledge_objects').select('id, title, type').in('id', allLinkIds);
        if (objsErr) {
          if (import.meta.env.DEV) console.warn('Link targets fetch failed:', objsErr);
        }
        targetMap = (objs || []).reduce((acc, o) => ({ ...acc, [o.id]: o }), {});
        // When fetch failed or RLS hid some rows, show "Unknown" instead of raw UUID
        for (const linkId of allLinkIds) {
          if (!targetMap[linkId]) targetMap[linkId] = { id: linkId, title: 'Unknown', type: '' };
        }
      }
      setOutgoingLinks(
        outRows.map((r) => ({
          id: r.id,
          to_object_id: r.to_object_id,
          relationship_type: r.relationship_type || 'references',
          target: targetMap[r.to_object_id],
        }))
      );
      setIncomingLinks(
        inRows.map((r) => ({
          id: r.id,
          from_object_id: r.from_object_id,
          relationship_type: r.relationship_type || 'references',
          source: targetMap[r.from_object_id],
        }))
      );
      setOtherObjects(othersRes.data || []);

      const [sugTagsRes, sugLinkRes] = await Promise.all([
        supabase.rpc('suggest_tags_for_object', { p_object_id: id }),
        supabase.rpc('suggest_linked_objects', { p_object_id: id, limit_n: 10 }),
      ]);
      if (!cancelled) {
        const tagSuggestions =
          sugTagsRes.data?.length
            ? sugTagsRes.data
            : (await supabase.rpc('suggest_tags_for_object_fallback', { p_object_id: id })).data || [];
        setSuggestedTags(tagSuggestions);
        setSuggestedLinkedObjects(sugLinkRes.data || []);
      }
    } catch (e) {
      if (!cancelled) {
        setError(getErrorMessage(e, 'Load failed'));
        setObject(null);
      }
    } finally {
      if (!cancelled) setLoading(false);
    }
    return () => { cancelled = true; };
  }, [id, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const draft = id ? getDraft(DRAFT_KEYS.object(id)) : null;

  return {
    object,
    setObject,
    loading,
    error,
    setError,
    reload: load,
    draft,
    versions,
    setVersions,
    objectDomains,
    setObjectDomains,
    objectTags,
    setObjectTags,
    allDomains,
    allTags,
    outgoingLinks,
    setOutgoingLinks,
    incomingLinks,
    setIncomingLinks,
    otherObjects,
    attachedFiles,
    setAttachedFiles,
    promptTemplates,
    promptRuns,
    setPromptRuns,
    suggestedTags,
    suggestedLinkedObjects,
    myShare,
  };
}
