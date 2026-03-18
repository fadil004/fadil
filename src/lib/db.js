import { supabase } from './supabase';

// ─────────────────────────────────────────
// DB → App transformers
// ─────────────────────────────────────────

function profileFromDB(p) {
  return {
    id: p.id,
    name: p.name,
    emoji: p.emoji,
    styles: (p.styles || [])
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map(styleFromDB),
  };
}

function styleFromDB(s) {
  return {
    id: s.id,
    name: s.name,
    icon: s.icon,
    desc: s.description ?? '',
    priceMode: (s.max_per30 > 0) ? "range" : "fixed",
    price30: (s.max_per30 > 0) ? 0 : (s.min_per30 || s.min_fixed || s.max_fixed || 0),
    minPer30: (s.max_per30 > 0) ? (s.min_per30 || 0) : 0,
    maxPer30: (s.max_per30 > 0) ? (s.max_per30 || 0) : 0,
    extras: (s.extras || [])
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map(extraFromDB),
  };
}

function extraFromDB(e) {
  return { id: e.id, name: e.name, icon: e.icon, perUnit: e.per_unit ?? 0 };
}

function memberFromDB(m) {
  return {
    id: m.id,
    name: m.name,
    specialties: m.specialties || [],
    links: m.links || [],
    rate: m.rate || '',
    status: m.status || 'available',
  };
}

function logFromDB(l) {
  return {
    id: l.id,
    client: l.client,
    notes: l.notes || '',
    profile: l.profile_name || '',
    profileEmoji: l.profile_emoji || '',
    style: l.style_name || '',
    styleIcon: l.style_icon || '',
    duration: l.duration || '',
    urgency: l.urgency || 0,
    currency: l.currency || 'USD',
    priceMin: l.price_min || 0,
    priceMax: l.price_max || 0,
    extras: l.extras || [],
    teamMembers: l.team_members || [],
    date: l.date,
    completed: l.completed || false,
    finalReceived: l.final_received ?? null,
    finalTeamCosts: l.final_team_costs || {},
  };
}

// ─────────────────────────────────────────
// Load functions
// ─────────────────────────────────────────

export async function loadProfiles(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, styles(*, extras(*))')
    .eq('user_id', userId)
    .order('display_order', { ascending: true });
  if (error || !data) return [];
  return data.map(profileFromDB);
}

export async function loadTeam(userId) {
  const { data } = await supabase
    .from('team_members')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return (data || []).map(memberFromDB);
}

export async function loadLogs(userId) {
  const { data } = await supabase
    .from('project_logs')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  return (data || []).map(logFromDB);
}

export async function loadSettings(userId) {
  const { data } = await supabase
    .from('user_settings')
    .select('exchange_rate, welcomed')
    .eq('user_id', userId)
    .maybeSingle();
  return { rate: data?.exchange_rate ?? 1500, welcomed: data?.welcomed ?? false };
}

export async function loadUserData(userId) {
  const [profiles, team, logs, settings] = await Promise.all([
    loadProfiles(userId),
    loadTeam(userId),
    loadLogs(userId),
    loadSettings(userId),
  ]);
  return { profiles, team, logs, rate: settings.rate, welcomed: settings.welcomed };
}

export async function saveWelcomed(userId) {
  await supabase.from('user_settings').upsert({
    user_id: userId,
    welcomed: true,
    updated_at: new Date().toISOString(),
  });
}

// ─────────────────────────────────────────
// Sync functions (App → DB)
// ─────────────────────────────────────────

