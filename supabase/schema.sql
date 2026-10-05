-- Urlaubswünsche – Datenbank (Stand 2: mehrere Umfragen)
--
-- Einmal komplett im Supabase SQL-Editor ausführen – bei einer neuen Installation
-- ebenso wie zur Umstellung von Stand 1 (eine Umfrage): Mitarbeiter, Codes und
-- Abgaben werden dann in Umfrage Nr. 1 übernommen. Erneutes Ausführen ist unschädlich.
--
-- ACHTUNG bei späteren Änderungen: Ändern sich die Parameter einer Funktion,
-- legt "create or replace" eine ZWEITE Funktion an; die alte bleibt mitsamt
-- ihren Rechten aufrufbar. Dann vorher die alte Fassung ausdrücklich löschen:
--   drop function if exists public.<name>(<alte Parametertypen>);
--
-- Sicherheitsprinzip: Alle Tabellen liegen im Schema "urlaub"; darauf haben die
-- Rollen anon und authenticated keinen Zugriff. Der Browser ruft nur Funktionen
-- in "public" auf:
--   urlaub_*     ohne Anmeldung, geprüft über den Code aus dem Mitarbeiter-Link
--   einladung_*  ohne Anmeldung, geprüft über den Einladungscode
--   org_*        angemeldet, nur eigene Umfragen
--   haupt_*      angemeldet, nur Hauptadmin

begin;

create schema if not exists urlaub;
revoke all on schema urlaub from public, anon, authenticated;

-- Stand 1 hatte urlaub.kalender als View; sie muss vor der gleichnamigen Funktion weg.
drop view if exists urlaub.links, urlaub.auswertung_personen, urlaub.auswertung_wochen, urlaub.kalender;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table if not exists urlaub.app (
  id         boolean primary key default true check (id),
  link_basis text not null
);

create table if not exists urlaub.organisatoren (
  user_id        uuid primary key,
  anzeigename    text not null check (btrim(anzeigename) <> ''),
  benutzername   text not null unique,
  ist_hauptadmin boolean not null default false,
  gesperrt       boolean not null default false,
  eingeladen_von uuid references urlaub.organisatoren (user_id) on delete set null,
  angelegt_am    timestamptz not null default now()
);

-- erstellt_von = null: Start-Einladung (nur per SQL), macht zum Hauptadmin.
create table if not exists urlaub.einladungen (
  code           text primary key default replace(gen_random_uuid()::text, '-', ''),
  erstellt_von   uuid references urlaub.organisatoren (user_id) on delete cascade,
  erstellt_am    timestamptz not null default now(),
  gueltig_bis    timestamptz not null default now() + interval '7 days',
  eingeloest_von uuid,
  eingeloest_am  timestamptz
);

create table if not exists urlaub.umfragen (
  id                    bigint generated always as identity primary key,
  organisator_id        uuid not null references urlaub.organisatoren (user_id) on delete cascade,
  titel                 text not null check (btrim(titel) <> ''),
  jahr                  int  not null check (jahr between 2020 and 2100),
  bundesland            text not null check (bundesland in
                          ('BW','BY','BE','BB','HB','HH','HE','MV','NI','NW','RP','SL','SN','ST','SH','TH')),
  arbeitstage_pro_woche int  not null default 6 check (arbeitstage_pro_woche in (5, 6)),
  urlaubstage           int  not null default 36 check (urlaubstage between 1 and 366),
  min_wochen            int  not null default 1,
  max_wochen            int  not null default 6,
  max_am_stueck         int  not null default 3 check (max_am_stueck between 1 and 53),
  gesperrte_monate      int[] not null default '{12}'
                        check (array_position(gesperrte_monate, null) is null
                               and 1 <= all (gesperrte_monate) and 12 >= all (gesperrte_monate)),
  sperr_hinweis         text not null default 'Im Dezember ist kein Urlaub möglich.',
  frist                 timestamptz not null,
  angelegt_am           timestamptz not null default now(),
  check (min_wochen >= 1 and min_wochen <= max_wochen and max_wochen <= 53)
);

-- Örtliche Feiertage oder Betriebsruhe: kosten keinen Urlaubstag.
create table if not exists urlaub.freie_tage (
  umfrage_id bigint not null references urlaub.umfragen (id) on delete cascade,
  datum      date   not null,
  name       text   not null check (btrim(name) <> ''),
  primary key (umfrage_id, datum)
);

