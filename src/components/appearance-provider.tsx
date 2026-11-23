'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
  APPEARANCE_KEY,
  type Appearance,
  DEFAULT_APPEARANCE,
  parseAppearance,
} from '@/lib/appearance';

const AppearanceContext = createContext<{
  appearance: Appearance;
  setAppearance: (value: Appearance) => void;
} | null>(null);

export const AppearanceProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  useEffect(() => {
    try {
      setAppearance(parseAppearance(localStorage.getItem(APPEARANCE_KEY)));
    } catch {
      setAppearance(DEFAULT_APPEARANCE);
    }
    const sync = (event: StorageEvent) => {
      if (event.key === APPEARANCE_KEY || event.key === null)
        setAppearance(parseAppearance(event.newValue));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    if (!appearance) return;
    document.documentElement.dataset.color = appearance.color;
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
    } catch {
      /* Keep preferences in memory when storage is disabled. */
    }
  }, [appearance]);
  return (
    <AppearanceContext.Provider
      value={{ appearance: appearance ?? DEFAULT_APPEARANCE, setAppearance }}
    >
      {children}
    </AppearanceContext.Provider>
  );
};

export const useAppearance = () => {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('AppearanceProvider is required.');
  return context;
};
