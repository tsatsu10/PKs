/**
 * Main menu deck: localStorage key, getter/setter, and React context for deck enabled state.
 * Kept in a separate file so MainMenuDeck.jsx only exports components (for fast refresh).
 */
/* eslint-disable react-refresh/only-export-components -- this file exports context + helpers together */
import { createContext, useContext, useState } from 'react';

export const MAIN_MENU_DECK_KEY = 'pks-main-menu-deck';

export function getMainMenuDeckEnabled() {
  try {
    const v = localStorage.getItem(MAIN_MENU_DECK_KEY);
    return v !== 'false';
  } catch {
    return true;
  }
}

export function setMainMenuDeckEnabled(enabled) {
  try {
    localStorage.setItem(MAIN_MENU_DECK_KEY, enabled ? 'true' : 'false');
  } catch (_e) {
    void _e;
  }
}

const DeckEnabledContext = createContext({
  deckEnabled: true,
  setDeckEnabled: () => {},
});

export function DeckProvider({ children }) {
  const [deckEnabled, setDeckEnabledState] = useState(getMainMenuDeckEnabled);

  function setDeckEnabled(enabled) {
    setMainMenuDeckEnabled(enabled);
    setDeckEnabledState(enabled);
  }

  return (
    <DeckEnabledContext.Provider value={{ deckEnabled, setDeckEnabled }}>
      {children}
    </DeckEnabledContext.Provider>
  );
}

export function useDeckEnabled() {
  return useContext(DeckEnabledContext);
}
