import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getDraft, DRAFT_KEYS } from '../lib/draftStorage';

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
      const { data: obj, error: e1 } = await supabase
        .from('knowledge_objects')
        .select('*')
        .eq('id', id)
        .single();
      if (cancelled) return;
      if (e1 || !obj) {
        setError(e1?.message ?? e1?.error_description ?? 'Not found');
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
        const { data: objs } = await supabase.from('knowledge_objects').select('id, title, type').in('id', allLinkIds);
        targetMap = (objs || []).reduce((acc, o) => ({ ...acc, [o.id]: o }), {});
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
        setError(e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Load failed'));
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

  const initialEditForm =
    object == null
      ? { title: '', content: '', summary: '', source: '' }
      : {
          title: object.title,
          content: object.content || '',
          summary: object.summary || '',
          source: object.source || '',
        };

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
