import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContentView from './ContentView';

const JSON_DOC = [{ type: 'paragraph', content: [{ type: 'text', text: 'Rendered from JSON', styles: {} }], children: [] }];

describe('ContentView', () => {
  it('renders JSON without waiting', () => {
    render(<ContentView json={JSON_DOC} markdown="not this" />);
    expect(screen.getByText('Rendered from JSON')).toBeInTheDocument();
  });

  it('renders nothing for an empty object', () => {
    const { container } = render(<ContentView json={null} markdown="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
