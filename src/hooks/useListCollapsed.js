import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useListCollapsed() {
  const { user } = useAuth();
  const [state, setState] = useState({});

  useEffect(() => {
    if (!user) {
      setState({});
      return;
    }
    const fetch = async () => {
      const { data, error } = await supabase
        .from('user_list_collapsed')
        .select('list_key, collapsed')
        .eq('user_id', user.id);
      if (!error && data) {
        const map = {};
        data.forEach((row) => { map[row.list_key] = row.collapsed; });
        setState(map);
      }
    };
    fetch();
  }, [user?.id]);

  const getCollapsed = useCallback((listKey) => state[listKey] === true, [state]);

  const setCollapsed = useCallback(
    async (listKey, collapsed) => {
      if (!user) return;
      setState((prev) => ({ ...prev, [listKey]: collapsed }));
      await supabase.from('user_list_collapsed').upsert(
        { user_id: user.id, list_key: listKey, collapsed },
        { onConflict: 'user_id,list_key' }
      );
    },
    [user?.id]
  );

  return { getCollapsed, setCollapsed };
}
