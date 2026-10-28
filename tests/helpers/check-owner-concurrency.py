"""Isolated PostgreSQL checks. Launcher injects fixture SQL; never connects to Supabase."""
import base64
import json
import subprocess
import time

SETUP_SQL = None
LABEL = 'omiki-round-owner-security-test'
IMAGE = 'btcpayserver/postgres:18.4'
container = None


def docker(*args, **kwargs):
    return subprocess.run(['docker', *args], capture_output=True, text=True, timeout=45, **kwargs)


def checked(result):
    if result.returncode:
        raise RuntimeError(result.stderr[-2000:])
    return result.stdout.strip()


def sql(command, check=True):
    result = docker('exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'owner_test', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', input=command)
    return checked(result) if check else result


def session(command):
    return subprocess.Popen(['docker', 'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'owner_test', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def waiting_for_sleep(name):
    for _ in range(80):
        if sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='" + name + "' AND wait_event='PgSleep'") == '1':
            return
        time.sleep(.05)
    raise RuntimeError('Concurrent test session did not reach its locked checkpoint')


try:
    assert SETUP_SQL, 'Run through scripts/test-round-owner-concurrency.mjs'
    container = checked(docker('run', '--pull=never', '-d', '--network', 'none', '--memory', '512m', '--cpus', '1',
                               '--label', 'purpose=' + LABEL, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
                               '-e', 'POSTGRES_DB=owner_test', IMAGE))
    assert len(container) == 64 and all(c in '0123456789abcdef' for c in container)
    for _ in range(100):
        if docker('exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'owner_test').returncode == 0:
            break
        time.sleep(.2)
    else:
        raise RuntimeError('Temporary Postgres failed to start')
    sql(SETUP_SQL)
    secret = 'a' * 64
    headers = json.dumps({'x-omiki-express-secret': secret})
    express = "SET ROLE anon; SELECT set_config('request.headers','" + headers + "',false); "
    owner = sql("SET ROLE anon; SELECT register_express_owner('" + secret + "')").splitlines()[-1]
    insert = "INSERT INTO golf_rounds(user_id) VALUES('" + owner + "');"
    sql(express + insert * 3)
    first = session('')
    first.stdin.write("SET application_name='owner_cap_first'; BEGIN; " + express + insert + ' SELECT pg_sleep(1.5); COMMIT;')
    first.stdin.close()
    waiting_for_sleep('owner_cap_first')
    second = sql(express + insert, check=False)
    first.wait(timeout=15)
    assert first.returncode == 0, first.stderr.read()
    assert second.returncode != 0 and 'límite de 4' in second.stderr, second.stderr
    assert sql("SELECT count(*) FROM golf_rounds WHERE user_id='" + owner + "'") == '4'
    print(json.dumps({'scenario': 'concurrent_fourth_and_fifth_creation', 'passed': True}), flush=True)

    account = '00000000-0000-4000-8000-000000000001'
    creator = "SET ROLE authenticated; SELECT set_config('request.uid','" + account + "',false); "
    round_id = sql(creator + "INSERT INTO golf_rounds(user_id) VALUES('" + account + "') RETURNING id").splitlines()[-1]
    player = sql(creator + "INSERT INTO round_players(round_id) VALUES('" + round_id + "') RETURNING id").splitlines()[-1]
    teammate = sql(creator + "INSERT INTO round_players(round_id) VALUES('" + round_id + "') RETURNING id").splitlines()[-1]
    values = json.dumps({'round_id': round_id, 'player_id': player, 'hole_number': 1, 'gross_strokes': 5,
                         'strokes_received': 0, 'net_strokes': 5, 'stableford_points': 2})
    companion = json.loads(values)
    companion.update({'player_id': teammate, 'gross_strokes': 8, 'net_strokes': 8, 'mode_points': .5})
    batch = json.dumps([json.loads(values), companion])
    changed_batch = batch.replace('"gross_strokes": 5', '"gross_strokes": 3').replace('"gross_strokes": 8', '"gross_strokes": 6')
    sql(creator + "SELECT write_verified_hole_scores('" + round_id + "',1,'" + batch + "'::jsonb); SELECT finish_round('" + round_id + "',NULL);")
    first = session('')
    first.stdin.write("SET application_name='owner_archive_first'; BEGIN; " + creator + "UPDATE golf_rounds SET status='archived' WHERE id='" + round_id + "'; SELECT pg_sleep(1.5); COMMIT;")
    first.stdin.close()
    waiting_for_sleep('owner_archive_first')
    second = sql(creator + "SELECT write_verified_hole_scores('" + round_id + "',1,'" + changed_batch + "'::jsonb)", check=False)
    first.wait(timeout=15)
    assert first.returncode == 0, first.stderr.read()
    assert second.returncode != 0 and 'cerrada' in second.stderr, second.stderr
    assert sql("SELECT gross_strokes FROM round_scores WHERE player_id='" + player + "'") == '5'
    assert sql("SELECT gross_strokes FROM round_scores WHERE player_id='" + teammate + "'") == '8'
    print(json.dumps({'scenario': 'archive_blocks_inflight_score_save', 'passed': True}), flush=True)

    # With the score transaction first, archive must wait for it to commit.
    admin = "SET ROLE authenticated; SELECT set_config('request.uid','00000000-0000-4000-8000-000000000003',false); "
    sql(admin + "SELECT admin_change_app_round('" + round_id + "','reopen','Reviewed concurrency test',(SELECT updated_at FROM golf_rounds WHERE id='" + round_id + "'));")
    sql(creator + "SELECT finish_round('" + round_id + "',NULL);")
    first = session('')
    first.stdin.write("SET application_name='owner_score_first'; BEGIN; " + creator + "SELECT write_verified_hole_scores('" + round_id + "',1,'" + changed_batch + "'::jsonb); SELECT pg_sleep(1.5); COMMIT;")
    first.stdin.close()
    waiting_for_sleep('owner_score_first')
    sql(creator + "UPDATE golf_rounds SET status='archived' WHERE id='" + round_id + "';")
    first.wait(timeout=15)
    assert first.returncode == 0, first.stderr.read()
    assert sql("SELECT gross_strokes FROM round_scores WHERE player_id='" + player + "'") == '3'
    assert sql("SELECT gross_strokes FROM round_scores WHERE player_id='" + teammate + "'") == '6'
    assert sql("SELECT status FROM golf_rounds WHERE id='" + round_id + "'") == 'archived'
    print(json.dumps({'scenario': 'score_commits_before_waiting_archive', 'passed': True}), flush=True)
    print(json.dumps({'network': 'none', 'published_ports': 0, 'production_database_accessed': False}), flush=True)
finally:
    if container:
        label = checked(docker('inspect', '--format', '{{index .Config.Labels "purpose"}}', container))
        if label != LABEL:
            raise RuntimeError('Refusing cleanup of an unrelated container')
        checked(docker('rm', '-f', '-v', container))
        print(json.dumps({'temporary_container_removed': True}), flush=True)
