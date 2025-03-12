'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { StateProvider } from '@/store';

const queryClient = new QueryClient();

function Providers({ children }: { children: ReactNode }) {
  return (
    <StateProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </StateProvider>
  );
}

export default Providers;
