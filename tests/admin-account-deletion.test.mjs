import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20261025100000_account_deletion.sql', import.meta.url), 'utf8');

// Esquema mínimo con las protecciones reales que afectan a la baja.
const schema = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.uid', true), '')::uuid$$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('role', coalesce(nullif(current_setting('request.role', true), ''), 'anon'))$$;
  CREATE FUNCTION public.is_app_user_read_only() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
  CREATE FUNCTION public.require_group_manager(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'requiere gestor'; END$$;
  CREATE FUNCTION public.require_group_result_writer(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'requiere escritor'; END$$;
  CREATE FUNCTION public.ensure_group_player(uuid, uuid) RETURNS void LANGUAGE sql AS $$SELECT$$;
  CREATE FUNCTION public.is_group_member(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
  CREATE FUNCTION public.can_manage_group_messages(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
  CREATE SEQUENCE public.group_member_versions;
  CREATE TABLE public.group_write_permits(tx bigint, entity uuid, operation text);
  CREATE TABLE public.app_administrators(user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT, alias text, status text DEFAULT 'active');
  CREATE TABLE public.user_profiles(id uuid DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, nick text NOT NULL, display_name text);
  CREATE TABLE public.groups(id uuid PRIMARY KEY, name text, group_code text, user_auth_id uuid, archived_at timestamptz, created_at timestamptz DEFAULT now());
  CREATE TABLE public.group_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role text DEFAULT 'member', invited_by uuid REFERENCES auth.users(id), joined_at timestamptz DEFAULT now(), member_revision bigint DEFAULT nextval('public.group_member_versions'));
  CREATE TABLE public.players(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid, name text, auth_user_id uuid REFERENCES auth.users(id), is_guest boolean DEFAULT false, member_revision bigint DEFAULT 1, updated_at timestamptz);
  CREATE TABLE public.golf_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid, created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE, admin_withdrawn_at timestamptz, admin_previous_status text, updated_at timestamptz);
  CREATE TABLE public.round_players(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid REFERENCES public.golf_rounds(id) ON DELETE CASCADE, player_id uuid, user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, name text, is_guest boolean DEFAULT false);
  CREATE TABLE public.archived_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), final_ranking jsonb, player_stats jsonb, hole_scores jsonb);
  CREATE TABLE public.daily_rankings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_name text, game_player_id uuid);
  CREATE TABLE public.handicap_adjustments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid, player_name text);
  CREATE TABLE public.group_invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid, invited_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, invited_by uuid REFERENCES auth.users(id));
  CREATE TABLE public.pro_shop_purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid, purchased_by uuid NOT NULL REFERENCES auth.users(id), product_type text);
  CREATE TABLE public.user_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id));
  CREATE TABLE public.app_messages(id uuid PRIMARY KEY, title text NOT NULL, body text NOT NULL, status text NOT NULL DEFAULT 'draft', author_id uuid NOT NULL, author_alias text NOT NULL, recipients jsonb NOT NULL, revision int NOT NULL DEFAULT 1, sent_at timestamptz, sender_kind text NOT NULL DEFAULT 'app', source_group_id uuid, sender_label text NOT NULL DEFAULT 'Administración', recipient_selection jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
  CREATE TABLE public.app_message_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES public.app_messages(id), kind text NOT NULL, recipient_id uuid NOT NULL, recipient_label text NOT NULL, sent_at timestamptz DEFAULT now(), read_at timestamptz);
  -- Archivo protegido: solo se puede reescribir con app.nick_rename, como en producción.
  CREATE FUNCTION public.guard_linked_archive() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF current_setting('app.nick_rename', true) = 'on' THEN RETURN NEW; END IF; RAISE EXCEPTION 'Los resultados vinculados archivados son inmutables'; END$$;
  CREATE TRIGGER linked_archive_guard BEFORE UPDATE ON public.archived_rounds FOR EACH ROW EXECUTE FUNCTION public.guard_linked_archive();