-- gen_random_uuid() liefert 122 Bit Zufall aus einem kryptografischen Generator.
create table if not exists urlaub.mitarbeiter (
  id          bigint generated always as identity primary key,
  umfrage_id  bigint references urlaub.umfragen (id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  code        text not null unique
              default replace(gen_random_uuid()::text, '-', '')
              check (code ~ '^[0-9a-f]{32}$'),
  angelegt_am timestamptz not null default now()
);

create table if not exists urlaub.abgaben (
  mitarbeiter_id bigint primary key references urlaub.mitarbeiter (id) on delete cascade,
  wochen         int[] not null,
  geaendert_am   timestamptz not null default now()
);

insert into urlaub.app (link_basis) values ('https://urlaub2027.github.io/urlaub/')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Kalender und Feiertage
-- ---------------------------------------------------------------------------

-- Ostersonntag nach dem Gaußschen Algorithmus (gregorianisch).
create or replace function urlaub.ostersonntag(p_jahr int)
returns date
language plpgsql immutable
set search_path = ''
as $$
declare
  a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
begin
  a := p_jahr % 19; b := p_jahr / 100; c := p_jahr % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  return make_date(p_jahr, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end;
$$;

-- Landesweit gültige gesetzliche Feiertage. Örtliche Feiertage (z. B. Augsburger
-- Friedensfest, Mariä Himmelfahrt in Teilen Bayerns) trägt der Organisator als
-- freie Tage ein. Geprüft gegen feiertage-api.de für 2026–2030.
create or replace function urlaub.landesfeiertage(p_jahr int, p_land text)
returns table (datum date, name text)
language sql immutable
set search_path = ''
as $$
  with o as (select urlaub.ostersonntag(p_jahr) as os),
  liste (datum, name, laender) as (
              select make_date(p_jahr, 1, 1), 'Neujahr', null::text[]
    union all select make_date(p_jahr, 1, 6), 'Heilige Drei Könige', array['BW','BY','ST']
    union all select make_date(p_jahr, 3, 8), 'Internationaler Frauentag',
              case when p_jahr >= 2023 then array['BE','MV']
                   when p_jahr >= 2019 then array['BE'] else '{}'::text[] end
    union all select os - 2, 'Karfreitag', null from o
    union all select os, 'Ostersonntag', array['BB'] from o
    union all select os + 1, 'Ostermontag', null from o
    union all select make_date(p_jahr, 5, 1), 'Tag der Arbeit', null
    union all select os + 39, 'Christi Himmelfahrt', null from o
    union all select os + 49, 'Pfingstsonntag', array['BB'] from o
    union all select os + 50, 'Pfingstmontag', null from o
    union all select os + 60, 'Fronleichnam', array['BW','BY','HE','NW','RP','SL'] from o
    union all select make_date(p_jahr, 8, 15), 'Mariä Himmelfahrt', array['SL']
    union all select make_date(p_jahr, 9, 20), 'Weltkindertag',
              case when p_jahr >= 2019 then array['TH'] else '{}'::text[] end
    union all select make_date(p_jahr, 10, 3), 'Tag der Deutschen Einheit', null
    union all select make_date(p_jahr, 10, 31), 'Reformationstag',
              case when p_jahr >= 2018 then array['BB','HB','HH','MV','NI','SH','SN','ST','TH']
                   else array['BB','MV','SN','ST','TH'] end
    union all select make_date(p_jahr, 11, 1), 'Allerheiligen', array['BW','BY','NW','RP','SL']
    -- Buß- und Bettag: Mittwoch vor dem 23. November
    union all select make_date(p_jahr, 11, 22) - ((extract(isodow from make_date(p_jahr, 11, 22))::int + 4) % 7),
              'Buß- und Bettag', array['SN']
    union all select make_date(p_jahr, 12, 25), '1. Weihnachtstag', null
    union all select make_date(p_jahr, 12, 26), '2. Weihnachtstag', null
    -- einmalige Feiertage
    union all select e.d, e.n, array['BE']
              from (values (date '2020-05-08', 'Tag der Befreiung'),
                           (date '2025-05-08', 'Tag der Befreiung'),
                           (date '2028-06-17', '75. Jahrestag des 17. Juni 1953')) e (d, n)
              where extract(year from e.d) = p_jahr
  )
  select datum, name from liste
  where laender is null or p_land = any (laender)
  order by datum
$$;

-- Kalenderwochen einer Umfrage nach ISO 8601. Eine Woche gehört zum Monat ihres
-- Donnerstags. Arbeitstage = Arbeitstage pro Woche minus freie Tage auf diesen Tagen.
create or replace function urlaub.kalender(p_umfrage_id bigint)
returns table (kw int, montag date, sonntag date, monat int, arbeitstage int, feiertag text, gesperrt boolean)
language sql stable
set search_path = ''
as $$
  with u as (
    select u.*,
           make_date(u.jahr, 1, 4) - (extract(isodow from make_date(u.jahr, 1, 4))::int - 1) as montag1,
           extract(week from make_date(u.jahr, 12, 28))::int as anzahl
    from urlaub.umfragen u where u.id = p_umfrage_id
  ),
  frei as (
    select l.datum, l.name from u, generate_series(u.jahr - 1, u.jahr + 1) j (jahr),
         urlaub.landesfeiertage(j.jahr, u.bundesland) l
    union
    select f.datum, f.name from urlaub.freie_tage f where f.umfrage_id = p_umfrage_id
  ),
  w as (
    select u.arbeitstage_pro_woche, u.gesperrte_monate, g.kw, u.montag1 + (g.kw - 1) * 7 as montag
    from u, generate_series(1, u.anzahl) as g (kw)
  )
  select w.kw,
         w.montag,
         w.montag + 6,
         extract(month from w.montag + 3)::int,
         w.arbeitstage_pro_woche - count(distinct f.datum)::int,
         string_agg(distinct f.name, ', ' order by f.name),
         extract(month from w.montag + 3)::int = any (w.gesperrte_monate)
  from w
  left join frei f on f.datum between w.montag and w.montag + (w.arbeitstage_pro_woche - 1)
  group by w.kw, w.montag, w.arbeitstage_pro_woche, w.gesperrte_monate
  order by w.kw
$$;

create or replace function urlaub.kalender_json(p_umfrage_id bigint)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'kw',          k.kw,
           'von',         to_char(k.montag,  'DD.MM.'),
           'bis',         to_char(k.sonntag, 'DD.MM.'),
           'monat',       k.monat,
           'arbeitstage', k.arbeitstage,
           'feiertag',    k.feiertag,
           'gesperrt',    k.gesperrt) order by k.kw), '[]'::jsonb)
  from urlaub.kalender(p_umfrage_id) k
