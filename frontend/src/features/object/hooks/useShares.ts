import { useState, type FormEvent } from 'react';
import { supabase } from '../../../lib/supabase';
import { useNotifyError } from '../../../lib/useNotifyError';
import { getErrorMessage } from '../../../lib/errors';
import { reportError } from '../../../lib/reportError';
import { useToast } from '../../../context/ToastContext';
import { fetchShares, type ShareRow } from '../../../data/objectDetail';
import type { ObjectRow, SetError } from '../types';

export type ShareRole = 'viewer' | 'editor';

function isValidEmail(str: string) {
  const s = typeof str === 'string' ? str.trim() : '';
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** The owner's share panel: load, add (by email) and revoke shares and pending invites. */
export function useShares({ object, userId, setError }: { object: ObjectRow | null; userId: string | undefined; setError: SetError }) {
  const notifyError = useNotifyError();
  const { addToast } = useToast() as { addToast: (type: string, message: string) => void };
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('viewer');
  const [sharing, setSharing] = useState(false);

  async function load() {
    if (!object?.id || !userId) return;
    try {
      setShares(await fetchShares(object.id));
    } catch (e) {
      reportError(e);
      setShares([]);
      setError(getErrorMessage(e, 'Failed to load shares'));
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!object || !email.trim()) return;
    if (!isValidEmail(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setSharing(true);
    setError('');
    try {
      const trimmed = email.trim();
      const { error: rpcErr } = await supabase.rpc('share_object_by_email', {
        p_object_id: object.id,
        p_email: trimmed,
        p_role: role,
      });
      if (rpcErr) throw rpcErr;
      await load();
      setEmail('');
      addToast('success', `Shared with ${trimmed}. If they don't have a verified PKS account yet, they'll get access when they sign up.`);
    } catch (err) {
      setError(notifyError(err, 'Failed to share'));
    } finally {
      setSharing(false);
    }
  }

  async function revoke(shareId: string) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = shareId.startsWith('invite:')
        ? await supabase.from('share_invites').delete().eq('id', shareId.slice('invite:'.length)).eq('knowledge_object_id', object.id)
        : await supabase.from('share_permissions').delete().eq('id', shareId).eq('knowledge_object_id', object.id);
      if (err) throw err;
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err) {
      setError(notifyError(err, 'Failed to revoke'));
    }
  }

  return { shares, email, setEmail, role, setRole, sharing, load, add, revoke };
}