`;

const triggers = `
  CREATE TRIGGER guard_archived_group_write BEFORE INSERT OR DELETE OR UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION public.guard_archived_group_write();
  CREATE TRIGGER guest_player_guard BEFORE INSERT OR DELETE OR UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION public.guard_guest_player();
  CREATE TRIGGER linked_group_player_guard BEFORE INSERT OR DELETE OR UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION public.guard_linked_group_player();
  CREATE TRIGGER a_group_membership_lifecycle BEFORE INSERT OR DELETE OR UPDATE ON public.group_members FOR EACH ROW EXECUTE FUNCTION public.guard_group_membership_lifecycle();
  CREATE TRIGGER guard_archived_members BEFORE INSERT OR DELETE OR UPDATE ON public.group_members FOR EACH ROW EXECUTE FUNCTION public.guard_archived_group_write();
  CREATE TRIGGER a_registered_round_player BEFORE INSERT OR UPDATE ON public.round_players FOR EACH ROW EXECUTE FUNCTION public.guard_registered_round_player();
  CREATE TRIGGER b_guest_participation BEFORE INSERT OR DELETE OR UPDATE ON public.round_players FOR EACH ROW EXECUTE FUNCTION public.guard_guest_participation();
  CREATE TRIGGER guard_withdrawn_players BEFORE INSERT OR DELETE OR UPDATE ON public.round_players FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawn_round_data();
  CREATE TRIGGER guard_round_admin_fields BEFORE INSERT OR UPDATE ON public.golf_rounds FOR EACH ROW EXECUTE FUNCTION public.guard_round_admin_fields();
  CREATE TRIGGER linked_handicap_ledger BEFORE INSERT OR DELETE OR UPDATE ON public.handicap_adjustments FOR EACH ROW EXECUTE FUNCTION public.guard_linked_handicap_ledger();