$$;

-- ---------------------------------------------------------------------------
-- Umstellung von Stand 1 (eine Umfrage). Läuft nur, solange es die alte
-- Tabelle urlaub.einstellungen noch gibt.
-- ---------------------------------------------------------------------------

do $$
declare
  v_umfrage bigint;
  v_doppelt text;
begin
  if to_regclass('urlaub.einstellungen') is null then
    return;
  end if;

  select string_agg(n, ', ') into v_doppelt from (
    select min(name) as n from urlaub.mitarbeiter
    group by lower(name) having count(*) > 1) d;
  if v_doppelt is not null then
    raise exception 'UMSTELLUNG abgebrochen: Mitarbeiter mit gleichem Namen (nur Groß-/Kleinschreibung verschieden): %. Bitte vorher umbenennen.', v_doppelt;
  end if;

  alter table urlaub.mitarbeiter add column if not exists umfrage_id bigint
    references urlaub.umfragen (id) on delete cascade;

  insert into urlaub.app (link_basis)
  select link_basis from urlaub.einstellungen
  on conflict (id) do update set link_basis = excluded.link_basis;

  insert into urlaub.organisatoren (user_id, anzeigename, benutzername, ist_hauptadmin)
  select a.user_id, coalesce(nullif(btrim(a.notiz), ''), 'Admin'), split_part(u.email, '@', 1), true
  from urlaub.admins a join auth.users u on u.id = a.user_id
  on conflict (user_id) do nothing;

  if not exists (select 1 from urlaub.organisatoren) then
    raise exception 'UMSTELLUNG abgebrochen: kein Admin in urlaub.admins gefunden.';
  end if;

  insert into urlaub.umfragen (organisator_id, titel, jahr, bundesland, arbeitstage_pro_woche,
                               urlaubstage, max_wochen, max_am_stueck, gesperrte_monate,
                               sperr_hinweis, frist)
  select (select user_id from urlaub.organisatoren order by angelegt_am, user_id limit 1),
         'Urlaubswünsche 2027', 2027, 'BY', 6, e.urlaubstage, e.max_wochen, 3, '{12}',
         e.dezember_hinweis, e.frist
  from urlaub.einstellungen e
  returning id into v_umfrage;

  -- Feiertage aus Stand 1, die keine landesweiten Feiertage sind, bleiben als freie Tage erhalten.
  insert into urlaub.freie_tage (umfrage_id, datum, name)
  select v_umfrage, f.datum, f.name
  from urlaub.feiertage f
  where extract(year from f.datum) = 2027
    and not exists (select 1 from urlaub.landesfeiertage(2027, 'BY') l where l.datum = f.datum)
  on conflict do nothing;

  update urlaub.mitarbeiter set umfrage_id = v_umfrage where umfrage_id is null;

  drop function if exists public.admin_uebersicht();
  drop function if exists public.admin_mitarbeiter_anlegen(text);
  drop function if exists public.admin_mitarbeiter_loeschen(bigint);
  drop function if exists public.admin_link_erneuern(bigint);
  drop function if exists public.admin_einstellungen_speichern(text, text);
  drop function if exists urlaub.pruefe_admin();
  drop table urlaub.einstellungen, urlaub.feiertage, urlaub.admins;
  alter table urlaub.mitarbeiter drop constraint if exists mitarbeiter_name_key;
  alter table urlaub.abgaben drop constraint if exists abgaben_wochen_check;
end;
$$;

-- ---------------------------------------------------------------------------
-- Nacharbeiten an Tabellen (neu und umgestellt)
-- ---------------------------------------------------------------------------

alter table urlaub.mitarbeiter alter column umfrage_id set not null;
create unique index if not exists mitarbeiter_name_je_umfrage on urlaub.mitarbeiter (umfrage_id, lower(name));

do $$
begin
  if not exists (select 1 from pg_constraint
                   where conname = 'abgaben_wochen_gueltig' and conrelid = 'urlaub.abgaben'::regclass) then
    alter table urlaub.abgaben add constraint abgaben_wochen_gueltig
      check (cardinality(wochen) >= 1 and array_position(wochen, null) is null
             and 1 <= all (wochen) and 53 >= all (wochen));
  end if;
