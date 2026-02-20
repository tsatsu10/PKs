import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

/**
 * Resolves /objects/by-slug/:slug to the object id and redirects to /objects/:id.
 */
export default function ObjectBySlug() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!user?.id || !slug) {
      setStatus('not-found');
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('knowledge_objects')
        .select('id')
        .eq('user_id', user.id)
        .eq('slug', slug)
        .eq('is_deleted', false)
        .maybeSingle();
      if (error || !data?.id) {
        setStatus('not-found');
        return;
      }
      navigate(`/objects/${data.id}`, { replace: true });
    })();
  }, [user?.id, slug, navigate]);

  if (status === 'not-found') {
    return (
      <div className="detail-layout" style={{ padding: '2rem' }}>
        <p>Object not found for this slug.</p>
        <a href="/">Go to Dashboard</a>
      </div>
    );
  }
  return <p style={{ padding: '2rem' }}>Redirecting…</p>;
}
