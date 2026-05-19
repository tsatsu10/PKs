/** Accent hues for TypeMark (object type → CSS custom property). */
export const TYPE_MARK_HUES = {
  note: 210,
  document: 220,
  sop: 195,
  report: 250,
  proposal: 265,
  guideline: 180,
  insight: 45,
  template: 280,
  concept: 300,
  tool: 25,
  incident: 0,
  case: 160,
  research_paper: 230,
  decision: 140,
  prompt: 320,
  bookmark: 340,
  meeting_notes: 200,
  quote: 50,
  recipe: 35,
  person: 190,
  howto: 170,
};

/** Two-letter abbreviations for TypeMark (fallback: first two chars of type). */
export const TYPE_MARK_ABBREV = {
  note: 'NO',
  document: 'DC',
  sop: 'SO',
  report: 'RP',
  proposal: 'PR',
  guideline: 'GL',
  insight: 'IN',
  template: 'TM',
  concept: 'CX',
  tool: 'TL',
  incident: 'IC',
  case: 'CS',
  research_paper: 'RS',
  decision: 'DE',
  prompt: 'PM',
  bookmark: 'BM',
  meeting_notes: 'MT',
  quote: 'QT',
  recipe: 'RC',
  person: 'PE',
  howto: 'HT',
};

export function getTypeMarkHue(type) {
  return TYPE_MARK_HUES[type] ?? 215;
}

export function getTypeMarkAbbrev(type) {
  if (TYPE_MARK_ABBREV[type]) return TYPE_MARK_ABBREV[type];
  if (!type || typeof type !== 'string') return '??';
  const parts = type.split('_').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return type.slice(0, 2).toUpperCase();
}