end;
$$;

alter table urlaub.app           enable row level security;
alter table urlaub.organisatoren enable row level security;
alter table urlaub.einladungen   enable row level security;
alter table urlaub.umfragen      enable row level security;
alter table urlaub.freie_tage    enable row level security;
alter table urlaub.mitarbeiter   enable row level security;
alter table urlaub.abgaben       enable row level security;

-- ---------------------------------------------------------------------------
-- Regeln und Mitarbeiter-Funktionen
-- ---------------------------------------------------------------------------

-- Erster Regelverstoß einer Auswahl als Fehlercode, sonst null.
create or replace function urlaub.regelverstoss(p_umfrage_id bigint, p_wochen int[])
returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v_u       urlaub.umfragen;
  v_erlaubt int[];
  v_wochen  int[];
  v_stueck  int;
  v_tage    int;
begin
  select * into strict v_u from urlaub.umfragen where id = p_umfrage_id;
  if p_wochen is null or cardinality(p_wochen) = 0 then
    return 'KEINE_WOCHE';
  end if;
  select coalesce(array_agg(k.kw), '{}') into v_erlaubt from urlaub.kalender(p_umfrage_id) k where not k.gesperrt;
  if exists (select 1 from unnest(p_wochen) x where x is null or not (x = any (v_erlaubt))) then
    return 'UNGUELTIGE_WOCHE';
  end if;
  select array_agg(distinct x order by x) into v_wochen from unnest(p_wochen) x;
  if cardinality(v_wochen) <> cardinality(p_wochen) then
    return 'DOPPELTE_WOCHE';
  end if;
  if cardinality(v_wochen) < v_u.min_wochen then
    return 'ZU_WENIGE_WOCHEN';
  end if;
  if cardinality(v_wochen) > v_u.max_wochen then
    return 'ZU_VIELE_WOCHEN';
  end if;
  -- längste Folge aufeinanderfolgender KWs
  select max(n) into v_stueck
  from (select count(*) as n
        from (select x - row_number() over (order by x) as gruppe from unnest(v_wochen) x) s
        group by gruppe) t;
  if v_stueck > v_u.max_am_stueck then
    return 'ZU_VIELE_AM_STUECK';
  end if;
  select sum(k.arbeitstage) into v_tage from urlaub.kalender(p_umfrage_id) k where k.kw = any (v_wochen);
  if v_tage > v_u.urlaubstage then
    return 'ZU_VIELE_TAGE';
  end if;
  return null;
end;
$$;

-- Antwort an die Mitarbeiter-Seite: nur Daten dieser Person und ihrer Umfrage.
create or replace function urlaub.antwort(p_mitarbeiter_id bigint)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'name',                  m.name,
    'titel',                 u.titel,
    'jahr',                  u.jahr,
    'wochen',                coalesce(to_jsonb(a.wochen), '[]'::jsonb),
    'geaendert_am',          a.geaendert_am,
    'frist',                 u.frist,
    'offen',                 now() < u.frist,
    'min_wochen',            u.min_wochen,
    'max_wochen',            u.max_wochen,
    'max_am_stueck',         u.max_am_stueck,
    'urlaubstage',           u.urlaubstage,
    'arbeitstage_pro_woche', u.arbeitstage_pro_woche,
    'sperr_hinweis',         u.sperr_hinweis,
    'kalender',              urlaub.kalender_json(u.id))
  from urlaub.mitarbeiter m
  join urlaub.umfragen u on u.id = m.umfrage_id
  left join urlaub.abgaben a on a.mitarbeiter_id = m.id
  where m.id = p_mitarbeiter_id
$$;

create or replace function public.urlaub_laden(p_code text)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  select id into v_id from urlaub.mitarbeiter where code = p_code;
  if v_id is null then
    raise exception 'LINK_UNGUELTIG';
  end if;
  return urlaub.antwort(v_id);
end;
$$;

create or replace function public.urlaub_speichern(p_code text, p_wochen int[])
returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_m      urlaub.mitarbeiter;
  v_frist  timestamptz;
  v_fehler text;
  v_wochen int[];
begin
  select * into v_m from urlaub.mitarbeiter where code = p_code;
  if not found then
    raise exception 'LINK_UNGUELTIG';
  end if;
  select frist into v_frist from urlaub.umfragen where id = v_m.umfrage_id;
  if now() >= v_frist then
    raise exception 'FRIST_ABGELAUFEN';
  end if;
  v_fehler := urlaub.regelverstoss(v_m.umfrage_id, p_wochen);
  if v_fehler is not null then
    raise exception '%', v_fehler;
  end if;
  select array_agg(x order by x) into v_wochen from unnest(p_wochen) x;
  insert into urlaub.abgaben (mitarbeiter_id, wochen, geaendert_am)
  values (v_m.id, v_wochen, now())
  on conflict (mitarbeiter_id)
  do update set wochen = excluded.wochen, geaendert_am = excluded.geaendert_am;
  return urlaub.antwort(v_m.id);
end;
$$;

