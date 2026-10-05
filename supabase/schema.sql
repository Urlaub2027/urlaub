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

create schema if not exists urlaub;
revoke all on schema urlaub from public, anon, authenticated;

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
-- (Task 5 fügt hier die Umstellung von Stand 1 ein)
-- ---------------------------------------------------------------------------

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
  select array_agg(k.kw) into v_erlaubt from urlaub.kalender(p_umfrage_id) k where not k.gesperrt;
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
-- (Task 3–4 fügen hier weitere Funktionen ein)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Rechte zum Schluss
-- ---------------------------------------------------------------------------

revoke all on all tables    in schema urlaub from public, anon, authenticated;
revoke all on all functions in schema urlaub from public, anon, authenticated;
