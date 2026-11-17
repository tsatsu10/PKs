import { useState, type FormEvent } from 'react';
import { supabase } from '../../../lib/supabase';
import { useNotifyError } from '../../../lib/useNotifyError';
import { getErrorMessage } from '../../../lib/errors';
import { reportError } from '../../../lib/reportError';
import { useToast } from '../../../components/ui/Toaster';
import { fetchShares, type ShareRow } from '../../../data/objectDetail';
import { useUndoToast } from './useUndoToast';
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
  const undoToast = useUndoToast();
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

  /** Removes the row at once (back on failure) and offers Undo, which shares again with the same email and role. */
  async function revoke(shareId: string) {
    if (!object) return;
    setError('');
    const oid = object.id;
    const removed = shares.find((x) => x.id === shareId);
    setShares((prev) => prev.filter((x) => x.id !== shareId));
    const pending = (async () => {
      const { error: err } = shareId.startsWith('invite:')
        ? await supabase.from('share_invites').delete().eq('id', shareId.slice('invite:'.length)).eq('knowledge_object_id', oid)
        : await supabase.from('share_permissions').delete().eq('id', shareId).eq('knowledge_object_id', oid);
      if (err) throw err;
    })();
    // Undo shares again by email, so a legacy row without one can't be undone.
    const email = removed?.shared_with_email;
    const withdraw = removed && email
      ? undoToast('Access removed', async () => {
        const { error: rpcErr } = await supabase.rpc('share_object_by_email', {
          p_object_id: oid, p_email: email, p_role: removed.role,
        });
        if (rpcErr) throw rpcErr;
        await load();
      }, pending)
      : () => undefined;
    try {
      await pending;
    } catch (err) {
      withdraw();
      if (removed) setShares((prev) => (prev.some((x) => x.id === shareId) ? prev : [...prev, removed]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))));
      setError(notifyError(err, 'Failed to revoke'));
    }
  }

  return { shares, email, setEmail, role, setRole, sharing, load, add, revoke };
}