revoke all on function public.urlaub_laden(text)            from public, anon, authenticated;
revoke all on function public.urlaub_speichern(text, int[]) from public, anon, authenticated;
grant execute on function public.urlaub_laden(text)            to anon;
grant execute on function public.urlaub_speichern(text, int[]) to anon;

-- ---------------------------------------------------------------------------
-- Organisatoren: Hilfsfunktionen (intern)
-- ---------------------------------------------------------------------------

create or replace function urlaub.ich()
returns urlaub.organisatoren
language plpgsql stable
set search_path = ''
as $$
declare
  v_o urlaub.organisatoren;
begin
  select * into v_o from urlaub.organisatoren where user_id = auth.uid() and not gesperrt;
  if not found then
    raise exception 'KEIN_ZUGRIFF';
  end if;
  return v_o;
end;
$$;

-- Fremde und nicht vorhandene Umfragen sind bewusst nicht unterscheidbar.
create or replace function urlaub.eigene_umfrage(p_umfrage_id bigint)
returns urlaub.umfragen
language plpgsql stable
set search_path = ''
as $$
declare
  v_uid uuid := (urlaub.ich()).user_id;
  v_u   urlaub.umfragen;
begin
  select * into v_u from urlaub.umfragen where id = p_umfrage_id and organisator_id = v_uid;
  if not found then
    raise exception 'UMFRAGE_NICHT_GEFUNDEN';
  end if;
  return v_u;
end;
$$;

create or replace function urlaub.eigener_mitarbeiter(p_mitarbeiter_id bigint)
returns urlaub.mitarbeiter
language plpgsql stable
set search_path = ''
as $$
declare
  v_uid uuid := (urlaub.ich()).user_id;
  v_m   urlaub.mitarbeiter;
begin
  select m.* into v_m
  from urlaub.mitarbeiter m join urlaub.umfragen u on u.id = m.umfrage_id
  where m.id = p_mitarbeiter_id and u.organisator_id = v_uid;
  if not found then
    raise exception 'MITARBEITER_NICHT_GEFUNDEN';
  end if;
  return v_m;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organisatoren: Funktionen für die Verwaltung
-- ---------------------------------------------------------------------------

create or replace function public.org_ich()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_o urlaub.organisatoren := urlaub.ich();
begin
  return jsonb_build_object('anzeigename', v_o.anzeigename, 'benutzername', v_o.benutzername,
                            'ist_hauptadmin', v_o.ist_hauptadmin);
end;
$$;

create or replace function public.org_umfragen()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (urlaub.ich()).user_id;
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',          u.id,
             'titel',       u.titel,
             'jahr',        u.jahr,
             'bundesland',  u.bundesland,
             'frist',       u.frist,
             'offen',       now() < u.frist,
             'mitarbeiter', (select count(*) from urlaub.mitarbeiter m where m.umfrage_id = u.id),
             'abgegeben',   (select count(*) from urlaub.mitarbeiter m
                               join urlaub.abgaben a on a.mitarbeiter_id = m.id where m.umfrage_id = u.id))
           order by u.jahr desc, u.titel)
    from urlaub.umfragen u where u.organisator_id = v_uid), '[]'::jsonb);
end;
$$;

-- Vorgabe-Frist: 30.11. des Vorjahres, 23:59:59 deutscher Zeit.
create or replace function public.org_umfrage_anlegen(p_titel text, p_jahr int, p_bundesland text)
returns bigint
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (urlaub.ich()).user_id;
  v_id  bigint;
begin
  if p_titel is null or btrim(p_titel) = '' then
    raise exception 'TITEL_LEER';
  end if;
  begin
    insert into urlaub.umfragen (organisator_id, titel, jahr, bundesland, frist)
    values (v_uid, btrim(p_titel), p_jahr, p_bundesland,
            make_timestamp(p_jahr - 1, 11, 30, 23, 59, 59) at time zone 'Europe/Berlin')
    returning id into v_id;
  exception when check_violation or not_null_violation or data_exception then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end;
  return v_id;
end;
$$;

create or replace function public.org_umfrage_loeschen(p_umfrage_id bigint)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
begin
  delete from urlaub.umfragen where id = v_u.id;
end;
$$;

create or replace function public.org_umfrage(p_umfrage_id bigint)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_u     urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
  v_basis text := (select link_basis from urlaub.app);
