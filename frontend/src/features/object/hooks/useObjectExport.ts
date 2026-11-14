import { useState } from 'react';
import {
  getExportIncludeFromTemplate, EXPORT_FORMAT_LABELS, safeFileBase,
  buildObjectExportText, buildObjectExportHtml, buildObjectExportJson, buildObjectExportDocxBlob,
} from '../../../lib/export';
import { markdownToHtml } from '../../../lib/markdown';
import { downloadBlob, printHtml } from '../../../lib/download';
import { createNotification } from '../../../lib/notifications';
import { logAudit } from '../../../lib/audit';
import { deliverWebhookEvent } from '../../../lib/webhooks';
import { getErrorMessage } from '../../../lib/errors';
import { useToast } from '../../../context/ToastContext';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../../constants';
import type { ObjectRow, Named, OutgoingLink, IncomingLink, ExportInclude, SetError } from '../types';

export type ExportFormat = 'txt' | 'md' | 'html' | 'json' | 'docx' | 'pdf';

type Options = {
  object: ObjectRow | null;
  userId: string | undefined;
  objectDomains: Named[];
  objectTags: Named[];
  outgoingLinks: OutgoingLink[];
  incomingLinks: IncomingLink[];
  setError: SetError;
};

const LABELS = EXPORT_FORMAT_LABELS as Record<string, string>;

/** The export panel: format, template and section choices, and running the export. */
export function useObjectExport({ object, userId, objectDomains, objectTags, outgoingLinks, incomingLinks, setError }: Options) {
  const { addToast } = useToast() as { addToast: (type: string, message: string) => void };
  const [show, setShow] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('md');
  const [template, setTemplate] = useState('full');
  const [include, setInclude] = useState<ExportInclude>({ content: true, summary: true, key_points: true, tags: true, domains: true, links: true });

  function applyTemplate(t: string) {
    setInclude(getExportIncludeFromTemplate(t, { includeLinks: true }) as ExportInclude);
  }

  async function run(jobOverrides?: { format?: ExportFormat; include?: ExportInclude }) {
    if (!object || !userId) return;
    const fmt = jobOverrides?.format ?? format;
    const inc = jobOverrides?.include ?? include;
    const ctx = { object, domains: objectDomains, tags: objectTags, outgoing: outgoingLinks, incoming: incomingLinks };
    const suggestedFilename = `${safeFileBase(object.title, 50)}.${fmt}`;
    try {
      if (fmt === 'txt') {
        downloadBlob(new Blob([buildObjectExportText(ctx, false, inc)], { type: 'text/plain;charset=utf-8' }), suggestedFilename);
      } else if (fmt === 'md') {
        downloadBlob(new Blob([buildObjectExportText(ctx, true, inc)], { type: 'text/markdown;charset=utf-8' }), suggestedFilename);
      } else if (fmt === 'html') {
        downloadBlob(new Blob([buildObjectExportHtml(ctx, inc, markdownToHtml)], { type: 'text/html;charset=utf-8' }), suggestedFilename);
      } else if (fmt === 'json') {
        downloadBlob(new Blob([buildObjectExportJson(ctx, inc)], { type: 'application/json;charset=utf-8' }), suggestedFilename);
      } else if (fmt === 'docx') {
        const blob = await buildObjectExportDocxBlob(ctx, inc);
        if (blob) downloadBlob(blob, suggestedFilename);
      } else if (!printHtml(buildObjectExportHtml(ctx, inc, markdownToHtml))) {
        throw new Error('Your browser blocked the print window. Allow pop-ups for this site, then try again.');
      }

      const formatLabel = LABELS[fmt] || fmt;
      if (fmt !== 'pdf') {
        createNotification(userId, 'export_completed', 'Export completed', `"${object.title.slice(0, 50)}${object.title.length > 50 ? '…' : ''}" as ${formatLabel}`, { type: 'knowledge_object', id: object.id });
        deliverWebhookEvent('export.completed', { objectId: object.id, title: object.title, format: fmt });
      }
      logAudit(userId, AUDIT_ACTIONS.EXPORT_RUN, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { format: fmt, title: object.title });
      addToast('success', fmt === 'pdf' ? 'Print dialog opened: choose "Save as PDF"' : `Export downloaded as ${formatLabel}`);
      setShow(false);
    } catch (err) {
      const msg = getErrorMessage(err, 'Export failed');
      setError(msg);
      addToast('error', msg);
    }
  }

  return { show, setShow, format, setFormat, template, setTemplate, include, setInclude, applyTemplate, run };
}
