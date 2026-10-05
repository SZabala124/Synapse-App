import { useCallback, useEffect, useMemo, useState } from "react";
import { ConvexProviderWithAuth } from "convex/react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

export function SupabaseConvexProvider({ client, children }) {
  return (
    <ConvexProviderWithAuth client={client} useAuth={useSupabaseAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}

function useSupabaseAuthForConvex() {
  const [state, setState] = useState({ isLoading: true, session: null });

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setState({ isLoading: false, session: null });
      return undefined;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ isLoading: false, session: data.session ?? null });
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ isLoading: false, session: session ?? null });
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const fetchAccessToken = useCallback(async ({ forceRefreshToken }) => {
    if (!isSupabaseConfigured || !supabase) return null;
    if (forceRefreshToken) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) return null;
      return data.session?.access_token ?? null;
    }
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  return useMemo(() => ({
    isLoading: state.isLoading,
    isAuthenticated: Boolean(state.session),
    fetchAccessToken,
  }), [fetchAccessToken, state]);
}