begin
  return jsonb_build_object(
    'einstellungen', jsonb_build_object(
      'id',                    v_u.id,
      'titel',                 v_u.titel,
      'jahr',                  v_u.jahr,
      'bundesland',            v_u.bundesland,
      'arbeitstage_pro_woche', v_u.arbeitstage_pro_woche,
      'urlaubstage',           v_u.urlaubstage,
      'min_wochen',            v_u.min_wochen,
      'max_wochen',            v_u.max_wochen,
      'max_am_stueck',         v_u.max_am_stueck,
      'gesperrte_monate',      to_jsonb(v_u.gesperrte_monate),
      'sperr_hinweis',         v_u.sperr_hinweis,
      'frist',                 v_u.frist,
      'frist_eingabe',         to_char(v_u.frist at time zone 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI'),
      'offen',                 now() < v_u.frist,
      'grunddaten_aenderbar',  not exists (select 1 from urlaub.mitarbeiter m
                                            join urlaub.abgaben a on a.mitarbeiter_id = m.id
                                            where m.umfrage_id = v_u.id)),
    'freie_tage', coalesce((
      select jsonb_agg(jsonb_build_object('datum', f.datum, 'name', f.name) order by f.datum)
      from urlaub.freie_tage f where f.umfrage_id = v_u.id), '[]'::jsonb),
    'mitarbeiter', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',            m.id,
               'name',          m.name,
               'link',          v_basis || '#' || m.code,
               'wochen',        coalesce(to_jsonb(a.wochen), '[]'::jsonb),
               'urlaubstage',   (select coalesce(sum(k.arbeitstage), 0)::int
                                   from urlaub.kalender(v_u.id) k where k.kw = any (a.wochen)),
               'geaendert_am',  a.geaendert_am,
               'regelverstoss', case when a.wochen is null then null
                                     else urlaub.regelverstoss(v_u.id, a.wochen) end)
             order by m.name)
      from urlaub.mitarbeiter m
      left join urlaub.abgaben a on a.mitarbeiter_id = m.id
      where m.umfrage_id = v_u.id), '[]'::jsonb),
    'kalender', urlaub.kalender_json(v_u.id));
end;
$$;

-- Die Besitzprüfung (declare-Block) liegt bewusst außerhalb des inneren
-- exception-Blocks, damit UMFRAGE_NICHT_GEFUNDEN nicht umgewandelt wird.
create or replace function public.org_umfrage_speichern(p_umfrage_id bigint, p_daten jsonb)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u      urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
  v_frist  text := btrim(p_daten ->> 'frist');
  v_monate int[];
