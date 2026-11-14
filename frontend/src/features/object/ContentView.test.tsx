import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContentView from './ContentView';

const JSON_DOC = [{ type: 'paragraph', content: [{ type: 'text', text: 'Rendered from JSON', styles: {} }], children: [] }];

describe('ContentView', () => {
  it('renders JSON without waiting', () => {
    render(<ContentView json={JSON_DOC} markdown="not this" />);
    expect(screen.getByText('Rendered from JSON')).toBeInTheDocument();
  });

  it('never renders a script URL from stored JSON (a collaborator can write content_json directly)', () => {
    const evil = [
      { type: 'file', props: { url: 'javascript:alert(1)', name: 'report.pdf' }, children: [] },
      { type: 'paragraph', content: [{ type: 'link', href: 'javascript:alert(2)', content: [{ type: 'text', text: 'click', styles: {} }] }], children: [] },
    ];
    const { container } = render(<ContentView json={evil} markdown="" />);
    const urls = [...container.querySelectorAll('[href],[src]')].map((el) => el.getAttribute('href') ?? el.getAttribute('src'));
    expect(urls.some((u) => /script:/i.test(u ?? ''))).toBe(false);
    expect(container.innerHTML).not.toMatch(/javascript:/i);
  });

  it('renders nothing for an empty object', () => {
    const { container } = render(<ContentView json={null} markdown="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
