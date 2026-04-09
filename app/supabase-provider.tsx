// app/supabase-provider.tsx
'use client';

import { createClient } from '@/lib/supabase';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { useState } from 'react';

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());

  return (
    <SessionContextProvider supabaseClient={supabase}>
      {children}
    </SessionContextProvider>
  );
}