begin
  if exists (select 1 from urlaub.mitarbeiter m join urlaub.abgaben a on a.mitarbeiter_id = m.id
             where m.umfrage_id = v_u.id)
     and (   (p_daten ? 'jahr'       and (p_daten ->> 'jahr') is distinct from v_u.jahr::text)
          or (p_daten ? 'bundesland' and (p_daten ->> 'bundesland') is distinct from v_u.bundesland)
          or (p_daten ? 'arbeitstage_pro_woche'
              and (p_daten ->> 'arbeitstage_pro_woche') is distinct from v_u.arbeitstage_pro_woche::text)) then
    raise exception 'GRUNDDATEN_GESPERRT';
  end if;
  if p_daten ? 'frist' and (v_frist is null or v_frist = '') then
    raise exception 'FRIST_LEER';
  end if;
  if lower(coalesce(v_frist, '')) in ('infinity', '-infinity', '+infinity') then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end if;
  begin
    if p_daten ? 'gesperrte_monate' then
      select coalesce(array_agg(x::int order by x::int), '{}')
      into v_monate from jsonb_array_elements_text(p_daten -> 'gesperrte_monate') x;
    end if;
    update urlaub.umfragen set
      titel                 = coalesce(btrim(p_daten ->> 'titel'), titel),
      jahr                  = coalesce((p_daten ->> 'jahr')::int, jahr),
      bundesland            = coalesce(p_daten ->> 'bundesland', bundesland),
      arbeitstage_pro_woche = coalesce((p_daten ->> 'arbeitstage_pro_woche')::int, arbeitstage_pro_woche),
      urlaubstage           = coalesce((p_daten ->> 'urlaubstage')::int, urlaubstage),
      min_wochen            = coalesce((p_daten ->> 'min_wochen')::int, min_wochen),
      max_wochen            = coalesce((p_daten ->> 'max_wochen')::int, max_wochen),
      max_am_stueck         = coalesce((p_daten ->> 'max_am_stueck')::int, max_am_stueck),
      gesperrte_monate      = coalesce(v_monate, gesperrte_monate),
      sperr_hinweis         = coalesce(btrim(p_daten ->> 'sperr_hinweis'), sperr_hinweis),
      frist = case
                when v_frist is null
                  or to_char(frist at time zone 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI') = v_frist
                then case
                       -- Jahr gewechselt, Frist noch auf dem alten Standard: mit dem Jahr mitziehen
                       when (p_daten ->> 'jahr') is not null
                        and (p_daten ->> 'jahr')::int <> v_u.jahr
                        and frist = make_timestamp(v_u.jahr - 1, 11, 30, 23, 59, 59) at time zone 'Europe/Berlin'
                       then make_timestamp((p_daten ->> 'jahr')::int - 1, 11, 30, 23, 59, 59) at time zone 'Europe/Berlin'
                       else frist
                     end
                else v_frist::timestamp at time zone 'Europe/Berlin'
              end
    where id = v_u.id;
  exception when check_violation or not_null_violation or data_exception then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end;
end;
$$;

create or replace function public.org_freien_tag_hinzufuegen(p_umfrage_id bigint, p_datum date, p_name text)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
begin
  if p_datum is null or extract(year from p_datum) <> v_u.jahr then
    raise exception 'DATUM_FALSCHES_JAHR';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_LEER';
  end if;
  insert into urlaub.freie_tage (umfrage_id, datum, name) values (v_u.id, p_datum, btrim(p_name))
  on conflict (umfrage_id, datum) do update set name = excluded.name;
end;
$$;

create or replace function public.org_freien_tag_entfernen(p_umfrage_id bigint, p_datum date)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
begin
  delete from urlaub.freie_tage where umfrage_id = v_u.id and datum = p_datum;
end;
$$;

create or replace function public.org_mitarbeiter_anlegen(p_umfrage_id bigint, p_name text)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_LEER';
  end if;
  if exists (select 1 from urlaub.mitarbeiter
             where umfrage_id = v_u.id and lower(name) = lower(btrim(p_name))) then
    raise exception 'NAME_DOPPELT';
  end if;
  insert into urlaub.mitarbeiter (umfrage_id, name) values (v_u.id, btrim(p_name));
end;
$$;

create or replace function public.org_mitarbeiter_loeschen(p_mitarbeiter_id bigint)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_m urlaub.mitarbeiter := urlaub.eigener_mitarbeiter(p_mitarbeiter_id);
begin
  delete from urlaub.mitarbeiter where id = v_m.id;  -- Abgabe wird mitgelöscht
end;
$$;

-- Neuer Code: der alte Link funktioniert sofort nicht mehr, die Abgabe bleibt.
create or replace function public.org_link_erneuern(p_mitarbeiter_id bigint)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_m urlaub.mitarbeiter := urlaub.eigener_mitarbeiter(p_mitarbeiter_id);
begin
  update urlaub.mitarbeiter set code = replace(gen_random_uuid()::text, '-', '') where id = v_m.id;
end;
$$;

revoke all on function public.org_ich()                                        from public, anon, authenticated;
revoke all on function public.org_umfragen()                                   from public, anon, authenticated;
revoke all on function public.org_umfrage_anlegen(text, int, text)             from public, anon, authenticated;
revoke all on function public.org_umfrage_loeschen(bigint)                     from public, anon, authenticated;
revoke all on function public.org_umfrage(bigint)                              from public, anon, authenticated;
revoke all on function public.org_umfrage_speichern(bigint, jsonb)             from public, anon, authenticated;
revoke all on function public.org_freien_tag_hinzufuegen(bigint, date, text)   from public, anon, authenticated;
revoke all on function public.org_freien_tag_entfernen(bigint, date)           from public, anon, authenticated;
revoke all on function public.org_mitarbeiter_anlegen(bigint, text)            from public, anon, authenticated;
revoke all on function public.org_mitarbeiter_loeschen(bigint)                 from public, anon, authenticated;
revoke all on function public.org_link_erneuern(bigint)                        from public, anon, authenticated;
grant execute on function public.org_ich()                                      to authenticated;
grant execute on function public.org_umfragen()                                 to authenticated;
grant execute on function public.org_umfrage_anlegen(text, int, text)           to authenticated;
grant execute on function public.org_umfrage_loeschen(bigint)                   to authenticated;
grant execute on function public.org_umfrage(bigint)                            to authenticated;
grant execute on function public.org_umfrage_speichern(bigint, jsonb)           to authenticated;
grant execute on function public.org_freien_tag_hinzufuegen(bigint, date, text) to authenticated;
grant execute on function public.org_freien_tag_entfernen(bigint, date)         to authenticated;
grant execute on function public.org_mitarbeiter_anlegen(bigint, text)          to authenticated;
grant execute on function public.org_mitarbeiter_loeschen(bigint)               to authenticated;
grant execute on function public.org_link_erneuern(bigint)                      to authenticated;

-- ---------------------------------------------------------------------------
-- Einladungen und Registrierung
-- ---------------------------------------------------------------------------

-- Gültig: vorhanden, nicht eingelöst, nicht abgelaufen, Einladender nicht gesperrt.
create or replace function urlaub.einladung_gueltig(p_code text)
returns urlaub.einladungen
language sql stable
set search_path = ''
as $$
  select e.* from urlaub.einladungen e
  left join urlaub.organisatoren o on o.user_id = e.erstellt_von
  where e.code = p_code
    and e.eingeloest_von is null
    and e.gueltig_bis > now()
    and (e.erstellt_von is null or not o.gesperrt)
$$;

-- Läuft bei jedem neuen Konto (auch /auth/v1/signup). Ohne gültige Einladung
-- schlägt das Anlegen des Kontos fehl.
create or replace function urlaub.neuer_benutzer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := new.raw_user_meta_data ->> 'einladung';
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'anzeigename', ''));
  v_e    urlaub.einladungen;
begin
  if v_code is null then
    raise exception 'EINLADUNG_FEHLT';
  end if;
  perform 1 from urlaub.einladungen where code = v_code for update;  -- gleichzeitiges Einlösen verhindern
  v_e := urlaub.einladung_gueltig(v_code);
  if v_e.code is null then
    raise exception 'EINLADUNG_UNGUELTIG';
  end if;
  if v_name = '' then
    raise exception 'NAME_LEER';
  end if;
  update urlaub.einladungen set eingeloest_von = new.id, eingeloest_am = now() where code = v_code;
  insert into urlaub.organisatoren (user_id, anzeigename, benutzername, ist_hauptadmin, eingeladen_von)
  values (new.id, v_name, split_part(new.email, '@', 1), v_e.erstellt_von is null, v_e.erstellt_von);
  return new;
