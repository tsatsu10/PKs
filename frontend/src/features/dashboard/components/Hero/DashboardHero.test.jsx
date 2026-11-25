import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardHero from './DashboardHero';

test('the greeting is not a heading: Page owns the only h1', () => {
  render(
    <MemoryRouter>
      <DashboardHero displayName="Ada" />
    </MemoryRouter>,
  );
  expect(screen.getByText(/^Good (morning|afternoon|evening), Ada$/)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
});
