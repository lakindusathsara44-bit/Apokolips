import { createClient } from '@supabase/supabase-js';

// Browser-safe Supabase project URL and publishable key.
// Row Level Security protects all public database access.
const supabaseUrl = 'https://oqyfvvwplvbmmursbpkd.supabase.co';
const supabasePublishableKey = 'sb_publishable_fA9X_kf1Fz_DNDXa1I97Sg_RKXCojsd';

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