end;
$$;

-- Kein drop trigger: auf auth.users fehlt im SQL-Editor die Eigentümerschaft.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_trigger
                 where tgname = 'urlaub_neuer_benutzer' and tgrelid = 'auth.users'::pg_catalog.regclass) then
    create trigger urlaub_neuer_benutzer
      after insert on auth.users
      for each row execute function urlaub.neuer_benutzer();
  end if;
end;
$$;

-- Nur für eine Neuinstallation im SQL-Editor: Link für das erste Konto (Hauptadmin).
create or replace function urlaub.start_einladung()
returns text
language sql volatile
set search_path = ''
as $$
  insert into urlaub.einladungen (erstellt_von) values (null)
  returning (select link_basis from urlaub.app) || 'admin.html#einladung=' || code
$$;

create or replace function public.einladung_pruefen(p_code text)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_e urlaub.einladungen := urlaub.einladung_gueltig(p_code);
begin
  if v_e.code is null then
    return jsonb_build_object('gueltig', false, 'eingeladen_von', null);
  end if;
  return jsonb_build_object('gueltig', true, 'eingeladen_von',
    coalesce((select anzeigename from urlaub.organisatoren where user_id = v_e.erstellt_von), 'Hauptadmin'));
end;
$$;

create or replace function public.org_einladung_erstellen()
returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o urlaub.organisatoren := urlaub.ich();
  v_e urlaub.einladungen;
begin
  insert into urlaub.einladungen (erstellt_von) values (v_o.user_id) returning * into v_e;
  return jsonb_build_object(
    'code',        v_e.code,
    'link',        (select link_basis from urlaub.app) || 'admin.html#einladung=' || v_e.code,
    'gueltig_bis', v_e.gueltig_bis);
end;
$$;

-- ---------------------------------------------------------------------------
-- Hauptadmin
-- ---------------------------------------------------------------------------

create or replace function urlaub.hauptadmin()
returns urlaub.organisatoren
language plpgsql stable
set search_path = ''
as $$
declare
  v_o urlaub.organisatoren := urlaub.ich();
begin
  if not v_o.ist_hauptadmin then
    raise exception 'KEIN_ZUGRIFF';
  end if;
  return v_o;
end;
$$;

-- Bewusst ohne Inhalte fremder Umfragen: nur Name, Status, Anzahl.
create or replace function public.haupt_organisatoren()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_o urlaub.organisatoren := urlaub.hauptadmin();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id',         o.user_id,
             'anzeigename',     o.anzeigename,
             'benutzername',    o.benutzername,
             'ist_hauptadmin',  o.ist_hauptadmin,
             'gesperrt',        o.gesperrt,
             'eingeladen_von',  v.anzeigename,
             'angelegt_am',     o.angelegt_am,
             'anzahl_umfragen', (select count(*) from urlaub.umfragen u where u.organisator_id = o.user_id),
             'ich',             o.user_id = v_o.user_id)
           order by o.anzeigename)
    from urlaub.organisatoren o
    left join urlaub.organisatoren v on v.user_id = o.eingeladen_von), '[]'::jsonb);
end;
$$;

create or replace function public.haupt_sperren(p_user_id uuid, p_gesperrt boolean)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o urlaub.organisatoren := urlaub.hauptadmin();
begin
  if p_user_id = v_o.user_id then
    raise exception 'NICHT_SELBST';
  end if;
  if coalesce(p_gesperrt, false)
     and exists (select 1 from urlaub.organisatoren where user_id = p_user_id and ist_hauptadmin) then
    raise exception 'HAUPTADMIN_NICHT_SPERRBAR';
  end if;
  update urlaub.organisatoren set gesperrt = coalesce(p_gesperrt, gesperrt) where user_id = p_user_id;
  if not found then
    raise exception 'NICHT_GEFUNDEN';
  end if;
end;
$$;

revoke all on function public.einladung_pruefen(text)              from public, anon, authenticated;
revoke all on function public.org_einladung_erstellen()            from public, anon, authenticated;
revoke all on function public.haupt_organisatoren()                from public, anon, authenticated;
revoke all on function public.haupt_sperren(uuid, boolean)         from public, anon, authenticated;
grant execute on function public.einladung_pruefen(text)           to anon, authenticated;
grant execute on function public.org_einladung_erstellen()         to authenticated;
grant execute on function public.haupt_organisatoren()             to authenticated;
grant execute on function public.haupt_sperren(uuid, boolean)      to authenticated;

-- ---------------------------------------------------------------------------
-- Rechte zum Schluss
-- ---------------------------------------------------------------------------

revoke all on all tables    in schema urlaub from public, anon, authenticated;
revoke all on all functions in schema urlaub from public, anon, authenticated;

commit;
