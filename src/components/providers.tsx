'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import { AppearanceProvider } from '@/components/appearance-provider';
import { TooltipProvider } from '@/components/ui/tooltip';

export const Providers = ({ children }: { children: React.ReactNode }) => {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 5000 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider
        attribute='class'
        defaultTheme='system'
        storageKey='times:theme'
        enableSystem
        disableTransitionOnChange
      >
        <AppearanceProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </AppearanceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};
