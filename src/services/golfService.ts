import { supabase } from './supabaseClient';
import {
  GolfCourse,
  GolfHole,
  GolfRound,
  Player,
  RoundPlayer,
  RoundScore,
  RoundWithDetails,
  Group,
  Tee,
  GameMode,
} from '../types';
import { calculatePlayingHandicap, calculateScore } from '../utils/calculations';
import { getUserId } from '../utils/userId';
import { storageUtils } from '../utils/storage';
import { generateAccessCode, accessCodeStorage } from '../utils/accessCode';

export const golfService = {
  async getHandicapUpdatePreview(): Promise<Array<{
    id: string; name: string; exact_handicap: number; exact_handicap_18: number;
    playing_handicap: number; new_value: number;
  }>> {
    const { data, error } = await supabase
      .from('players')
      .select('id, name, exact_handicap, exact_handicap_18, playing_handicap')
      .is('auth_user_id', null)
      .eq('is_guest', false)
      .not('playing_handicap', 'is', null)
      .order('name');
    if (error) throw error;
    return (data || []).map(player => ({
      ...player,
      exact_handicap_18: player.exact_handicap_18 ?? player.exact_handicap,
      playing_handicap: player.playing_handicap,
      new_value: player.playing_handicap,
    }));
  },

  async applyHandicapUpdate(): Promise<void> {
    const preview = await this.getHandicapUpdatePreview();
    const updates = preview
      .filter(player => player.exact_handicap !== player.new_value || player.exact_handicap_18 !== player.new_value)
      .map(player => supabase
        .from('players')
        .update({ exact_handicap: player.new_value, exact_handicap_18: player.new_value })
        .eq('id', player.id));
    const results = await Promise.all(updates);
    const failed = results.find(result => result.error);
    if (failed?.error) throw failed.error;
  },

  // Group operations
  async createGroup(name?: string, customCode?: string): Promise<Group> {
    const userId = getUserId();
    let groupCode = customCode || generateAccessCode();

    if (!customCode) {
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isUnique && attempts < maxAttempts) {
        const { data: existing } = await supabase
          .from('groups')
          .select('id')
          .eq('group_code', groupCode)
          .maybeSingle();

        if (!existing) {
          isUnique = true;
        } else {
          groupCode = generateAccessCode();
          attempts++;
        }
      }

      if (!isUnique) {
        throw new Error('No se pudo generar un código único. Por favor intenta de nuevo.');
      }
    } else {
      const { data: existing } = await supabase
        .from('groups')
        .select('id')
        .eq('group_code', groupCode)
        .maybeSingle();

      if (existing) {
        throw new Error('Este código ya está en uso. Por favor elige otro.');
      }
    }

    const authUser = (await supabase.auth.getUser()).data.user;

    const { data, error } = await supabase
      .from('groups')
      .insert([
        {
          name: name,
          group_code: groupCode,
          created_by: userId,
          user_auth_id: authUser?.id || null,
        },
      ])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('Este código ya está en uso. Por favor elige otro.');
      }
      throw error;
    }

    storageUtils.saveCurrentGroup(data.id, data.group_code, true);
    return data;
  },

  async joinGroup(groupCode: string): Promise<Group> {
    const userId = getUserId();

    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .eq('group_code', groupCode)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Código de grupo no válido');

    const isCreator = data.created_by === userId;
    storageUtils.saveCurrentGroup(data.id, data.group_code, isCreator);
    return data;
  },

  async getCurrentGroup(): Promise<Group | null> {
    const groupId = storageUtils.getCurrentGroupId();
    if (!groupId) return null;

    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getGroupByCode(groupCode: string): Promise<Group | null> {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .eq('group_code', groupCode)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async leaveGroup(): Promise<void> {
    storageUtils.clearCurrentGroup();
  },

  async linkGroupsToAuthUser(): Promise<void> {
    const userId = getUserId();
    const authUser = (await supabase.auth.getUser()).data.user;

    if (!authUser) return;

    const { error } = await supabase
      .from('groups')
      .update({ user_auth_id: authUser.id })
      .eq('created_by', userId)
      .is('user_auth_id', null);

    if (error) {
      console.error('Error linking groups to auth user:', error);
    }
  },

  // Course operations
  async getCourses(): Promise<GolfCourse[]> {
    const { data, error } = await supabase.from('golf_courses').select('*');

    if (error) throw error;
    return data || [];
  },

  async getCourse(courseId: string): Promise<GolfCourse | null> {
    const { data, error } = await supabase
      .from('golf_courses')
      .select('*')
      .eq('id', courseId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getRegisteredCourseHoles(courseId: string): Promise<GolfHole[]> {
    const { data, error } = await supabase.from('golf_holes').select('*')
      .eq('course_id', courseId).order('hole_number', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getCourseHoleCount(courseId: string): Promise<number> {
    const { data, error } = await supabase
      .from('golf_holes')
      .select('hole_number', { count: 'exact' })
      .eq('course_id', courseId);

    if (error) throw error;
    return data?.length || 0;
  },

  async getTees(courseId: string): Promise<Tee[]> {
    const { data, error } = await supabase
      .from('tees')
      .select('*')
      .eq('course_id', courseId)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getTee(teeId: string): Promise<Tee | null> {
    const { data, error } = await supabase
      .from('tees')
      .select('*')
      .eq('id', teeId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getRoundSlope(roundId: string): Promise<{ slope: number; isManual: boolean; teeName?: string } | null> {
    const { data: round, error } = await supabase
      .from('golf_rounds')
      .select('tee_id, manual_slope, num_holes, holes_range')
      .eq('id', roundId)
      .maybeSingle();

    if (error || !round) return null;

    if (round.manual_slope !== null && round.manual_slope !== undefined) {
      return { slope: round.manual_slope, isManual: true };
    }

    if (round.tee_id) {
      const tee = await this.getTee(round.tee_id);
      if (tee) {
        let slope = tee.slope_18;

        if (round.num_holes === 9) {
          slope = round.holes_range === '10-18' ? tee.slope_9_ii : tee.slope_9_i;
        }

        return { slope, isManual: false, teeName: tee.name };
      }
    }

    return { slope: 113, isManual: false };
  },

async deleteAllRounds(groupId?: string): Promise<void> {
  const userId = getUserId();
  let query = supabase
    .from('golf_rounds')
    .update({ status: 'deleted' });

  if (groupId) {
    query = query.eq('group_id', groupId);
  } else {
    query = query.eq('user_id', userId);
  }

  const { error } = await query;
  if (error) throw error;
},

  async deleteRound(roundId: string): Promise<void> {
    const { error } = await supabase
      .from('golf_rounds')
      .update({ status: 'deleted' })
      .eq('id', roundId);
  
    if (error) throw error;
  },

  async getCourseHoles(courseId: string, numHoles: number, holesRange?: '1-9' | '10-18'): Promise<GolfHole[]> {
    let query = supabase
      .from('golf_holes')
      .select('*')
      .eq('course_id', courseId);

    if (numHoles === 9 && holesRange === '10-18') {
      query = query.gte('hole_number', 10).lte('hole_number', 18);
    } else {
      query = query.lte('hole_number', numHoles);
    }

    const { data, error } = await query.order('hole_number', { ascending: true });

    if (error) throw error;

    let holes = (data || []).map((hole: any) => ({
      ...hole,
      strokeIndex: hole.stroke_index,
      holeNumber: hole.hole_number,
      courseId: hole.course_id,
      createdAt: hole.created_at,
      updatedAt: hole.updated_at,
    }));

    if (holes.length === 9 && numHoles === 18 && !holesRange) {
      const backNine = holes.map((hole) => ({
        ...hole,
        id: `${hole.id}_back`,
        hole_number: hole.hole_number + 9,
        holeNumber: hole.holeNumber + 9,
      }));
      holes = [...holes, ...backNine];
    }

    return holes;
  },

  async updateHoleStrokeIndex(holeId: string, strokeIndex: number): Promise<void> {
    const { error } = await supabase
      .from('golf_holes')
      .update({ stroke_index: strokeIndex, updated_at: new Date().toISOString() })
      .eq('id', holeId);

    if (error) throw error;
  },

  async updateHole(holeId: string, updates: { par?: number; stroke_index?: number }): Promise<void> {
    const { error } = await supabase
      .from('golf_holes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', holeId);

    if (error) throw error;
  },

  // Round operations
  async countQuickRounds(): Promise<number> {
    const { data, error } = await supabase.rpc('count_available_quick_rounds', {p_owner: getUserId()});
    if (error) throw error;
    return Number(data);
  },

  async createRound(
    courseId: string,
    numHoles: 9 | 18,
    useSlope: boolean = true,
    holesRange?: '1-9' | '10-18',
    teeId?: string,
    gameMode: GameMode = 'stableford'
  ): Promise<GolfRound> {
    const userId = getUserId();
    const groupId = storageUtils.getCurrentGroupId();

    // Generate a unique access code
    let accessCode = generateAccessCode();
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      const { data: existing } = await supabase
        .from('golf_rounds')
        .select('id')
        .eq('access_code', accessCode)
        .maybeSingle();

      if (!existing) {
        isUnique = true;
      } else {
        accessCode = generateAccessCode();
        attempts++;
      }
    }

    if (!isUnique) {
      throw new Error('No se pudo generar un código único. Por favor intenta de nuevo.');
    }

    const { data, error } = await supabase
      .from('golf_rounds')
      .insert([
        {
          course_id: courseId,
          created_by: null,
          user_id: userId,
          group_id: groupId || null,
          num_holes: numHoles,
          holes_range: holesRange || null,
          use_slope: useSlope,
          tee_id: teeId || null,
          game_mode: gameMode,
          status: 'active',
          access_code: accessCode,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getActiveRounds(): Promise<GolfRound[]> {
    const userId = getUserId();
    const groupId = storageUtils.getCurrentGroupId();

    let query = supabase
      .from('golf_rounds')
      .select('*');

    if (groupId) {
      // For groups, show ALL rounds in the group (active and completed)
      query = query.eq('group_id', groupId).in('status', ['active', 'completed']);
    } else {
      // For quick play, show user's own active and completed rounds
      query = query.eq('user_id', userId).is('group_id', null).in('status', ['active', 'completed']);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

async hasActiveQuickPlayRound(): Promise<boolean> {
  const userId = getUserId();
  const { data, error } = await supabase
    .from('golf_rounds')
    .select('id')
    .eq('user_id', userId)
    .is('group_id', null)
    .eq('status', 'active')
    .is('completed_at', null)
    .limit(1);

  if (error) {
    console.error('Error comprobando partida activa:', error);
    throw error;
  }
  return (data || []).length > 0;
},
// 2. Comprobar si hay alguna partida FINALIZADA PENDIENTE DE ARCHIVAR (completed) sin grupo
async hasCompletedQuickPlayRound(): Promise<boolean> {
  const userId = getUserId();
  const { data, error } = await supabase
    .from('golf_rounds')
    .select('id')
    .eq('user_id', userId)
    .is('group_id', null)
    .eq('status', 'completed') // <-- Debe ser SOLO 'completed'
    .limit(1);

  if (error) {
    console.error('Error comprobando partida completada:', error);
    throw error;
  }
  return (data || []).length > 0;
},

// 3. Cambiar el estado de una partida a 'archived'
/*async archiveRound(roundId: string): Promise<void> {
  const { error } = await supabase
    .from('golf_rounds')
    .update({ status: 'archived' })
    .eq('id', roundId);

  if (error) {
    console.error('Error al archivar la partida:', error);
    throw error;
  }
},*/

// 4. Obtener todas las partidas finalizadas o archivadas del usuario para el desplegable de estadísticas
async getAvailableRoundsForStats(limit?: number): Promise<Array<{ id: string; created_at: string; status: string }>> {
  const userId = getUserId();
  
  let query = supabase
    .from('golf_rounds')
    .select('id, created_at, status, game_mode')
    .eq('user_id', userId)
    .in('status', ['completed', 'archived'])
    .is('group_id', null)
    .order('created_at', { ascending: false });

  // Si se define un límite, lo aplicamos a la query
  if (limit !== undefined && limit > 0) {
    query = query.limit(limit); 
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error al obtener partidas para estadísticas:', error);
    return [];
  }

  return data || [];
},
  async archiveQuickPlayRound(roundId: string): Promise<void> {
  const { error } = await supabase
    .from('golf_rounds')
    .update({ status: 'archived' })
    .eq('id', roundId)
    .is('group_id', null); // Garantizamos que solo archive partidas sin grupo

  if (error) {
    console.error('Error al archivar la partida rápida:', error);
    throw error;
  }
},
//FBP_Fin
  async getUserRounds(): Promise<GolfRound[]> {
    const userId = getUserId();
    const { data, error } = await supabase
      .from('golf_rounds')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getRoundWithDetails(roundId: string, retries = 2): Promise<RoundWithDetails | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const roundData = await supabase.from('golf_rounds').select('*').eq('id', roundId).single();

      if (!roundData.error && roundData.data) {
        const round = roundData.data;
        if (round.admin_withdrawn_at) return null;
        const holes = await this.getCourseHoles(round.course_id, round.num_holes, round.holes_range);

        const [playersData, scoresData] = await Promise.all([
          supabase.from('round_players'). select('*').eq('round_id', roundId),
          supabase.from('round_scores').select('*').eq('round_id', roundId),
        ]);

        return {
          round,
          holes,
          players: playersData.data || [],
          scores: scoresData.data || [],
        };
      }

      // If it's a "no rows" error (PGRN116), the round genuinely doesn't exist
      const code = (roundData.error as any)?.code;
      if (code === 'PGRN116' || code === '22P02') return null;

      // Network/transient error — retry after a short delay
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
    }

    return null;
  },

  async updateRoundStatus(roundId: string, status: string): Promise<void> {
    const updates: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'completed') {
      updates.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('golf_rounds')
      .update(updates)
      .eq('id', roundId);

    if (error) throw error;
  },

  async updateRoundSlope(roundId: string, manualSlope: number | null): Promise<void> {
    const { error } = await supabase
      .from('golf_rounds')
      .update({ manual_slope: manualSlope, updated_at: new Date().toISOString() })
      .eq('id', roundId);

    if (error) throw error;
  },

  async updateRoundHoles(roundId: string, numHoles: 9 | 18, holesRange?: '1-9' | '10-18' | null): Promise<void> {
    console.log('🔷 SERVICE: updateRoundHoles iniciado, roundId:', roundId, 'numHoles:', numHoles, 'holesRange:', holesRange);

    // 1. Consultar el número de hoyos actual en la base de datos
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('num_holes')
      .eq('id', roundId)
      .single();

    if (roundError) {
      console.log('🔴 SERVICE: Error obteniendo round:', roundError);
      throw roundError;
    }

    const oldNumHoles = round.num_holes;
    console.log('🔷 SERVICE: oldNumHoles:', oldNumHoles, '→ newNumHoles:', numHoles);
    console.log('🟣🟣🟣 PUNTO A - SI VES ESTO EL CODIGO ESTA ACTUALIZADO 🟣🟣🟣');

    // 2. Actualizar el número de hoyos en la partida
    console.log('🔷 SERVICE: Intentando actualizar round...');
    const updateResult = await supabase
      .from('golf_rounds')
      .update({
        num_holes: numHoles,
        holes_range: holesRange !== undefined ? holesRange : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', roundId);

    console.log('🔷 SERVICE: Update result:', JSON.stringify(updateResult, null, 2));

    if (updateResult.error) {
      console.log('🔴 SERVICE: Error actualizando round:', updateResult.error);
      throw updateResult.error;
    }
    console.log('✅ SERVICE: Round actualizado');

    // 3. Si cambió el número de hoyos, recalcular los handicaps de todos los jugadores
    if (oldNumHoles !== numHoles) {
      console.log('🔷 SERVICE: Cambio detectado, recalculando handicaps...');

      // Get round info to check use_slope
      const { data: roundInfo, error: roundInfoError } = await supabase
        .from('golf_rounds')
        .select('use_slope')
        .eq('id', roundId)
        .single();

      if (roundInfoError) {
        console.log('🔴 SERVICE: Error obteniendo round info:', roundInfoError);
        throw roundInfoError;
      }

      const { data: players, error: playersError } = await supabase
        .from('round_players')
        .select('id, name, exact_handicap, playing_handicap')
        .eq('round_id', roundId);

      if (playersError) {
        console.log('🔴 SERVICE: Error obteniendo players:', playersError);
        throw playersError;
      }

      console.log('🔷 SERVICE: Players encontrados:', players?.length);

      if (players && players.length > 0) {
        // Get slope for calculations
        const slopeInfo = roundInfo.use_slope ? await this.getRoundSlope(roundId) : null;
        const slope = slopeInfo?.slope || 113;

        for (const player of players) {
          // Determine base handicap based on conversion
          let newExactHandicap: number;

          if (oldNumHoles === 9 && numHoles === 18) {
            // 9→18: Multiply by 2
            newExactHandicap = player.exact_handicap * 2;
          } else if (oldNumHoles === 18 && numHoles === 9) {
            // 18→9: Divide by 2
            newExactHandicap = player.exact_handicap / 2;
          } else {
            newExactHandicap = player.exact_handicap;
          }

          // Calculate playing handicap
          let newPlayingHandicap = roundInfo.use_slope
            ? calculatePlayingHandicap(newExactHandicap, slope)
            : Math.round(newExactHandicap);

          console.log(`🔷 SERVICE: ${player.name}: Exact HCP: ${player.exact_handicap} → ${newExactHandicap}, Playing (${numHoles} holes, slope ${slope}): ${newPlayingHandicap} (was ${player.playing_handicap})`);

          const { error: updateError } = await supabase
            .from('round_players')
            .update({
              exact_handicap: newExactHandicap,
              playing_handicap: newPlayingHandicap
            })
            .eq('id', player.id);

          if (updateError) {
            console.log('🔴 SERVICE: Error actualizando player:', updateError);
            throw updateError;
          }
        }
        console.log('✅ SERVICE: Todos los handicaps recalculados');
      }
    } else {
      console.log('⚠️ SERVICE: No hay cambio de hoyos (oldNumHoles === numHoles)');
    }
  },

  async changeCourse(
    roundId: string,
    newCourseId: string,
    numHoles: 9 | 18
  ): Promise<{ holes: GolfHole[]; players?: RoundPlayer[] }> {
    console.log('🔄🔄🔄 changeCourse: Starting v3 WITH DETAILED LOGS 🔄🔄🔄', { roundId, newCourseId, numHoles });

    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('course_id, num_holes, use_slope')
      .eq('id', roundId)
      .single();

    if (roundError) throw roundError;

    const oldCourseId = round.course_id;
    const oldNumHoles = round.num_holes;
    console.log('🔄 changeCourse: Old values', { oldCourseId, oldNumHoles, useSlope: round.use_slope });
    console.log('🔄 changeCourse: Will now UPDATE golf_rounds table...');
    console.log('🔄 changeCourse: Updating to course_id:', newCourseId, 'num_holes:', numHoles);

    const roundUpdateResult = await supabase
      .from('golf_rounds')
      .update({
        course_id: newCourseId,
        num_holes: numHoles,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roundId);

    console.log('✅ changeCourse: golf_rounds UPDATE completed', roundUpdateResult.error ? 'WITH ERROR' : 'SUCCESS');
    if (roundUpdateResult.error) {
      console.log('❌ UPDATE ERROR:', roundUpdateResult.error);
    }

    console.log('🔄 changeCourse: Now fetching players...');
    const { data: players, error: playersError } = await supabase
      .from('round_players')
      .select('id, name, exact_handicap, exact_handicap_18, playing_handicap')
      .eq('round_id', roundId);

    console.log('📥 changeCourse: Players fetched:', players?.length || 0, 'players');

    if (playersError) throw playersError;

    console.log('📊 ===== PLAYERS BEFORE UPDATE =====');
    players?.forEach(p => {
      console.log(`📊 ${p.name}: exact_handicap=${p.exact_handicap}, exact_handicap_18=${p.exact_handicap_18}, playing=${p.playing_handicap}`);
    });
    console.log('📊 ===================================');

    const updatedPlayerHandicaps = new Map<string, number>();
    const updatedPlayersArray: RoundPlayer[] = [];

    if (players && players.length > 0) {
      // Get slope for calculations
      const slopeInfo = round.use_slope ? await this.getRoundSlope(roundId) : null;
      const slope = slopeInfo?.slope || 113;

      console.log('AAAAA BEFORE LOOP', players.length);
      for (const player of players) {
        console.log('BBBBB START LOOP', player.name);
        // Determine which handicap to use based on conversion rules
        let newExactHandicap: number;

        if (oldNumHoles === 9 && numHoles === 9) {
          // 9→9: Keep the same HCP (exact_handicap for 9 holes)
          newExactHandicap = player.exact_handicap;
        } else if (oldNumHoles === 9 && numHoles === 18) {
          // 9→18: Multiply by 2
          newExactHandicap = player.exact_handicap * 2;
        } else if (oldNumHoles === 18 && numHoles === 9) {
          // 18→9: Divide by 2
          newExactHandicap = player.exact_handicap / 2;
        } else {
          // 18→18: Keep the same HCP
          newExactHandicap = player.exact_handicap;
        }

        // Calculate playing handicap based on the base handicap and target holes
        let playingHandicap = round.use_slope
          ? calculatePlayingHandicap(newExactHandicap, slope)
          : Math.round(newExactHandicap);

        console.log(`🔄 changeCourse V4: ${player.name} - ${oldNumHoles}→${numHoles} holes - Exact: ${player.exact_handicap} → ${newExactHandicap}, Playing: ${playingHandicap}`);

        console.log('CCCCC ABOUT TO UPDATE', player.name, player.id);
        const { data: updateData, error: updateError } = await supabase
          .from('round_players')
          .update({
            exact_handicap: newExactHandicap,
            playing_handicap: playingHandicap
          })
          .eq('id', player.id)
          .select();

        console.log('DDDDD AFTER UPDATE', player.name, updateError ? 'ERROR' : 'OK');
        if (updateError) {
          console.log('ERROR:', updateError);
        } else {
          console.log('DATA:', updateData?.[0]);
        }

        console.log('EEEEE UPDATE COMPLETE', player.name);
        updatedPlayerHandicaps.set(player.id, playingHandicap);

        // Build the updated player object with the new handicap
        updatedPlayersArray.push({
          ...player,
          exact_handicap: newExactHandicap,
          playing_handicap: playingHandicap
        } as RoundPlayer);
        console.log(`🟢 EXITING LOOP FOR: ${player.name}`);
      }

      console.log('🔍 ===== DB VERIFICATION AFTER UPDATES =====');
      const { data: verifyPlayers } = await supabase
        .from('round_players')
        .select('name, exact_handicap, exact_handicap_18, playing_handicap')
        .eq('round_id', roundId);
      verifyPlayers?.forEach(p => {
        console.log(`🔍 ${p.name}: exact_handicap=${p.exact_handicap}, exact_handicap_18=${p.exact_handicap_18}, playing=${p.playing_handicap}`);
      });
      console.log('🔍 ==========================================');
    }

    const { data: updatedRound } = await supabase
      .from('golf_rounds')
      .select('holes_range')
      .eq('id', roundId)
      .single();

    const newHoles = await this.getCourseHoles(newCourseId, numHoles, updatedRound?.holes_range);
    console.log('🔄 changeCourse: Got new holes', newHoles.length);

    const { data: scores, error: scoresError } = await supabase
      .from('round_scores')
      .select('*')
      .eq('round_id', roundId);

    if (scoresError) throw scoresError;

    console.log('🔄 changeCourse: Found scores to update', scores?.length || 0);

    if (scores && scores.length > 0) {
      for (const score of scores) {
        const hole = newHoles.find((h) => h.hole_number === score.hole_number);
        if (!hole) {
          console.log(`⚠️ changeCourse: Hole ${score.hole_number} not found in new course, deleting score`);
          await supabase
            .from('round_scores')
            .delete()
            .eq('round_id', roundId)
            .eq('player_id', score.player_id)
            .eq('hole_number', score.hole_number);
          continue;
        }

        const playerHandicap = updatedPlayerHandicaps.get(score.player_id);
        if (!playerHandicap) {
          console.log(`⚠️ changeCourse: Player handicap not found for player_id ${score.player_id}`);
          continue;
        }

        const result = calculateScore(
          score.gross_strokes,
          playerHandicap,
          { par: hole.par, strokeIndex: hole.stroke_index },
          numHoles,
          newHoles
        );

        console.log(`🔄 changeCourse: Hole ${hole.hole_number} - handicap: ${playerHandicap}, strokes received: ${result.strokesReceived}`);

        await supabase
          .from('round_scores')
          .update({
            strokes_received: result.strokesReceived,
            net_strokes: result.netStrokes,
            stableford_points: result.stablefordPoints,
            updated_at: new Date().toISOString(),
          })
          .eq('round_id', roundId)
          .eq('player_id', score.player_id)
          .eq('hole_number', score.hole_number);
      }
    }

    console.log('✅ changeCourse: Complete - Returning updated players:', updatedPlayersArray.map(p => ({ name: p.name, playing_handicap: p.playing_handicap })));
    return { holes: newHoles, players: updatedPlayersArray };
  },

  async verifyAccessCode(roundId: string, accessCode: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('golf_rounds')
      .select('access_code')
      .eq('id', roundId)
      .maybeSingle();

    if (error || !data) return false;
    return data.access_code === accessCode.toUpperCase();
  },

  async getRoundByAccessCode(accessCode: string, groupId?: string | null, searchAll?: boolean): Promise<GolfRound | null> {
    let query = supabase
      .from('golf_rounds')
      .select('*')
      .eq('access_code', accessCode.toUpperCase())
      .eq('status', 'active');

    if (!searchAll) {
      if (groupId) {
        query = query.eq('group_id', groupId);
      } else {
        query = query.is('group_id', null);
      }
    }

    const { data, error } = await query.maybeSingle();

    if (error || !data) return null;
    return data;
  },

  // Player database operations
  async getAllPlayers(groupOverride?: string): Promise<Player[]> {
    const groupId = groupOverride ?? storageUtils.getCurrentGroupId();

    if (groupId) {
      const { data, error } = await supabase.rpc('list_group_game_players', { p_group: groupId });
      if (error) throw error;
      return data || [];
    }

    let query = supabase
      .from('players')
      .select('*')
      .order('name', { ascending: true });

    if (groupId) {
      query = query.eq('group_id', groupId);
    } else {
      query = query.is('group_id', null);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getPlayersInActiveRounds(excludeRoundId?: string): Promise<string[]> {
    const groupId = storageUtils.getCurrentGroupId();

    let query = supabase
      .from('round_players')
      .select('player_id, golf_rounds!inner(status, group_id)')
      .eq('golf_rounds.status', 'active')
      .not('player_id', 'is', null);

    if (groupId) {
      query = query.eq('golf_rounds.group_id', groupId);
    } else {
      query = query.is('golf_rounds.group_id', null);
    }

    if (excludeRoundId) {
      query = query.neq('round_id', excludeRoundId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map((item: any) => item.player_id).filter(Boolean);
  },

  async createPlayer(name: string, exactHandicap: number): Promise<Player> {
    const groupId = storageUtils.getCurrentGroupId();

    const { data, error } = await supabase
      .from('players')
      .insert([
        {
          name,
          exact_handicap: exactHandicap,
          exact_handicap_18: exactHandicap,
          group_id: groupId || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updatePlayer(
    playerId: string,
    name: string,
    exactHandicap: number
  ): Promise<Player> {
    const { data, error } = await supabase
      .from('players')
      .update({
        name,
        exact_handicap: exactHandicap,
        exact_handicap_18: exactHandicap,
        updated_at: new Date().toISOString(),
      })
      .eq('id', playerId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deletePlayer(playerId: string): Promise<void> {
    const { error } = await supabase
      .from('players')
      .delete()
      .eq('id', playerId);

    if (error) throw error;
  },

  async getOrCreatePlayer(name: string, exactHandicap: number): Promise<Player> {
    const groupId = storageUtils.getCurrentGroupId();

    let query = supabase
      .from('players')
      .select('*')
      .is('auth_user_id', null)
      .eq('name', name);

    if (groupId) {
      query = query.eq('group_id', groupId);
    } else {
      query = query.is('group_id', null);
    }

    const { data: existingPlayer } = await query.maybeSingle();

    if (existingPlayer) {
      // Update handicap if it changed
      if (existingPlayer.exact_handicap !== exactHandicap) {
        return await this.updatePlayer(existingPlayer.id, name, exactHandicap);
      }
      return existingPlayer;
    }

    // Create new player
    return await this.createPlayer(name, exactHandicap);
  },

  async addGroupRoundPlayer(groupId: string, roundId: string, name: string, handicap: number, isGuest: boolean, playerId?: string): Promise<RoundPlayer> {
    const { data, error } = await supabase.rpc('add_group_round_player', {
      p_group: groupId, p_round: roundId, p_name: name, p_handicap: handicap,
      p_is_guest: isGuest, p_player: playerId ?? null,
    });
    if (error) throw error;
    return data;
  },

  // Player operations
  async addPlayerToRound(
    roundId: string,
    name: string,
    exactHandicap: number,
    useSlope: boolean,
    playerId?: string
  ): Promise<RoundPlayer> {
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('num_holes')
      .eq('id', roundId)
      .single();

    if (roundError) throw roundError;

    // exactHandicap is stored as a 9-hole handicap
    // For 18-hole rounds, we need to multiply by 2 first
    let handicapToUse = exactHandicap;
    if (round.num_holes === 18) {
      handicapToUse = exactHandicap * 2;
    }

    // Get slope for calculations
    const slopeInfo = useSlope ? await this.getRoundSlope(roundId) : null;
    const slope = slopeInfo?.slope || 113;

    // Calculate playing handicap
    let playingHandicap = useSlope
      ? calculatePlayingHandicap(handicapToUse, slope)
      : Math.round(handicapToUse);

    const { data, error } = await supabase
      .from('round_players')
      .insert([
        {
          round_id: roundId,
          player_id: playerId || null,
          name,
          exact_handicap: exactHandicap,
          exact_handicap_18: exactHandicap,
          playing_handicap: playingHandicap,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getRoundPlayers(roundId: string): Promise<RoundPlayer[]> {
    console.log('🔷 SERVICE: getRoundPlayers llamado para roundId:', roundId);

    const { data, error } = await supabase
      .from('round_players')
      .select('*')
      .eq('round_id', roundId)
      .order('created_at', { ascending: true });

    if (error) {
      console.log('🔴 SERVICE: Error obteniendo players:', error);
      throw error;
    }

    console.log('🔷 SERVICE: getRoundPlayers devuelve:', data?.map(p => ({ name: p.name, handicap: p.playing_handicap })));

    return data || [];
  },

  async removePlayerFromRound(playerId: string): Promise<void> {
    const { error } = await supabase
      .from('round_players')
      .delete()
      .eq('id', playerId);

    if (error) throw error;
  },

  // Score operations
  async recordScore(
    roundId: string,
    playerId: string,
    holeNumber: number,
    grossStrokes: number,
    strokesReceived: number,
    netStrokes: number,
    stablefordPoints: number,
    noPasoRojas: boolean = false,
    spanishHands: boolean = false,
    abandoned: boolean = false,
    modePoints: number = 0
  ): Promise<RoundScore> {
    const { data, error } = await supabase
      .from('round_scores')
      .upsert(
        [
          {
            round_id: roundId,
            player_id: playerId,
            hole_number: holeNumber,
            gross_strokes: grossStrokes,
            strokes_received: strokesReceived,
            net_strokes: netStrokes,
            stableford_points: stablefordPoints,
            no_paso_rojas: noPasoRojas,
            spanish_hands: spanishHands,
            abandoned: abandoned,
            mode_points: modePoints,
            updated_at: new Date().toISOString(),
          },
        ],
        {
          onConflict: 'round_id,player_id,hole_number',
        }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getRoundScores(roundId: string): Promise<RoundScore[]> {
    const { data, error } = await supabase
      .from('round_scores')
      .select('*')
      .eq('round_id', roundId)
      .order('hole_number', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async deleteScore(
    roundId: string,
    playerId: string,
    holeNumber: number
  ): Promise<void> {
    const { error } = await supabase
      .from('round_scores')
      .delete()
      .eq('round_id', roundId)
      .eq('player_id', playerId)
      .eq('hole_number', holeNumber);

    if (error) throw error;
  },

  // Realtime subscriptions
  subscribeToRound(roundId: string, callback: (data: any) => void) {
    return supabase
      .channel(`round:${roundId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'round_scores',
          filter: `round_id=eq.${roundId}`,
        },
        (payload) => callback(payload)
      )
      .subscribe();
  },

  subscribeToRounds(callback: (data: any) => void) {
    return supabase
      .channel('active_rounds')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_rounds',
        },
        (payload) => callback(payload)
      )
      .subscribe();
  },

  subscribeToRoundScores(roundId: string, callback: (data: any) => void) {
    return supabase
      .channel(`round_scores_${roundId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_scores',
          filter: `round_id=eq.${roundId}`,
        },
        (payload) => callback(payload)
      )
      .subscribe();
  },

  subscribeToRoundPlayers(roundId: string, callback: (data: any) => void) {
    return supabase
      .channel(`round_players_${roundId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'round_players',
          filter: `round_id=eq.${roundId}`,
        },
        (payload) => callback(payload)
      )
      .subscribe();
  },

  async deleteTemporaryPlayersFromRound(roundId: string): Promise<void> {
    const { data: roundPlayers, error: playersError } = await supabase
      .from('round_players')
      .select('player_id')
      .eq('round_id', roundId);

    if (playersError) throw playersError;

    const playerIds = (roundPlayers || [])
      .map((rp) => rp.player_id)
      .filter((id): id is string => id !== null);

    if (playerIds.length === 0) return;

    const { error } = await supabase
      .from('players')
      .delete()
      .in('id', playerIds)
      .is('group_id', null);

    if (error) throw error;
  },

  async getDailyRankings(): Promise<any[]> {
    const groupId = storageUtils.getCurrentGroupId();

    if (!groupId) {
      return [];
    }

    // Only get active completed rounds (not archived)
    const { data: rounds, error: roundsError } = await supabase
      .from('golf_rounds')
      .select('id, created_at')
      .eq('group_id', groupId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (roundsError) throw roundsError;

    const rankingsByDate: { [date: string]: any[] } = {};

    if (rounds && rounds.length > 0) {
      const roundsByDate: { [date: string]: string[] } = {};
      rounds.forEach((round) => {
        const dateKey = round.created_at.split('T')[0];
        if (!roundsByDate[dateKey]) {
          roundsByDate[dateKey] = [];
        }
        roundsByDate[dateKey].push(round.id);
      });

      const activeRankings = await Promise.all(
        Object.entries(roundsByDate).map(async ([date, roundIds]) => {
          const standingsPromises = roundIds.map(async (roundId) => {
            const [playersData, scoresData] = await Promise.all([
              supabase.from('round_players').select('*').eq('round_id', roundId),
              supabase.from('round_scores').select('*').eq('round_id', roundId),
            ]);

            const players = playersData.data || [];
            const scores = scoresData.data || [];

            return players.filter(player => !player.is_guest).map((player) => {
              const playerScores = scores.filter((s) => s.player_id === player.id);
              const totalPoints = playerScores.reduce((sum, s) => sum + s.stableford_points, 0);
              const noPasoRojasHoles = playerScores
                .filter((s) => s.no_paso_rojas === true)
                .map((s) => s.hole_number)
                .sort((a, b) => a - b);

              return {
                playerId: player.id,
                playerDbId: player.player_id,
                playerName: player.name,
                playingHandicap: player.playing_handicap,
                totalPoints,
                roundId,
                noPasoRojasHoles,
              };
            });
          });

          const allStandings = (await Promise.all(standingsPromises)).flat();
          rankingsByDate[date] = allStandings;
        })
      );
    }

    // Convert to array format
    const rankings = Object.entries(rankingsByDate).map(([date, standings]) => ({
      date,
      standings: standings.sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) {
          return b.totalPoints - a.totalPoints;
        }
        return a.playingHandicap - b.playingHandicap;
      }),
    }));

    // Sort by date descending
    rankings.sort((a, b) => b.date.localeCompare(a.date));

    return rankings;
  },

  async getHandicapHistory(groupId?: string): Promise<any[]> {
    const currentGroupId = groupId || storageUtils.getCurrentGroupId();

    if (!currentGroupId) {
      return [];
    }

    const { data: dailyRankingsData } = await supabase
      .from('daily_rankings')
      .select('*')
      .eq('group_id', currentGroupId)
      .order('ranking_date', { ascending: false });

    if (!dailyRankingsData || dailyRankingsData.length === 0) return [];

    const archivedRounds = await this.getStatisticsRounds(currentGroupId);

    const handicapsByPlayerAndDate = new Map<string, Map<string, number>>();
    archivedRounds.forEach((round) => {
      const date = round.played_at.split('T')[0];
      if (round.final_ranking && Array.isArray(round.final_ranking)) {
        round.final_ranking.forEach((rankEntry: any) => {
          const playerName = rankEntry.player_name || rankEntry.playerName;
          const exactHandicap = rankEntry.handicap !== undefined ? rankEntry.handicap : rankEntry.exactHandicap;

          if (playerName && exactHandicap !== undefined) {
            if (!handicapsByPlayerAndDate.has(date)) {
              handicapsByPlayerAndDate.set(date, new Map());
            }
            handicapsByPlayerAndDate.get(date)!.set(playerName, exactHandicap);
          }
        });
      }
    });

    const dateRankings = new Map<string, any[]>();
    dailyRankingsData.forEach((ranking) => {
      const date = ranking.ranking_date;
      if (!dateRankings.has(date)) {
        dateRankings.set(date, []);
      }
      dateRankings.get(date)!.push(ranking);
    });

    const historyByDate: { [date: string]: { [playerName: string]: { newHandicap: number; playingHandicap: number } } } = {};
    const allPlayerNames = new Set<string>();

    dateRankings.forEach((rankings, date) => {
      const sortedRankings = rankings.sort((a, b) => a.position - b.position);
      const totalPlayers = sortedRankings.length;
      const isOdd = totalPlayers % 2 === 1;
      const middleIndex = isOdd ? Math.floor(totalPlayers / 2) : totalPlayers / 2;

      historyByDate[date] = {};

      sortedRankings.forEach((ranking, index) => {
        const playerName = ranking.player_name;
        allPlayerNames.add(playerName);

        const playingHandicap = ranking.hcp_juego;

        if (playingHandicap !== undefined && playingHandicap !== null) {
          let adjustment = 0;

          if (isOdd) {
            if (index < middleIndex) {
              adjustment = playingHandicap > 0 ? -1 : 0;
            } else if (index === middleIndex) {
              adjustment = 0;
            } else {
              adjustment = playingHandicap < 12 ? 1 : 0;
            }
          } else {
            if (index < middleIndex) {
              adjustment = playingHandicap > 0 ? -1 : 0;
            } else {
              adjustment = playingHandicap < 12 ? 1 : 0;
            }
          }

          const newHandicap = Math.max(0, playingHandicap + adjustment);

          historyByDate[date][playerName] = {
            newHandicap,
            playingHandicap
          };
        }
      });
    });

    const sortedDates = Array.from(dateRankings.keys()).sort((a, b) =>
      new Date(b).getTime() - new Date(a).getTime()
    );

    return sortedDates.map((date) => ({
      date,
      handicaps: historyByDate[date],
      playerNames: Array.from(allPlayerNames).sort(),
    }));
  },

  async applyHandicapAdjustments(roundId: string): Promise<void> {
    const roundDetails = await this.getRoundWithDetails(roundId);
    if (!roundDetails) return;

    const { round, players, scores } = roundDetails;

    const playerStats = players.filter(player => !player.is_guest).map((player) => {
      const playerScores = scores.filter((s) => s.player_id === player.id);
      const totalPoints = round.game_mode === 'stableford'
        ? playerScores.reduce((sum, s) => sum + s.stableford_points, 0)
        : playerScores.reduce((sum, s) => sum + (s.mode_points ?? 0), 0);

      return {
        playerId: player.player_id,
        playerName: player.name,
        exactHandicap: player.exact_handicap,
        exactHandicap18: player.exact_handicap_18,
        totalPoints,
        spanishHandsCount: playerScores.filter(score => score.spanish_hands).length,
      };
    });

    const sortedPlayers = playerStats.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      return a.exactHandicap - b.exactHandicap;
    });

    const totalPlayers = sortedPlayers.length;
    const isOdd = totalPlayers % 2 === 1;

    for (let index = 0; index < sortedPlayers.length; index++) {
      const player = sortedPlayers[index];
      const currentHandicap = player.exactHandicap;
      let baseAdjustment = 0;

      if (isOdd) {
        const middleIndex = Math.floor(totalPlayers / 2);
        if (index < middleIndex) {
          baseAdjustment = -1;
        } else if (index === middleIndex) {
          baseAdjustment = 0;
        } else {
          baseAdjustment = 1;
        }
      } else {
        const middleIndex = totalPlayers / 2;
        if (index < middleIndex) {
          baseAdjustment = -1;
        } else {
          baseAdjustment = 1;
        }
      }

      const newHandicap = Math.min(
        12,
        Math.max(0, currentHandicap + baseAdjustment + player.spanishHandsCount)
      );

      if (newHandicap !== currentHandicap) {
        const { error } = await supabase
          .from('players')
          .update({
            exact_handicap: newHandicap,
            exact_handicap_18: newHandicap,
          })
          .eq('id', player.playerId).is('auth_user_id', null);

        if (error) {
          console.error(`Error updating handicap for player ${player.playerName}:`, error);
        }
      }
    }
  },

  async updateHandicapsFromLastRanking(): Promise<void> {
    const groupId = storageUtils.getCurrentGroupId();
    if (!groupId) {
      throw new Error('No hay un grupo activo');
    }

    const rankings = await this.getDailyRankings();
    if (rankings.length === 0) {
      throw new Error('No hay clasificaciones disponibles');
    }

    const lastRanking = rankings[0];
    // A day with only guests still has rounds to archive, without member adjustments.
    const standings = lastRanking.standings || [];

    const sortedPlayers = [...standings].sort((a: any, b: any) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      return a.playingHandicap - b.playingHandicap;
    });

    const totalPlayers = sortedPlayers.length;
    const isOdd = totalPlayers % 2 === 1;

    for (let index = 0; index < sortedPlayers.length; index++) {
      const player = sortedPlayers[index];
      const currentHandicap = player.playingHandicap;
      let newHandicap = currentHandicap;

      if (isOdd) {
        const middleIndex = Math.floor(totalPlayers / 2);
        if (index < middleIndex) {
          newHandicap = Math.max(0, currentHandicap - 1);
        } else if (index === middleIndex) {
          newHandicap = currentHandicap;
        } else {
          newHandicap = currentHandicap < 12 ? currentHandicap + 1 : currentHandicap;
        }
      } else {
        const middleIndex = totalPlayers / 2;
        if (index < middleIndex) {
          newHandicap = Math.max(0, currentHandicap - 1);
        } else {
          newHandicap = currentHandicap < 12 ? currentHandicap + 1 : currentHandicap;
        }
      }

      if (newHandicap !== currentHandicap && player.playerDbId) {
        const { error } = await supabase
          .from('players')
          .update({
            exact_handicap: newHandicap,
            exact_handicap_18: newHandicap,
          })
          .eq('id', player.playerDbId).is('auth_user_id', null);

        if (error) {
          console.error(`Error updating handicap for player ${player.playerName}:`, error);
        }
      }
    }

    const lastDate = lastRanking.date;
    const { data: roundsToArchive, error: roundsError } = await supabase
      .from('golf_rounds')
      .select('id')
      .eq('group_id', groupId)
      .eq('status', 'completed')
      .gte('created_at', `${lastDate}T00:00:00.000Z`)
      .lte('created_at', `${lastDate}T23:59:59.999Z`);

    if (roundsError) throw roundsError;

    if (roundsToArchive && roundsToArchive.length > 0) {
      for (const round of roundsToArchive) {
        try {
          await this.archiveRound(round.id);
        } catch (err) {
          console.error(`Error archiving round ${round.id}:`, err);
          throw err;
        }
      }
    }
  },

  async archiveRound(roundId: string): Promise<void> {
    const { data: previousArchive, error: archiveLookupError } = await supabase.from('archived_rounds').select('id').eq('source_round_id', roundId).maybeSingle();
    if (archiveLookupError) throw archiveLookupError;
    if (previousArchive) {
      await this.deleteRound(roundId);
      return;
    }
    const roundDetails = await this.getRoundWithDetails(roundId, 3);
    if (!roundDetails) throw new Error('No se pudo cargar la partida. Revisa tu conexión e inténtalo de nuevo.');

    const { round, players, scores, holes } = roundDetails;

    if (!round.group_id) {
      throw new Error('Only multipartidetas (group rounds) can be archived');
    }

    const course = await this.getCourse(round.course_id);
    if (!course) throw new Error('Course not found');

    const playerStats = players.map((player) => {
      const playerScores = scores.filter((s) => s.player_id === player.id);
      const totalPoints = round.game_mode === 'stableford'
        ? playerScores.reduce((sum, s) => sum + s.stableford_points, 0)
        : playerScores.reduce((sum, s) => sum + (s.mode_points ?? 0), 0);
      const noPasoRojasCount = playerScores.filter((s) => s.no_paso_rojas === true).length;
      const spanishHandsCount = playerScores.filter((s) => s.spanish_hands === true).length;

      const eagles = playerScores.filter((s) => {
        const hole = holes.find((h) => h.hole_number === s.hole_number);
        return hole && s.net_strokes <= hole.par - 2 && s.gross_strokes > 0 && !s.abandoned;
      }).length;

      const birdies = playerScores.filter((s) => {
        const hole = holes.find((h) => h.hole_number === s.hole_number);
        return hole && s.net_strokes === hole.par - 1 && s.gross_strokes > 0 && !s.abandoned;
      }).length;

      const pars = playerScores.filter((s) => {
        const hole = holes.find((h) => h.hole_number === s.hole_number);
        return hole && s.net_strokes === hole.par && s.gross_strokes > 0 && !s.abandoned;
      }).length;

      const bogeys = playerScores.filter((s) => {
        const hole = holes.find((h) => h.hole_number === s.hole_number);
        return hole && s.net_strokes === hole.par + 1 && s.gross_strokes > 0 && !s.abandoned;
      }).length;

      const doubleBogeys = playerScores.filter((s) => {
        const hole = holes.find((h) => h.hole_number === s.hole_number);
        return hole && s.net_strokes === hole.par + 2 && s.gross_strokes > 0 && !s.abandoned;
      }).length;

      const tripleBogeyPlus = playerScores.filter((s) => {
        const hole = holes.find((h) => h.hole_number === s.hole_number);
        return hole && s.net_strokes >= hole.par + 3 && s.gross_strokes > 0 && !s.abandoned;
      }).length;

      return {
        playerId: player.id,
        playerDbId: player.player_id,
        playerName: player.name,
        playingHandicap: player.playing_handicap,
        exactHandicap: player.exact_handicap,
        totalPoints,
        noPasoRojasCount,
        spanishHandsCount,
        totalHolesPlayed: playerScores.length,
        holeResults: {
          eagles,
          birdies,
          pars,
          bogeys,
          double_bogeys: doubleBogeys,
          triple_bogey_plus: tripleBogeyPlus,
        },
      };
    });

    const teamHandicap = (playerId: string): number => {
      const playerIndex = players.findIndex(player => player.id === playerId);
      const teamPlayers = playerIndex < 2 ? players.slice(0, 2) : players.slice(2, 4);
      return teamPlayers.reduce((sum, player) => sum + player.playing_handicap, 0);
    };

    // Puntos descendentes; en empate gana el HCP menor (suma del equipo en parejas).
    const sortedPlayers = playerStats.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      if (round.game_mode === 'parejas') {
        const teamDifference = teamHandicap(a.playerId) - teamHandicap(b.playerId);
        if (teamDifference !== 0) return teamDifference;
      }
      return a.playingHandicap - b.playingHandicap;
    });

    const finalRanking = sortedPlayers.map((player, index) => ({
      position: index + 1,
      player_name: player.playerName,
      player_id: player.playerId,
      player_db_id: player.playerDbId,
      points: player.totalPoints,
      hcp_juego: player.playingHandicap,
      handicap: player.exactHandicap,
      game_mode: round.game_mode || 'stableford',
    }));

    const totalPlayers = sortedPlayers.length;
    const receiverCount = Math.floor(totalPlayers / 2);
    const payerStart = totalPlayers % 2 === 0 ? receiverCount + 1 : receiverCount + 2;

    const playerStatsForArchive = sortedPlayers.map((player, index) => {
      const position = index + 1;
      const beersWon = position <= receiverCount ? 1 : 0;
      const beersPaid = position >= payerStart ? 1 : 0;

      return {
        player_name: player.playerName,
        player_id: player.playerId,
      player_db_id: player.playerDbId,
        playingHandicap: player.playingHandicap,
        handicap: player.exactHandicap,
        no_paso_rojas_count: player.noPasoRojasCount,
        spanish_hands_count: player.spanishHandsCount,
        total_holes_played: player.totalHolesPlayed,
        beers_won: beersWon,
        beers_paid: beersPaid,
        hole_results: player.holeResults,
      };
    });

    const holeScoresForArchive = scores.map((score) => {
      const player = players.find((p) => p.id === score.player_id);
      const hole = holes.find((h) => h.hole_number === score.hole_number);

      if (!player || !hole) return null;

      const scoreDiff = score.gross_strokes - hole.par;
      let result = 'par';
      if (scoreDiff <= -2) result = 'eagle';
      else if (scoreDiff === -1) result = 'birdie';
      else if (scoreDiff === 0) result = 'par';
      else if (scoreDiff === 1) result = 'bogey';
      else if (scoreDiff === 2) result = 'double_bogey';
      else if (scoreDiff >= 3) result = 'triple_bogey_plus';

      return {
        player_id: player.id,
        player_name: player.name,
        hole_number: score.hole_number,
        par: hole.par,
        gross_strokes: score.gross_strokes,
        net_strokes: score.net_strokes,
        stableford_points: score.stableford_points,
        result: result,
        no_paso_rojas: score.no_paso_rojas || false,
        spanish_hands: score.spanish_hands || false,
      };
    }).filter(Boolean);

    const currentSeason = await this.getCurrentSeason(round.group_id);

    const { error } = await supabase
      .from('archived_rounds')
      .insert([
        {
          group_id: round.group_id,
          source_round_id: round.id,
          course_name: course.name,
          played_at: round.created_at,
          final_ranking: finalRanking,
          player_stats: playerStatsForArchive,
          hole_scores: holeScoresForArchive,
          season_id: currentSeason?.id || null,
        },
      ]);

    if (error) throw error;

    // calculate_daily_ranking and handicap adjustments are handled automatically
    // by the trigger_auto_calculate_daily_ranking trigger on archived_rounds INSERT.
    // Beer stats need explicit calculation as they are not in the trigger.
    try {
      await this.calculateBeerStatsForRound(roundId);
    } catch (beerErr) {
      console.error('Error calculating beer stats (non-fatal):', beerErr);
    }

    await this.deleteRound(roundId);
  },

  async getArchivedRounds(groupId?: string, seasonId?: string): Promise<any[]> {
    let query = supabase
      .from('archived_rounds')
      .select('*')
      .order('played_at', { ascending: false });

    if (groupId) {
      query = query.eq('group_id', groupId);
    }

    if (seasonId) {
      query = query.eq('season_id', seasonId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getStatisticsRounds(groupId?: string, seasonId?: string): Promise<any[]> {
    let query = supabase
      .from('group_statistics_rounds')
      .select('*')
      .order('played_at', { ascending: false });

    if (groupId) {
      query = query.eq('group_id', groupId);
    }

    if (seasonId) {
      query = query.eq('season_id', seasonId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getPlayerStatistics(playerName: string, groupId: string): Promise<any> {
    const archivedRounds = await this.getStatisticsRounds(groupId);

    const playerRounds = archivedRounds.filter((round) =>
      round.final_ranking.some((r: any) => r.player_name === playerName)
    );

    if (playerRounds.length === 0) {
      return {
        totalRounds: 0,
        totalPoints: 0,
        averagePoints: 0,
        averagePosition: 0,
        wins: 0,
        podiums: 0,
        beersWon: 0,
        beersPaid: 0,
      };
    }

    let totalPoints = 0;
    let totalPosition = 0;
    let wins = 0;
    let podiums = 0;

    playerRounds.forEach((round) => {
      const playerRanking = round.final_ranking.find(
        (r: any) => r.player_name === playerName
      );
      if (playerRanking) {
        totalPoints += playerRanking.points;
        totalPosition += playerRanking.position;

        if (playerRanking.position === 1) {
          wins++;
        }
        if (playerRanking.position <= 3) {
          podiums++;
        }
      }
    });

    // Get beer stats from daily_rankings table
    let beersWon = 0;
    let beersPaid = 0;

    const { data: dailyRankings, error } = await supabase
      .from('daily_rankings')
      .select('receives_beer, pays_beer')
      .eq('group_id', groupId)
      .eq('player_name', playerName);

    if (error) {
      console.error('Error fetching daily rankings:', error);
    } else if (dailyRankings) {
      dailyRankings.forEach((dr) => {
        if (dr.receives_beer) {
          beersWon++;
        }
        if (dr.pays_beer) {
          beersPaid++;
        }
      });
    }

    return {
      totalRounds: playerRounds.length,
      totalPoints,
      averagePoints: totalPoints / playerRounds.length,
      averagePosition: totalPosition / playerRounds.length,
      wins,
      podiums,
      beersWon,
      beersPaid,
    };
  },

  async getGroupStatistics(groupId: string): Promise<any> {
    const archivedRounds = await this.getStatisticsRounds(groupId);

    if (archivedRounds.length === 0) {
      return {
        totalRounds: 0,
        playerStats: [],
      };
    }

    const playerMap = new Map<string, any>();

    archivedRounds.forEach((round) => {
      round.final_ranking.forEach((ranking: any) => {
        if (!playerMap.has(ranking.player_name)) {
          playerMap.set(ranking.player_name, {
            name: ranking.player_name,
            totalRounds: 0,
            totalPoints: 0,
            wins: 0,
            podiums: 0,
            beersWon: 0,
            beersPaid: 0,
          });
        }

        const player = playerMap.get(ranking.player_name);
        player.totalRounds++;
        player.totalPoints += ranking.points;

        if (ranking.position === 1) {
          player.wins++;
        }
        if (ranking.position <= 3) {
          player.podiums++;
        }
      });
    });

    // Get beer stats from daily_rankings table
    const { data: dailyRankings, error } = await supabase
      .from('daily_rankings')
      .select('player_name, receives_beer, pays_beer')
      .eq('group_id', groupId);

    if (error) {
      console.error('Error fetching daily rankings:', error);
    } else if (dailyRankings) {
      dailyRankings.forEach((dr) => {
        const player = playerMap.get(dr.player_name);
        if (player) {
          if (dr.receives_beer) {
            player.beersWon++;
          }
          if (dr.pays_beer) {
            player.beersPaid++;
          }
        }
      });
    }

    const playerStats = Array.from(playerMap.values()).map((player) => ({
      ...player,
      averagePoints: player.totalPoints / player.totalRounds,
      beerBalance: player.beersWon - player.beersPaid,
    }));

    playerStats.sort((a, b) => b.totalPoints - a.totalPoints);

    return {
      totalRounds: archivedRounds.length,
      playerStats,
    };
  },

  async getCourseStatistics(courseName: string, groupId?: string): Promise<any> {
    let archivedRounds = await this.getStatisticsRounds(groupId);

    archivedRounds = archivedRounds.filter((round) => round.course_name === courseName);

    if (archivedRounds.length === 0) {
      return {
        courseName,
        totalRounds: 0,
        averageWinningScore: 0,
        highestScore: 0,
        lowestScore: 0,
        topPlayers: [],
      };
    }

    let totalWinningScore = 0;
    let highestScore = 0;
    let lowestScore = Infinity;
    const playerScores = new Map<string, number[]>();

    archivedRounds.forEach((round) => {
      const winner = round.final_ranking[0];
      totalWinningScore += winner.points;
      highestScore = Math.max(highestScore, winner.points);

      round.final_ranking.forEach((ranking: any) => {
        lowestScore = Math.min(lowestScore, ranking.points);

        if (!playerScores.has(ranking.player_name)) {
          playerScores.set(ranking.player_name, []);
        }
        playerScores.get(ranking.player_name)!.push(ranking.points);
      });
    });

    const topPlayers = Array.from(playerScores.entries())
      .map(([name, scores]) => ({
        name,
        averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
        totalRounds: scores.length,
      }))
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 5);

    return {
      courseName,
      totalRounds: archivedRounds.length,
      averageWinningScore: totalWinningScore / archivedRounds.length,
      highestScore,
      lowestScore: lowestScore === Infinity ? 0 : lowestScore,
      topPlayers,
    };
  },

  async createSeason(
    groupId: string,
    name: string,
    startDate: string,
    endDate?: string
  ): Promise<any> {
    const { data, error } = await supabase
      .from('seasons')
      .insert([
        {
          group_id: groupId,
          name,
          start_date: startDate,
          end_date: endDate || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getSeasons(groupId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .eq('group_id', groupId)
      .order('start_date', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getCurrentSeason(groupId: string): Promise<any | null> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .eq('group_id', groupId)
      .lte('start_date', today)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async endSeason(seasonId: string, endDate: string): Promise<void> {
    const { error } = await supabase
      .from('seasons')
      .update({ end_date: endDate })
      .eq('id', seasonId);

    if (error) throw error;
  },

  async calculateBeerStatsForRound(roundId: string): Promise<void> {
    const { error } = await supabase.rpc('calculate_beer_stats_for_round', {
      p_round_id: roundId,
    });

    if (error) throw error;
  },

  async getDivendStatistics(groupId: string): Promise<{
    patrocinador?: { name: string; value: number; rounds_played?: number };
    barraLibre?: { name: string; value: number; rounds_played?: number };
    corto?: { name: string; value: number; rounds_played?: number };
    driverOro?: { name: string; value: number; rounds_played?: number };
  }> {
    try {
      const [patrocinadorData, barraLibreData, cortoData, driverOroData] = await Promise.all([
        this.getPatrocinadorRanking(groupId),
        this.getBarraLibreRanking(groupId),
        this.getCortoRanking(groupId),
        this.getDriverOroRanking(groupId),
      ]);

      const stats: any = {
        patrocinador: undefined,
        barraLibre: undefined,
        corto: undefined,
        driverOro: undefined,
      };

      if (patrocinadorData && patrocinadorData.length > 0) {
        const top = patrocinadorData[0];
        stats.patrocinador = { name: top.player_name, value: top.total_beers_paid, rounds_played: top.total_rounds };
      }

      if (barraLibreData && barraLibreData.length > 0) {
        const top = barraLibreData[0];
        stats.barraLibre = { name: top.player_name, value: top.total_beers_won, rounds_played: top.total_rounds };
      }

      if (cortoData && cortoData.length > 0) {
        const top = cortoData[0];
        stats.corto = { name: top.player_name, value: top.no_paso_rojas_count, rounds_played: top.total_rounds };
      }

      if (driverOroData && driverOroData.length > 0) {
        const top = driverOroData[0];
        stats.driverOro = { name: top.player_name, value: top.no_paso_rojas_count, rounds_played: top.total_rounds };
      }

      return stats;
    } catch (error) {
      console.error('Error getting DIVEND statistics:', error);
      return {
        patrocinador: undefined,
        barraLibre: undefined,
        corto: undefined,
        driverOro: undefined,
      };
    }
  },

  async getPatrocinadorRanking(groupId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_patrocinador_ranking', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data || [];
  },

  async getBarraLibreRanking(groupId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_barra_libre_ranking', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data || [];
  },

  async getCortoRanking(groupId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_corto_ranking', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data || [];
  },

  async getDriverOroRanking(groupId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_driver_oro_ranking', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data || [];
  },

  async getPlayerBeerStats(playerId: string): Promise<{ paid: number; received: number }> {
    const { data: paidData, error: paidError } = await supabase
      .from('beer_stats')
      .select('round_id', { count: 'exact' })
      .eq('player_id', playerId)
      .eq('status', 'payer');

    if (paidError) throw paidError;

    const { data: receivedData, error: receivedError } = await supabase
      .from('beer_stats')
      .select('round_id', { count: 'exact' })
      .eq('player_id', playerId)
      .eq('status', 'receiver');

    if (receivedError) throw receivedError;

    return {
      paid: paidData?.length || 0,
      received: receivedData?.length || 0,
    };
  },

  async getDetailedPlayerStatistics(playerName: string, groupId: string): Promise<any> {
    const archivedRounds = await this.getStatisticsRounds(groupId);

    const playerRounds = archivedRounds.filter((round) =>
      round.final_ranking?.some((r: any) => r.player_name === playerName)
    );

    if (playerRounds.length === 0) {
      return null;
    }

    let eagles = 0;
    let birdies = 0;
    let pars = 0;
    let bogeys = 0;
    let doubleBogeys = 0;
    let tripleBogeysPlus = 0;
    let totalHolesPlayed = 0;
    let bestRound: { points: number; course: string; date: string } | null = null;

    playerRounds.forEach((round) => {
      const playerStat = round.player_stats?.find((ps: any) => ps.player_name === playerName);
      if (playerStat?.hole_results) {
        const hr = playerStat.hole_results;
        eagles += hr.eagles || 0;
        birdies += hr.birdies || 0;
        pars += hr.pars || 0;
        bogeys += hr.bogeys || 0;
        doubleBogeys += hr.double_bogeys || 0;
        tripleBogeysPlus += hr.triple_bogey_plus || hr.triple_bogeys_plus || 0;
      }
      totalHolesPlayed += playerStat?.total_holes_played || 0;

      const ranking = round.final_ranking.find((r: any) => r.player_name === playerName);
      if (ranking) {
        if (!bestRound || ranking.points > bestRound.points) {
          bestRound = {
            points: ranking.points,
            course: round.course_name,
            date: round.played_at,
          };
        }
      }
    });

    let currentHandicap = 0;
    const latestRanking = playerRounds[0].final_ranking.find((entry: any) => entry.player_name === playerName);
    const playerId = latestRanking?.player_db_id ?? (await this.getPlayerIdByName(playerName, groupId))?.id;
    if (playerId) {
      const { data: playerData } = await supabase
        .from('players')
        .select('exact_handicap')
        .eq('id', playerId)
        .maybeSingle();
      currentHandicap = playerData?.exact_handicap || 0;
    }

    return {
      total_holes_played: totalHolesPlayed,
      current_handicap: currentHandicap,
      best_round: bestRound,
      hole_results: {
        eagles,
        birdies,
        pars,
        bogeys,
        double_bogeys: doubleBogeys,
        triple_bogeys_plus: tripleBogeysPlus,
      },
    };
  },

  async getPlayerIdByName(playerName: string, groupId: string): Promise<{ id: string } | null> {
    let query = supabase
      .from('players')
      .select('id')
      .eq('name', playerName)
      .eq('is_guest', false);

    if (groupId) {
      query = query.eq('group_id', groupId);
    } else {
      query = query.is('group_id', null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('Error looking up player by name:', error);
      return null;
    }

    return data;
  },

  async getKillerRanking(groupId: string): Promise<any> {
    const { data, error } = await supabase.rpc('get_killer_ranking', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data?.[0] || null;
  },

  async getPaqueteRanking(groupId: string): Promise<any> {
    const { data, error } = await supabase.rpc('get_paquete_ranking', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data?.[0] || null;
  },

  async getSharkRanking(groupId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_shark_ranking', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data || [];
  },

  async getMetronomoRanking(groupId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_metronomo_ranking', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data || [];
  },

  async getViciadoRanking(groupId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_viciado_ranking', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data || [];
  },

  async getFrancotiradorRanking(groupId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_francotirador_ranking', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data || [];
  },

  async getMaquinaRanking(groupId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_maquina_ranking', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data || [];
  },

  async getAmigoDelMasUnoRanking(groupId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_amigo_del_mas_uno_ranking', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data || [];
  },

  async getReyDelBosqueRanking(groupId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_rey_del_bosque_ranking', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data || [];
  },

  async getTopoRanking(groupId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_topo_ranking', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data || [];
  },

  async getLaPaliza(groupId: string): Promise<any> {
    const { data, error } = await supabase.rpc('get_la_paliza', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data?.[0] || null;
  },

  async getHeadToHead(groupId: string, player1Name: string, player2Name: string): Promise<any> {
    const { data, error } = await supabase.rpc('get_head_to_head', {
      p_group_id: groupId,
      player1_name: player1Name,
      player2_name: player2Name,
    });
    if (error) throw error;
    return data?.[0] || null;
  },

  async getHoyoMuerte(groupId: string, courseName: string): Promise<any> {
    const { data, error } = await supabase.rpc('get_hoyo_muerte', {
      p_group_id: groupId,
      p_course_name: courseName,
    });
    if (error) throw error;
    return data?.[0] || null;
  },

  async getHoyoGloria(groupId: string, courseName: string): Promise<any> {
    const { data, error } = await supabase.rpc('get_hoyo_gloria', {
      p_group_id: groupId,
      p_course_name: courseName,
    });
    if (error) throw error;
    return data?.[0] || null;
  },

  async getMejorRondaCampo(groupId: string, courseName: string): Promise<any> {
    const { data, error } = await supabase.rpc('get_mejor_ronda_campo', {
      p_group_id: groupId,
      p_course_name: courseName,
    });
    if (error) throw error;
    return data?.[0] || null;
  },

  async getDailyRankingForDate(groupId: string, date: Date): Promise<any[]> {
    const dateString = date.toISOString().split('T')[0];

    const { data: dailyRanking, error: rankingError } = await supabase
      .from('daily_rankings')
      .select('*')
      .eq('group_id', groupId)
      .eq('ranking_date', dateString)
      .order('position', { ascending: true });

    if (rankingError) throw rankingError;

    if (!dailyRanking || dailyRanking.length === 0) {
      return [];
    }

    const { data: rounds, error: roundsError } = await supabase
      .from('group_statistics_rounds')
      .select('*')
      .eq('group_id', groupId)
      .gte('archived_at', `${dateString}T00:00:00`)
      .lte('archived_at', `${dateString}T23:59:59`);

    if (roundsError) throw roundsError;

    const rankingWithNoPasoRojas = dailyRanking.map((ranking) => {
      let noPasoRojasCount = 0;

      rounds?.forEach((round) => {
        const playerStat = round.player_stats?.find((ps: any) => ps.player_name === ranking.player_name);
        if (playerStat) {
          noPasoRojasCount += playerStat.no_paso_rojas_count || 0;
        }
      });

      return {
        ...ranking,
        no_paso_rojas_count: noPasoRojasCount,
      };
    });

    return rankingWithNoPasoRojas;
  },

  async getArchivedRoundsForDate(groupId: string, date: Date): Promise<any[]> {
    const dateString = date.toISOString().split('T')[0];

    const { data: rounds, error: roundsError } = await supabase
      .from('archived_rounds')
      .select('*')
      .eq('group_id', groupId)
      .gte('played_at', `${dateString}T00:00:00`)
      .lte('played_at', `${dateString}T23:59:59`)
      .order('played_at', { ascending: true });

    if (roundsError) throw roundsError;

    return rounds || [];
  },

  async updatePlayerHandicap(playerId: string, newHandicap: number): Promise<void> {
    const { error } = await supabase
      .from('players')
      .update({
        exact_handicap: newHandicap,
        exact_handicap_18: newHandicap,
        updated_at: new Date().toISOString(),
      })
      .eq('id', playerId);

    if (error) throw error;
  },

  async updatePlayerName(playerId: string, newName: string): Promise<Player> {
    const { data, error } = await supabase
      .from('players')
      .update({
        name: newName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', playerId)
      .select()
      .single();

    if (error) throw error;

    const { error: rpcError } = await supabase.rpc(
      'update_player_name_in_archived_rounds',
      {
        player_id_param: playerId,
        new_name_param: newName,
      }
    );

    if (rpcError) {
      console.error('Error updating player name in archived rounds:', rpcError);
    }

    return data;
  },

  async saveCompletedRoundSummary(
    roundId: string,
    players: RoundPlayer[],
    scores: RoundScore[],
    round: GolfRound,
    courseName: string
  ): Promise<void> {
    const userId = getUserId();

    const playerStats = players.map(player => {
      const playerScores = scores.filter(s => s.player_id === player.id);
      const totalPoints = playerScores.reduce((sum, s) => sum + s.stableford_points, 0);

      const eagles = playerScores.filter(s => s.stableford_points >= 4).length;
      const birdies = playerScores.filter(s => s.stableford_points === 3).length;
      const pars = playerScores.filter(s => s.stableford_points === 2).length;
      const bogeys = playerScores.filter(s => s.stableford_points === 1).length;

      return {
        name: player.name,
        exactHandicap: player.exact_handicap,
        playingHandicap: player.playing_handicap,
        totalPoints,
        eagles,
        birdies,
        pars,
        bogeys
      };
    });

    const { error } = await supabase
      .from('completed_rounds_summary')
      .insert({
        round_id: roundId,
        user_id: userId,
        group_id: round.group_id,
        course_name: courseName,
        num_holes: round.num_holes,
        holes_range: round.holes_range,
        use_slope: round.use_slope,
        completed_at: new Date().toISOString(),
        player_stats: playerStats,
        total_players: players.length
      });

    if (error) {
      console.error('Error guardando resumen de partida:', error);
      throw error;
    }
  },

  async getCompletedRoundsSummaries(groupId?: string): Promise<any[]> {
    const userId = getUserId();

    let query = supabase
      .from('completed_rounds_summary')
      .select('*')
      .order('completed_at', { ascending: false });

    if (groupId) {
      query = query.eq('group_id', groupId);
    } else {
      query = query.eq('user_id', userId).is('group_id', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error obteniendo resúmenes de partidas:', error);
      throw error;
    }

    return data || [];
  },

async getQuickPlayCompletedRound(roundId?: string): Promise<any | null> {
  const userId = getUserId();

  // Definimos la consulta base
  let query = supabase
    .from('golf_rounds')
    .select('*')
    .eq('user_id', userId)
    .is('group_id', null)
    .in('status', ['completed', 'archived']);

  if (roundId) {
    // Si recibimos un ID específico desde el desplegable, buscamos ESA partida
    query = query.eq('id', roundId);
  } else {
    // Si no viene ID, traemos la más reciente por defecto
    query = query
      .order('completed_at', { ascending: false })
      .limit(1);
  }

  const { data: rounds, error } = await query;

  if (!error && rounds && rounds.length > 0) {
    const round = rounds[0];

    // Cargar los datos específicos de la partida encontrada (round.id)
    const [players, scores, course, holes] = await Promise.all([
      this.getRoundPlayers(round.id),
      this.getRoundScores(round.id),
      this.getCourse(round.course_id),
      this.getCourseHoles(round.course_id, round.num_holes, round.holes_range),
    ]);

    return {
      round,
      players,
      scores,
      course,
      holes,
      isCreator: true,
    };
  }

    // 2. Si no se encontró partida propia, revisar los códigos de acceso guardados
    const storedCodes = accessCodeStorage.getAllAccessCodes();
    console.log('[getQuickPlayCompletedRound] No creator round found. Checking stored access codes:', storedCodes.length);

    for (const entry of storedCodes) {
      const { data: roundData, error: roundError } = await supabase
        .from('golf_rounds')
        .select('*')
        .eq('id', entry.roundId)
        .is('group_id', null)
        .in('status', ['completed', 'archived'])
        .single();

      if (!roundError && roundData) {
        const [players, scores, course, holes] = await Promise.all([
          this.getRoundPlayers(roundData.id),
          this.getRoundScores(roundData.id),
          this.getCourse(roundData.course_id),
          this.getCourseHoles(roundData.course_id, roundData.num_holes, roundData.holes_range),
        ]);

        return {
          round: roundData,
          players,
          scores,
          course,
          holes,
          isCreator: false,
        };
      }
    }

    return null;
  }, // <-- AQUÍ ES DONDE DEBE CERRARSE LA FUNCIÓN

  async deleteQuickPlayCompletedRound(roundId?: string): Promise<void> {
    const userId = getUserId();

    const { data: rounds, error: findError } = await supabase
      .from('golf_rounds')
      .select('id')
      .eq('user_id', userId)
      .is('group_id', null)
      .eq('status', 'completed')
      .match(roundId ? { id: roundId } : {})
      .limit(1);

    if (findError) throw findError;

    if (rounds && rounds.length > 0) {
      const { error: deleteError } = await supabase
        .from('golf_rounds')
        .delete()
        .eq('id', rounds[0].id);

      if (deleteError) throw deleteError;
    }
  },

    calculateQuickPlayAwards(
    players: RoundPlayer[],
    scores: RoundScore[],
    holes: GolfHole[],
    gameMode: GameMode = 'stableford'
  ): any {
    const getPlayerStats = (player: RoundPlayer) => {
      const playerScores = scores.filter(s => s.player_id === player.id && !s.abandoned);
      const totalStablefordPoints = playerScores.reduce((sum, s) => sum + s.stableford_points, 0);
      const totalModePoints = playerScores.reduce((sum, s) => sum + (s.mode_points || 0), 0);

      const doubleBogeysOrWorse = playerScores.filter(s => {
        const hole = holes.find(h => h.hole_number === s.hole_number);
        if (!hole) return false;
        return s.net_strokes >= hole.par + 2;
      }).length;

      const noPasoRojasCount = playerScores.filter(s => s.no_paso_rojas).length;
      const holeInOnes = playerScores.filter(s => s.gross_strokes === 1).length;

      return {
        player,
        totalStablefordPoints,
        totalModePoints,
        totalPoints: gameMode === 'stableford' ? totalStablefordPoints : totalModePoints,
        doubleBogeysOrWorse,
        noPasoRojasCount,
        holeInOnes,
        playerScores,
      };
    };

    // Determinar campo de puntuación según modalidad
    let playerRankings = players.map(getPlayerStats);
    if (gameMode === 'match' || gameMode === 'sindicato' || gameMode === 'parejas') {
      playerRankings = playerRankings.sort((a, b) => {
        if (b.totalModePoints !== a.totalModePoints) return b.totalModePoints - a.totalModePoints;
        return a.player.playing_handicap - b.player.playing_handicap;
      });
    } else {
      playerRankings = playerRankings.sort((a, b) => {
        if (b.totalStablefordPoints !== a.totalStablefordPoints) return b.totalStablefordPoints - a.totalStablefordPoints;
        return a.player.playing_handicap - b.player.playing_handicap;
      });
    }

    // Awards comunes
    const reyDelBosque = [...playerRankings].sort((a, b) => b.doubleBogeysOrWorse - a.doubleBogeysOrWorse)[0];
    const noPasoRojas = [...playerRankings].sort((a, b) => b.noPasoRojasCount - a.noPasoRojasCount)[0];
    const holeInOneWinners = playerRankings.filter(p => p.holeInOnes > 0);

    let hoyoMuerte = null;
    let hoyoGloria = null;
    const holeStats = holes.map(hole => {
      const holeScores = scores.filter(s => s.hole_number === hole.hole_number && !s.abandoned);
      if (holeScores.length === 0) return null;
      const avgPoints = holeScores.reduce((sum, s) => sum + s.stableford_points, 0) / holeScores.length;
      return { holeNumber: hole.hole_number, par: hole.par, avgPoints };
    }).filter(h => h !== null);

    if (holeStats.length > 0) {
      const sortedByWorst = [...holeStats].sort((a, b) => a.avgPoints - b.avgPoints);
      hoyoMuerte = sortedByWorst[0];
      const sortedByBest = [...holeStats].sort((a, b) => b.avgPoints - a.avgPoints);
      hoyoGloria = sortedByBest[0];
    }

    let laPaliza = null;
    if (playerRankings.length >= 2) {
      const winner = playerRankings[0];
      const last = playerRankings[playerRankings.length - 1];
      const difference = winner.totalPoints - last.totalPoints;
      if (difference > 0) {
        laPaliza = {
          winner: winner.player,
          winnerPoints: winner.totalPoints,
          loser: last.player,
          loserPoints: last.totalPoints,
          difference,
        };
      }
    }

    const baseAwards = {
      reyDelBosque: reyDelBosque?.doubleBogeysOrWorse > 0 ? { player: reyDelBosque.player, count: reyDelBosque.doubleBogeysOrWorse } : null,
      noPasoRojas: noPasoRojas?.noPasoRojasCount > 0 ? { player: noPasoRojas.player, count: noPasoRojas.noPasoRojasCount } : null,
      holeInOne: holeInOneWinners.length > 0 ? { players: holeInOneWinners.map(p => ({ player: p.player, count: p.holeInOnes })) } : null,
      hoyoMuerte,
      hoyoGloria,
      laPaliza,
    };

    // === MATCH (1v1) ===
    if (gameMode === 'match') {
      const winner = playerRankings[0];
      const loser = playerRankings[1];
      const margin = winner && loser ? winner.totalPoints - loser.totalPoints : 0;
      return {
        ranking: playerRankings,
        matchResult: {
          winner: winner?.player || null,
          loser: loser?.player || null,
          winnerPoints: winner?.totalPoints || 0,
          loserPoints: loser?.totalPoints || 0,
          margin,
        },
        awards: baseAwards,
      };
    }

    // === SINDICATO (3 jugadores) ===
    if (gameMode === 'sindicato') {
      return {
        ranking: playerRankings,
        awards: baseAwards,
      };
    }

    // === PAREJAS (2v2) ===
    if (gameMode === 'parejas') {
      const team0Players = players.slice(0, 2);
      const team1Players = players.slice(2, 4);

      // CORRECCIÓN: solo sumamos mode_points de UN jugador por pareja
      // porque ambos miembros reciben los mismos puntos por hoyo
      const team0Points = team0Players[0]
        ? scores
            .filter(s => s.player_id === team0Players[0].id)
            .reduce((sum, s) => sum + (s.mode_points || 0), 0)
        : 0;

      const team1Points = team1Players[0]
        ? scores
            .filter(s => s.player_id === team1Players[0].id)
            .reduce((sum, s) => sum + (s.mode_points || 0), 0)
        : 0;

      const teamRanking = [
        { team: 0, players: team0Players, totalPoints: team0Points, handicap: team0Players.reduce((sum, p) => sum + p.playing_handicap, 0), label: 'Pareja 1' },
        { team: 1, players: team1Players, totalPoints: team1Points, handicap: team1Players.reduce((sum, p) => sum + p.playing_handicap, 0), label: 'Pareja 2' },
      ].sort((a, b) => b.totalPoints - a.totalPoints || a.handicap - b.handicap);

      const isTie = teamRanking[0].totalPoints === teamRanking[1].totalPoints
        && teamRanking[0].handicap === teamRanking[1].handicap;
      const margin = Math.abs(team0Points - team1Points);

      return {
        ranking: playerRankings,
        teamRanking,
        teamResult: {
          isTie,
          winningTeam: isTie ? null : teamRanking[0],
          losingTeam: isTie ? null : teamRanking[1],
          margin: isTie ? 0 : margin,
        },
        awards: baseAwards,
      };
    }

    // === STABLEFORD (default) ===
    return {
      ranking: playerRankings,
      awards: baseAwards,
    };
  },

  
};