export async function syncProfiles(prevProfiles, nextProfiles, userId) {
  const prevMap = new Map(prevProfiles.map(p => [p.id, p]));
  const nextMap = new Map(nextProfiles.map(p => [p.id, p]));

  // Delete removed profiles (CASCADE removes styles + extras)
  const deletedIds = [...prevMap.keys()].filter(id => !nextMap.has(id));
  if (deletedIds.length) {
    await supabase.from('profiles').delete().in('id', deletedIds);
  }

  // Upsert each profile
  for (let i = 0; i < nextProfiles.length; i++) {
    const profile = nextProfiles[i];
    const prev = prevMap.get(profile.id);

    await supabase.from('profiles').upsert({
      id: profile.id,
      user_id: userId,
      name: profile.name,
      emoji: profile.emoji,
      display_order: i,
    });

    // If styles changed (or new profile), do a full replace
    const stylesChanged =
      !prev ||
      JSON.stringify(prev.styles) !== JSON.stringify(profile.styles);

    if (stylesChanged) {
      await supabase.from('styles').delete().eq('profile_id', profile.id);

      for (let j = 0; j < profile.styles.length; j++) {
        const style = profile.styles[j];
        const { error: styleErr } = await supabase.from('styles').insert({
          id: style.id,
          profile_id: profile.id,
          name: style.name,
          icon: style.icon,
          description: style.desc || '',
          is_fixed: false,
          min_per30: style.priceMode === "fixed" ? (style.price30 || 0) : (style.minPer30 || 0),
          max_per30: style.priceMode === "fixed" ? 0 : (style.maxPer30 || 0),
          min_fixed: 0,
          max_fixed: 0,
          display_order: j,
        });

        if (!styleErr && style.extras?.length > 0) {
          await supabase.from('extras').insert(
            style.extras.map((ex, k) => ({
              id: ex.id,
              style_id: style.id,
              name: ex.name,
              icon: ex.icon,
              per_unit: ex.perUnit || 0,
              display_order: k,
            }))
          );
        }
      }
    }
  }
}

export async function syncTeam(prevTeam, nextTeam, userId) {
  const prevIds = new Set(prevTeam.map(m => String(m.id)));
  const nextIds = new Set(nextTeam.map(m => String(m.id)));

  // Delete removed members
  const deletedIds = prevTeam
    .filter(m => !nextIds.has(String(m.id)))
    .map(m => m.id);
  if (deletedIds.length) {
    await supabase.from('team_members').delete().in('id', deletedIds);
  }

  // Upsert new or changed members
  const toUpsert = nextTeam.filter(m => {
    if (!prevIds.has(String(m.id))) return true;
    const prev = prevTeam.find(p => String(p.id) === String(m.id));
    return JSON.stringify(prev) !== JSON.stringify(m);
  });

  for (const m of toUpsert) {
    await supabase.from('team_members').upsert({
      id: m.id,
      user_id: userId,
      name: m.name,
      specialties: m.specialties || [],
      links: m.links || [],
      rate: m.rate || '',
      status: m.status || 'available',
    });
  }
}

export async function syncLogs(prevLogs, nextLogs, userId) {
  const prevMap = new Map(prevLogs.map(l => [l.id, l]));
  const nextMap = new Map(nextLogs.map(l => [l.id, l]));

  // Delete removed logs
  const deletedIds = [...prevMap.keys()].filter(id => !nextMap.has(id));
  if (deletedIds.length) {
    await supabase.from('project_logs').delete().in('id', deletedIds);
  }

  // Upsert new or changed logs
  for (const log of nextLogs) {
    const prev = prevMap.get(log.id);
    if (prev && JSON.stringify(prev) === JSON.stringify(log)) continue;

    await supabase.from('project_logs').upsert({
      id: log.id,
      user_id: userId,
      client: log.client,
      notes: log.notes || '',
      profile_name: log.profile || '',
      profile_emoji: log.profileEmoji || '',
      style_name: log.style || '',
      style_icon: log.styleIcon || '',
      duration: log.duration || '',
      urgency: log.urgency || 0,
      currency: log.currency || 'USD',
      price_min: log.priceMin || 0,
      price_max: log.priceMax || 0,
      extras: log.extras || [],
      team_members: log.teamMembers || [],
      date: log.date,
      completed: log.completed || false,
      final_received: log.finalReceived ?? null,
      final_team_costs: log.finalTeamCosts || {},
    });
  }
}

export async function saveRate(rate, userId) {
  await supabase.from('user_settings').upsert({
    user_id: userId,
    exchange_rate: rate,
    updated_at: new Date().toISOString(),
  });
}
