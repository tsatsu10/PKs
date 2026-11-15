import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConfigError from './ConfigError';

describe('ConfigError', () => {
  it('says PKS is not configured and names each missing variable', () => {
    render(<ConfigError missing={['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']} />);
    expect(screen.getByRole('heading', { name: "PKS isn't configured" })).toBeInTheDocument();
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeInTheDocument();
    expect(screen.getByText('VITE_SUPABASE_ANON_KEY')).toBeInTheDocument();
    expect(screen.getByText(/or the hosting settings, then rebuild\./)).toBeInTheDocument();
  });
});