`;

test('account deletion anonymizes results, hands groups over and reserves the nick', async () => {
  const db = new PGlite();
  const [fede, admin, member, rival, groupA, groupB] = Array.from({ length: 6 }, () => randomUUID());
  const ids = { fede, admin, member, rival };
  try {
    await db.exec(schema);
    for (const [, id] of Object.entries(ids)) await db.query('INSERT INTO auth.users VALUES ($1)', [id]);
    await db.exec(`
      INSERT INTO public.user_profiles(user_id, nick) VALUES ('${fede}', 'Fede'), ('${admin}', 'Kike'), ('${member}', 'Pepe'), ('${rival}', 'Rafa');
      INSERT INTO public.groups(id, name, user_auth_id, archived_at) VALUES ('${groupA}', 'SABADETE', '${fede}', NULL), ('${groupB}', 'TERRASSES', '${fede}', now());
      INSERT INTO public.group_members(group_id, user_id, role, invited_by) VALUES
        ('${groupA}', '${fede}', 'admin', NULL), ('${groupA}', '${admin}', 'admin', '${fede}'), ('${groupA}', '${member}', 'member', '${fede}'),
        ('${groupB}', '${fede}', 'admin', NULL), ('${groupB}', '${rival}', 'member', '${fede}');
      INSERT INTO public.players(id, group_id, name, auth_user_id) VALUES ('${fede}', '${groupA}', 'Fede', '${fede}');
      INSERT INTO public.golf_rounds(id, group_id, created_by) VALUES ('${groupA}', '${groupA}', '${fede}');
      INSERT INTO public.round_players(round_id, player_id, user_id, name) VALUES ('${groupA}', '${fede}', '${fede}', 'Fede');
      INSERT INTO public.archived_rounds(final_ranking, player_stats, hole_scores) VALUES
        (jsonb_build_array(jsonb_build_object('player_db_id', '${fede}', 'player_name', 'Fede'), jsonb_build_object('player_db_id', '${member}', 'player_name', 'Pepe')), '[]', '[]');
      INSERT INTO public.daily_rankings(player_name, game_player_id) VALUES ('Fede', '${fede}');
      INSERT INTO public.handicap_adjustments(player_id, player_name) VALUES ('${fede}', 'Fede');
      INSERT INTO public.group_invitations(group_id, invited_user_id, invited_by) VALUES ('${groupA}', '${rival}', '${fede}');
      INSERT INTO public.pro_shop_purchases(group_id, purchased_by, product_type) VALUES ('${groupA}', '${fede}', 'extra_players');
      INSERT INTO public.user_subscriptions(user_id) VALUES ('${fede}');
    `);
    await db.exec(migration);
    await db.exec(triggers);

    // Sin la marca de baja, las protecciones siguen activas.
    await assert.rejects(db.query('UPDATE public.players SET auth_user_id = NULL'), /operación autorizada/);
    await assert.rejects(db.query('DELETE FROM public.group_members WHERE user_id = $1', [fede]), /retirada de miembros/);

    // Solo el servidor puede ejecutar la baja.
    await db.query("SELECT set_config('request.uid', $1, false)", [fede]);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('SELECT public.delete_account_data($1)', [fede]), /permission denied/);
    await db.exec('RESET ROLE');

    await db.query("SELECT set_config('request.role', 'service_role', false)");
    const result = (await db.query('SELECT public.delete_account_data($1) AS r', [fede])).rows[0].r;
    assert.deepEqual(result, { groups_transferred: 1, groups_without_owner: 1 });

    // El administrador pasa a creador; el grupo sin administrador queda sin creador.
    const groups = (await db.query('SELECT id, user_auth_id FROM public.groups ORDER BY name')).rows;
    assert.equal(groups.find((g) => g.id === groupA).user_auth_id, admin);
    assert.equal(groups.find((g) => g.id === groupB).user_auth_id, null);

    // Avisos: al nuevo creador, al resto del grupo y a los miembros del grupo sin creador.
    const inbox = (await db.query('SELECT d.recipient_id, m.title FROM public.app_message_deliveries d JOIN public.app_messages m ON m.id = d.message_id ORDER BY m.title')).rows;
    assert.deepEqual(inbox.map((row) => [row.recipient_id, row.title]).sort(), [
      [admin, 'Ahora eres el creador de SABADETE'],
      [member, 'Nuevo creador en SABADETE'],
      [rival, 'TERRASSES se ha quedado sin creador'],
    ].sort());

    // Resultados conservados con el nombre marcado y sin cuenta.
    assert.deepEqual((await db.query('SELECT name, auth_user_id FROM public.players')).rows, [{ name: 'Fede*', auth_user_id: null }]);
    assert.deepEqual((await db.query('SELECT name, user_id FROM public.round_players')).rows, [{ name: 'Fede*', user_id: null }]);
    const ranking = (await db.query('SELECT final_ranking FROM public.archived_rounds')).rows[0].final_ranking;
    assert.deepEqual(ranking.map((row) => row.player_name), ['Fede*', 'Pepe']);
    assert.equal((await db.query('SELECT player_name FROM public.daily_rankings')).rows[0].player_name, 'Fede*');
    assert.equal((await db.query('SELECT player_name FROM public.handicap_adjustments')).rows[0].player_name, 'Fede*');
    assert.equal((await db.query('SELECT created_by FROM public.golf_rounds')).rows[0].created_by, null);
    assert.equal((await db.query('SELECT purchased_by FROM public.pro_shop_purchases')).rows[0].purchased_by, null);
    for (const table of ['user_profiles', 'user_subscriptions', 'group_invitations']) {
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.${table} WHERE ${table === 'group_invitations' ? 'invited_by' : 'user_id'} = $1`, [fede])).rows[0].n, 0, table);
    }
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.group_members WHERE user_id = $1', [fede])).rows[0].n, 0);

    // Nick reservado: ni disponible ni registrable.
    assert.equal((await db.query("SELECT public.is_nick_available('fede') AS ok")).rows[0].ok, false);
    await assert.rejects(db.query("INSERT INTO public.user_profiles(user_id, nick) VALUES ($1, 'FEDE')", [rival]), /no está disponible/);

    // La cuenta de acceso ya se puede borrar sin arrastrar partidas ni resultados.
    await db.query('DELETE FROM auth.users WHERE id = $1', [fede]);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.golf_rounds')).rows[0].n, 1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.round_players')).rows[0].n, 1);
  } finally {
    await db.close();
  }
});

test('application administrators cannot delete their account from the app', async () => {
  const db = new PGlite();
  const boss = randomUUID();
  try {
    await db.exec(schema);
    await db.query('INSERT INTO auth.users VALUES ($1)', [boss]);
    await db.query("INSERT INTO public.app_administrators(user_id, alias) VALUES ($1, 'boss')", [boss]);
    await db.exec(migration);
    await assert.rejects(db.query('SELECT public.delete_account_data($1)', [boss]), /administración/);
  } finally {
    await db.close();
  }
});
