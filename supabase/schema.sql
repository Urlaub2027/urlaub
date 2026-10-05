-- Urlaubswünsche – Datenbank (Stand 3: Fragen-Baukasten)
--
-- Einmal komplett im Supabase SQL-Editor ausführen – bei einer neuen Installation
-- ebenso wie zur Umstellung von Stand 2: jede Umfrage erhält eine Frage
-- „Urlaubswochen“ mit ihren bisherigen Einstellungen; Mitarbeiter, Codes und
-- Abgaben bleiben erhalten. Erneutes Ausführen ist unschädlich.
--
-- ACHTUNG bei späteren Änderungen: Ändern sich die Parameter einer Funktion,
-- legt "create or replace" eine ZWEITE Funktion an; die alte bleibt mitsamt
-- ihren Rechten aufrufbar. Dann vorher die alte Fassung ausdrücklich löschen:
--   drop function if exists public.<name>(<alte Parametertypen>);
--
-- Sicherheitsprinzip: Alle Tabellen liegen im Schema "urlaub"; darauf haben die
-- Rollen anon und authenticated keinen Zugriff. Der Browser ruft nur Funktionen
-- in "public" auf:
--   urlaub_*, umfrage_absenden
--                ohne Anmeldung, geprüft über den Code aus dem Mitarbeiter-Link
--   einladung_*  ohne Anmeldung, geprüft über den Einladungscode
--   org_*        angemeldet, nur eigene Umfragen
--   haupt_*      angemeldet, nur Hauptadmin

begin;

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
  id             bigint generated always as identity primary key,
  organisator_id uuid not null references urlaub.organisatoren (user_id) on delete cascade,
  titel          text not null check (btrim(titel) <> ''),
  frist          timestamptz not null,
  angelegt_am    timestamptz not null default now()
);

-- Örtliche Feiertage oder Betriebsruhe: kosten keinen Urlaubstag.
create table if not exists urlaub.freie_tage (
  umfrage_id bigint not null references urlaub.umfragen (id) on delete cascade,
  datum      date   not null,
  name       text   not null check (btrim(name) <> ''),
  primary key (umfrage_id, datum)
);

create table if not exists urlaub.fragen (
  id                    bigint generated always as identity primary key,
  umfrage_id            bigint not null references urlaub.umfragen (id) on delete cascade,
  position              int not null,
  typ                   text not null check (typ in ('urlaubswochen', 'einfach', 'mehrfach', 'janein', 'skala',
                                                     'text_kurz', 'text_lang', 'zahl', 'datum', 'hinweis')),
  text                  text not null check (btrim(text) <> ''),
  hilfetext             text not null default '',
  aktiv                 boolean not null default true,
  verknuepfung          text not null default 'und' check (verknuepfung in ('und', 'oder')),
  -- nur Urlaubswochen
  jahr                  int check (jahr between 2020 and 2100),
  bundesland            text check (bundesland in
                          ('BW','BY','BE','BB','HB','HH','HE','MV','NI','NW','RP','SL','SN','ST','SH','TH')),
  arbeitstage_pro_woche int check (arbeitstage_pro_woche in (5, 6)),
  sperr_hinweis         text,
  -- nur Skala
  skala_von             int,
  skala_bis             int,
  skala_links           text,
  skala_rechts          text,
  check (typ <> 'urlaubswochen'
         or (jahr is not null and bundesland is not null and arbeitstage_pro_woche is not null and sperr_hinweis is not null)),
  check (typ <> 'skala'
         or (skala_von is not null and skala_bis is not null and skala_von < skala_bis and skala_bis - skala_von <= 10))
);
create unique index if not exists fragen_eine_urlaubswochen on urlaub.fragen (umfrage_id) where typ = 'urlaubswochen';
create index if not exists fragen_umfrage on urlaub.fragen (umfrage_id, position);

create table if not exists urlaub.optionen (
  id       bigint generated always as identity primary key,
  frage_id bigint not null references urlaub.fragen (id) on delete cascade,
  position int not null,
  text     text not null check (btrim(text) <> ''),
  aktiv    boolean not null default true
);
create index if not exists optionen_frage on urlaub.optionen (frage_id, position);

-- Höchstens eine Regel je Art und Frage. wert: null (pflicht), Zahl, Datum-Text oder Monatsliste.
create table if not exists urlaub.regeln (
  id       bigint generated always as identity primary key,
  frage_id bigint not null references urlaub.fragen (id) on delete cascade,
  art      text not null check (art in ('pflicht', 'min_anzahl', 'max_anzahl', 'max_zeichen', 'min_zahl', 'max_zahl',
                                        'fruehestens', 'spaetestens', 'min_wochen', 'max_wochen', 'max_am_stueck',
                                        'max_urlaubstage', 'gesperrte_monate', 'gesperrte_wochen')),
  wert     jsonb not null default 'null',
  aktiv    boolean not null default true,
  unique (frage_id, art)
);
-- Bestehende Installationen: Prüfung um 'gesperrte_wochen' erweitern (idempotent).
alter table urlaub.regeln drop constraint if exists regeln_art_check;
alter table urlaub.regeln add constraint regeln_art_check check (art in (
  'pflicht', 'min_anzahl', 'max_anzahl', 'max_zeichen', 'min_zahl', 'max_zahl', 'fruehestens', 'spaetestens',
  'min_wochen', 'max_wochen', 'max_am_stueck', 'max_urlaubstage', 'gesperrte_monate', 'gesperrte_wochen'));

-- Sichtbarkeits-Bedingung: frage_id = Zielfrage, quelle_id = frühere Frage.
-- quelle_id ohne "on delete": eine verwendete Quellfrage ist nicht löschbar.
create table if not exists urlaub.bedingungen (
  id        bigint generated always as identity primary key,
  frage_id  bigint not null references urlaub.fragen (id) on delete cascade,
  quelle_id bigint not null references urlaub.fragen (id) deferrable initially deferred,
  operator  text not null check (operator in ('ist_eine_von', 'ist_keine_von', 'enthaelt_eine_von',
                                              'enthaelt_keine_von', 'ist', 'gleich', 'groesser', 'kleiner')),
  werte     jsonb not null,
  aktiv     boolean not null default true
);
create index if not exists bedingungen_frage on urlaub.bedingungen (frage_id);
create index if not exists bedingungen_quelle on urlaub.bedingungen (quelle_id);

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
  geaendert_am   timestamptz not null default now()
);

-- frage_id ohne "on delete": eine beantwortete Frage ist nicht löschbar.
create table if not exists urlaub.antworten (
  mitarbeiter_id bigint not null references urlaub.mitarbeiter (id) on delete cascade,
  frage_id       bigint not null references urlaub.fragen (id) deferrable initially deferred,
  wert           jsonb not null,
  primary key (mitarbeiter_id, frage_id)
);
create index if not exists antworten_frage on urlaub.antworten (frage_id);

-- option_id ohne "on delete": eine gewählte Antwortmöglichkeit ist nicht löschbar.
create table if not exists urlaub.antwort_optionen (
  mitarbeiter_id bigint not null,
  frage_id       bigint not null,
  option_id      bigint not null references urlaub.optionen (id) deferrable initially deferred,
  primary key (mitarbeiter_id, option_id),
  foreign key (mitarbeiter_id, frage_id) references urlaub.antworten (mitarbeiter_id, frage_id) on delete cascade
);
create index if not exists antwort_optionen_option on urlaub.antwort_optionen (option_id);

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

-- Die Urlaubswochen-Frage einer Umfrage (höchstens eine), sonst eine Zeile mit lauter null.
create or replace function urlaub.urlaubsfrage(p_umfrage_id bigint)
returns urlaub.fragen
language sql stable
set search_path = ''
as $$
  select f.* from urlaub.fragen f where f.umfrage_id = p_umfrage_id and f.typ = 'urlaubswochen'
$$;

-- Kalenderwochen der Urlaubswochen-Frage nach ISO 8601. Eine Woche gehört zum Monat ihres
-- Donnerstags. Gesperrt ist ein Monat nur, wenn die Regel "gesperrte_monate" eingeschaltet ist.
create or replace function urlaub.kalender(p_umfrage_id bigint)
returns table (kw int, montag date, sonntag date, monat int, arbeitstage int, feiertag text, gesperrt boolean)
language sql stable
set search_path = ''
as $$
  with f as (
    select f.* from urlaub.fragen f where f.umfrage_id = p_umfrage_id and f.typ = 'urlaubswochen'
  ),
  u as (
    select f.jahr, f.bundesland, f.arbeitstage_pro_woche,
           coalesce((select array(select jsonb_array_elements_text(r.wert)::int)
                     from urlaub.regeln r
                     where r.frage_id = f.id and r.art = 'gesperrte_monate' and r.aktiv
                       and jsonb_typeof(r.wert) = 'array'), '{}'::int[]) as gesperrte_monate,
           coalesce((select array(select jsonb_array_elements_text(r.wert)::int)
                     from urlaub.regeln r
                     where r.frage_id = f.id and r.art = 'gesperrte_wochen' and r.aktiv
                       and jsonb_typeof(r.wert) = 'array'), '{}'::int[]) as gesperrte_wochen,
           make_date(f.jahr, 1, 4) - (extract(isodow from make_date(f.jahr, 1, 4))::int - 1) as montag1,
           extract(week from make_date(f.jahr, 12, 28))::int as anzahl
    from f
  ),
  frei as (
    select l.datum, l.name from u, generate_series(u.jahr - 1, u.jahr + 1) j (jahr),
         urlaub.landesfeiertage(j.jahr, u.bundesland) l
    union
    select fr.datum, fr.name from urlaub.freie_tage fr where fr.umfrage_id = p_umfrage_id
  ),
  w as (
    select u.arbeitstage_pro_woche, u.gesperrte_monate, u.gesperrte_wochen, g.kw, u.montag1 + (g.kw - 1) * 7 as montag
    from u, generate_series(1, u.anzahl) as g (kw)
  )
  select w.kw,
         w.montag,
         w.montag + 6,
         extract(month from w.montag + 3)::int,
         w.arbeitstage_pro_woche - count(distinct fr.datum)::int,
         string_agg(distinct fr.name, ', ' order by fr.name),
         (extract(month from w.montag + 3)::int = any (w.gesperrte_monate) or w.kw = any (w.gesperrte_wochen))
  from w
  left join frei fr on fr.datum between w.montag and w.montag + (w.arbeitstage_pro_woche - 1)
  group by w.kw, w.montag, w.arbeitstage_pro_woche, w.gesperrte_monate, w.gesperrte_wochen
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

-- Standard-Frage "Urlaubswochen" mit den bisherigen Vorgaben als eingeschaltete Regeln.
create or replace function urlaub.standard_urlaubsfrage(p_umfrage_id bigint, p_jahr int, p_bundesland text)
returns bigint
language plpgsql volatile
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into urlaub.fragen (umfrage_id, position, typ, text, jahr, bundesland, arbeitstage_pro_woche, sperr_hinweis)
  values (p_umfrage_id,
          coalesce((select max(position) from urlaub.fragen where umfrage_id = p_umfrage_id), 0) + 1,
          'urlaubswochen', 'In welchen Wochen möchtest du Urlaub nehmen?',
          p_jahr, p_bundesland, 6, 'Im Dezember ist kein Urlaub möglich.')
  returning id into v_id;
  insert into urlaub.regeln (frage_id, art, wert) values
    (v_id, 'pflicht', 'null'), (v_id, 'min_wochen', '1'), (v_id, 'max_wochen', '6'),
    (v_id, 'max_am_stueck', '3'), (v_id, 'max_urlaubstage', '36'), (v_id, 'gesperrte_monate', '[12]');
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Umstellung von Stand 2 (Wochen-Einstellungen in urlaub.umfragen). Läuft nur,
-- solange urlaub.umfragen noch die Spalte "jahr" hat.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'urlaub' and table_name = 'umfragen' and column_name = 'jahr') then
    return;
  end if;

  insert into urlaub.fragen (umfrage_id, position, typ, text, jahr, bundesland, arbeitstage_pro_woche, sperr_hinweis)
  select u.id, 1, 'urlaubswochen', 'In welchen Wochen möchtest du Urlaub nehmen?',
         u.jahr, u.bundesland, u.arbeitstage_pro_woche, u.sperr_hinweis
  from urlaub.umfragen u
  where not exists (select 1 from urlaub.fragen f where f.umfrage_id = u.id and f.typ = 'urlaubswochen');

  insert into urlaub.regeln (frage_id, art, wert, aktiv)
  select f.id, x.art, x.wert, true
  from urlaub.fragen f
  join urlaub.umfragen u on u.id = f.umfrage_id
  cross join lateral (values
    ('pflicht',          'null'::jsonb),
    ('min_wochen',       to_jsonb(u.min_wochen)),
    ('max_wochen',       to_jsonb(u.max_wochen)),
    ('max_am_stueck',    to_jsonb(u.max_am_stueck)),
    ('max_urlaubstage',  to_jsonb(u.urlaubstage)),
    ('gesperrte_monate', to_jsonb(u.gesperrte_monate))) as x (art, wert)
  where f.typ = 'urlaubswochen'
  on conflict (frage_id, art) do nothing;

  insert into urlaub.antworten (mitarbeiter_id, frage_id, wert)
  select a.mitarbeiter_id, f.id, to_jsonb(a.wochen)
  from urlaub.abgaben a
  join urlaub.mitarbeiter m on m.id = a.mitarbeiter_id
  join urlaub.fragen f on f.umfrage_id = m.umfrage_id and f.typ = 'urlaubswochen'
  on conflict do nothing;

  alter table urlaub.abgaben drop constraint if exists abgaben_wochen_gueltig;
  alter table urlaub.abgaben drop column if exists wochen;
  alter table urlaub.umfragen
    drop column jahr, drop column bundesland, drop column arbeitstage_pro_woche, drop column urlaubstage,
    drop column min_wochen, drop column max_wochen, drop column max_am_stueck, drop column gesperrte_monate,
    drop column sperr_hinweis;

  drop function if exists public.urlaub_speichern(text, int[]);
  drop function if exists urlaub.regelverstoss(bigint, int[]);
  drop function if exists urlaub.antwort(bigint);
end;
$$;

-- Die aufgeschobenen Fremdschlüssel der übernommenen Zeilen jetzt prüfen; sonst sperren sie
-- die folgenden ALTER TABLE in dieser Transaktion ("pending trigger events").
set constraints all immediate;

-- ---------------------------------------------------------------------------
-- Nacharbeiten an Tabellen (neu und umgestellt)
-- ---------------------------------------------------------------------------

alter table urlaub.mitarbeiter alter column umfrage_id set not null;
create unique index if not exists mitarbeiter_name_je_umfrage on urlaub.mitarbeiter (umfrage_id, lower(name));

alter table urlaub.app           enable row level security;
alter table urlaub.organisatoren enable row level security;
alter table urlaub.einladungen   enable row level security;
alter table urlaub.umfragen      enable row level security;
alter table urlaub.freie_tage    enable row level security;
alter table urlaub.mitarbeiter   enable row level security;
alter table urlaub.abgaben       enable row level security;
alter table urlaub.fragen           enable row level security;
alter table urlaub.optionen         enable row level security;
alter table urlaub.regeln           enable row level security;
alter table urlaub.bedingungen      enable row level security;
alter table urlaub.antworten        enable row level security;
alter table urlaub.antwort_optionen enable row level security;

-- ---------------------------------------------------------------------------
-- Mitarbeiter-Funktionen: Antworten prüfen und absenden
-- ---------------------------------------------------------------------------

-- Stand 2 → 3: alte Wochen-Funktionen entfernen (auch bei Neuinstallation harmlos).
drop function if exists public.urlaub_speichern(text, int[]);
drop function if exists urlaub.regelverstoss(bigint, int[]);
drop function if exists urlaub.antwort(bigint);

-- Entfernt Leerraum (Leerzeichen, Tabs, Zeilenumbrüche) an beiden Enden; btrim() kennt nur Leerzeichen.
create or replace function urlaub.trim_alles(p_text text)
returns text
language sql immutable
set search_path = ''
as $$
  select regexp_replace(p_text, '^\s+|\s+$', '', 'g')
$$;

-- Leer = nicht beantwortet: fehlt, JSON-null, leere Liste, leerer Text.
create or replace function urlaub.ist_leer(p_wert jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_wert is null
      or jsonb_typeof(p_wert) = 'null'
      or (jsonb_typeof(p_wert) = 'array' and jsonb_array_length(p_wert) = 0)
      or (jsonb_typeof(p_wert) = 'string' and urlaub.trim_alles(p_wert #>> '{}') = '')
$$;

-- Bedingung erfüllt? Es zählen nur bereits geprüfte Antworten (p_gueltig) von Fragen,
-- die selbst sichtbar sind (p_sichtbar). Unbeantwortet oder unsichtbar = nicht erfüllt.
create or replace function urlaub.bedingung_erfuellt(p_b urlaub.bedingungen, p_gueltig jsonb, p_sichtbar bigint[])
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  v jsonb := p_gueltig -> p_b.quelle_id::text;
begin
  if not (p_b.quelle_id = any (p_sichtbar)) or urlaub.ist_leer(v) then
    return false;
  end if;
  if p_b.operator in ('enthaelt_eine_von', 'enthaelt_keine_von') and jsonb_typeof(v) <> 'array' then
    return false;
  end if;
  if p_b.operator in ('gleich', 'groesser', 'kleiner')
     and (jsonb_typeof(v) <> 'number' or jsonb_typeof(p_b.werte) <> 'number') then
    return false;
  end if;
  return case p_b.operator
    when 'ist_eine_von'       then jsonb_typeof(p_b.werte) = 'array' and p_b.werte @> jsonb_build_array(v)
    when 'ist_keine_von'      then jsonb_typeof(p_b.werte) = 'array' and not (p_b.werte @> jsonb_build_array(v))
    when 'enthaelt_eine_von'  then exists (select 1 from jsonb_array_elements(v) e where p_b.werte @> jsonb_build_array(e))
    when 'enthaelt_keine_von' then not exists (select 1 from jsonb_array_elements(v) e where p_b.werte @> jsonb_build_array(e))
    when 'ist'                then v = p_b.werte
    when 'gleich'             then (v #>> '{}')::numeric = (p_b.werte #>> '{}')::numeric
    when 'groesser'           then (v #>> '{}')::numeric > (p_b.werte #>> '{}')::numeric
    when 'kleiner'            then (v #>> '{}')::numeric < (p_b.werte #>> '{}')::numeric
    else false
  end;
end;
$$;

-- Wochenregeln der Urlaubswochen-Frage; nur eingeschaltete Regeln zählen.
create or replace function urlaub.wochen_verstoss(p_frage urlaub.fragen, p_wochen jsonb)
returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v_regel   jsonb := (select coalesce(jsonb_object_agg(r.art, r.wert), '{}'::jsonb)
                      from urlaub.regeln r where r.frage_id = p_frage.id and r.aktiv);
  v_liste   int[];
  v_erlaubt int[];
  v_stueck  int;
  v_tage    int;
begin
  if jsonb_typeof(p_wochen) <> 'array'
     or exists (select 1 from jsonb_array_elements(p_wochen) e
                where jsonb_typeof(e) <> 'number'
                   or abs((e #>> '{}')::numeric) > 100
                   or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric)) then
    return 'UNGUELTIGE_WOCHE';
  end if;
  select array_agg(((e #>> '{}')::numeric)::int) into v_liste from jsonb_array_elements(p_wochen) e;
  select coalesce(array_agg(k.kw), '{}') into v_erlaubt from urlaub.kalender(p_frage.umfrage_id) k where not k.gesperrt;
  if exists (select 1 from unnest(v_liste) x where not (x = any (v_erlaubt))) then
    return 'UNGUELTIGE_WOCHE';
  end if;
  if (select count(distinct x) from unnest(v_liste) x) <> cardinality(v_liste) then
    return 'DOPPELTE_WOCHE';
  end if;
  if v_regel ? 'min_wochen' and cardinality(v_liste) < (v_regel ->> 'min_wochen')::int then
    return 'ZU_WENIGE_WOCHEN';
  end if;
  if v_regel ? 'max_wochen' and cardinality(v_liste) > (v_regel ->> 'max_wochen')::int then
    return 'ZU_VIELE_WOCHEN';
  end if;
  if v_regel ? 'max_am_stueck' then
    select max(n) into v_stueck
    from (select count(*) as n
          from (select x - row_number() over (order by x) as gruppe from unnest(v_liste) x) s
          group by gruppe) t;
    if v_stueck > (v_regel ->> 'max_am_stueck')::int then
      return 'ZU_VIELE_AM_STUECK';
    end if;
  end if;
  if v_regel ? 'max_urlaubstage' then
    select coalesce(sum(k.arbeitstage), 0) into v_tage from urlaub.kalender(p_frage.umfrage_id) k where k.kw = any (v_liste);
    if v_tage > (v_regel ->> 'max_urlaubstage')::int then
      return 'ZU_VIELE_TAGE';
    end if;
  end if;
  return null;
end;
$$;

-- Erster Verstoß einer (nicht leeren) Antwort gegen Typ und eingeschaltete Regeln, sonst null.
create or replace function urlaub.antwort_verstoss(p_frage urlaub.fragen, p_wert jsonb)
returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v_regel jsonb := (select coalesce(jsonb_object_agg(r.art, r.wert), '{}'::jsonb)
                    from urlaub.regeln r where r.frage_id = p_frage.id and r.aktiv);
  v_typ   text := jsonb_typeof(p_wert);
  v_zahl  numeric;
  v_text  text;
  v_datum date;
begin
  case p_frage.typ
  when 'urlaubswochen' then
    return urlaub.wochen_verstoss(p_frage, p_wert);
  when 'einfach' then
    if v_typ <> 'number' or not exists (select 1 from urlaub.optionen o
         where o.frage_id = p_frage.id and o.aktiv and o.id::numeric = (p_wert #>> '{}')::numeric) then
      return 'UNGUELTIGE_ANTWORT';
    end if;
  when 'mehrfach' then
    if v_typ <> 'array'
       or exists (select 1 from jsonb_array_elements(p_wert) e
                  where jsonb_typeof(e) <> 'number'
                     or not exists (select 1 from urlaub.optionen o
                                    where o.frage_id = p_frage.id and o.aktiv and o.id::numeric = (e #>> '{}')::numeric))
       or (select count(distinct (e #>> '{}')::numeric) from jsonb_array_elements(p_wert) e) <> jsonb_array_length(p_wert) then
      return 'UNGUELTIGE_ANTWORT';
    end if;
    if v_regel ? 'min_anzahl' and jsonb_array_length(p_wert) < (v_regel ->> 'min_anzahl')::int then
      return 'ZU_WENIGE_ANTWORTEN';
    end if;
    if v_regel ? 'max_anzahl' and jsonb_array_length(p_wert) > (v_regel ->> 'max_anzahl')::int then
      return 'ZU_VIELE_ANTWORTEN';
    end if;
  when 'janein' then
    if v_typ <> 'boolean' then
      return 'UNGUELTIGE_ANTWORT';
    end if;
  when 'skala' then
    if v_typ <> 'number' then
      return 'UNGUELTIGE_ANTWORT';
    end if;
    v_zahl := (p_wert #>> '{}')::numeric;
    if v_zahl <> trunc(v_zahl) or v_zahl < p_frage.skala_von or v_zahl > p_frage.skala_bis then
      return 'UNGUELTIGE_ANTWORT';
    end if;
  when 'zahl' then
    if v_typ <> 'number' then
      return 'UNGUELTIGE_ANTWORT';
    end if;
    v_zahl := (p_wert #>> '{}')::numeric;
    if abs(v_zahl) >= 1e12 then
      return 'UNGUELTIGE_ANTWORT';
    end if;
    if v_regel ? 'min_zahl' and v_zahl < (v_regel ->> 'min_zahl')::numeric then
      return 'ZAHL_ZU_KLEIN';
    end if;
    if v_regel ? 'max_zahl' and v_zahl > (v_regel ->> 'max_zahl')::numeric then
      return 'ZAHL_ZU_GROSS';
    end if;
  when 'text_kurz', 'text_lang' then
    if v_typ <> 'string' then
      return 'UNGUELTIGE_ANTWORT';
    end if;
    v_text := urlaub.trim_alles(p_wert #>> '{}');
    if char_length(v_text) > (case p_frage.typ when 'text_kurz' then 200 else 5000 end)
       or (v_regel ? 'max_zeichen' and char_length(v_text) > (v_regel ->> 'max_zeichen')::int) then
      return 'TEXT_ZU_LANG';
    end if;
  when 'datum' then
    if v_typ <> 'string' or (p_wert #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
      return 'UNGUELTIGE_ANTWORT';
    end if;
    begin
      v_datum := (p_wert #>> '{}')::date;
    exception when data_exception then
      return 'UNGUELTIGE_ANTWORT';
    end;
    if v_regel ? 'fruehestens' and v_datum < (v_regel ->> 'fruehestens')::date then
      return 'DATUM_ZU_FRUEH';
    end if;
    if v_regel ? 'spaetestens' and v_datum > (v_regel ->> 'spaetestens')::date then
      return 'DATUM_ZU_SPAET';
    end if;
  else
    return null;
  end case;
  return null;
end;
$$;

-- Gespeicherte Form: Listen sortiert, Options-IDs ganzzahlig, Texte getrimmt.
create or replace function urlaub.antwort_normalisiert(p_frage urlaub.fragen, p_wert jsonb)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select case
    when p_frage.typ in ('urlaubswochen', 'mehrfach') then
      (select jsonb_agg(to_jsonb(((e #>> '{}')::numeric)::bigint) order by (e #>> '{}')::numeric)
       from jsonb_array_elements(p_wert) e)
    when p_frage.typ = 'einfach' then to_jsonb(((p_wert #>> '{}')::numeric)::bigint)
    when p_frage.typ in ('text_kurz', 'text_lang') then to_jsonb(urlaub.trim_alles(p_wert #>> '{}'))
    else p_wert
  end
$$;

-- Prüft alle Antworten einer Abgabe in Fragenreihenfolge. Nur eingeschaltete Fragen;
-- Sichtbarkeit aus den bereits geprüften Antworten früherer Fragen.
create or replace function urlaub.pruefe_antworten(p_umfrage_id bigint, p_antworten jsonb)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_f        urlaub.fragen;
  v_eingabe  jsonb := case when jsonb_typeof(p_antworten) = 'object' then p_antworten else '{}'::jsonb end;
  v_wert     jsonb;
  v_code     text;
  v_gueltig  jsonb := '{}';
  v_fehler   jsonb := '{}';
  v_sichtbar bigint[] := '{}';
  v_anzahl   int;
  v_erfuellt boolean;
begin
  for v_f in select * from urlaub.fragen where umfrage_id = p_umfrage_id and aktiv order by position, id loop
    select count(*),
           case v_f.verknuepfung
             when 'oder' then bool_or(urlaub.bedingung_erfuellt(b, v_gueltig, v_sichtbar))
             else bool_and(urlaub.bedingung_erfuellt(b, v_gueltig, v_sichtbar))
           end
      into v_anzahl, v_erfuellt
      from urlaub.bedingungen b where b.frage_id = v_f.id and b.aktiv;
    if v_anzahl > 0 and not v_erfuellt then
      continue;
    end if;
    v_sichtbar := v_sichtbar || v_f.id;
    if v_f.typ = 'hinweis' then
      continue;
    end if;
    v_wert := v_eingabe -> v_f.id::text;
    if urlaub.ist_leer(v_wert) then
      if exists (select 1 from urlaub.regeln r where r.frage_id = v_f.id and r.art = 'pflicht' and r.aktiv) then
        v_fehler := v_fehler || jsonb_build_object(v_f.id::text, 'PFLICHT');
      end if;
      continue;
    end if;
    v_code := urlaub.antwort_verstoss(v_f, v_wert);
    if v_code is null then
      v_gueltig := v_gueltig || jsonb_build_object(v_f.id::text, urlaub.antwort_normalisiert(v_f, v_wert));
    else
      v_fehler := v_fehler || jsonb_build_object(v_f.id::text, v_code);
    end if;
  end loop;
  return jsonb_build_object('sichtbar', to_jsonb(v_sichtbar), 'antworten', v_gueltig, 'fehler', v_fehler);
end;
$$;

-- Eine Frage als JSON. p_alles=false: Mitarbeiter-Sicht (nur Eingeschaltetes);
-- p_alles=true: Verwaltungs-Sicht (alles mit Schaltern und Hinweis auf vorhandene Antworten).
create or replace function urlaub.frage_json(p_f urlaub.fragen, p_alles boolean)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id',           p_f.id,
    'typ',          p_f.typ,
    'text',         p_f.text,
    'hilfetext',    p_f.hilfetext,
    'position',     p_f.position,
    'verknuepfung', p_f.verknuepfung,
    'optionen', coalesce((
      select jsonb_agg(case when p_alles
                         then jsonb_build_object('id', o.id, 'text', o.text, 'aktiv', o.aktiv, 'position', o.position,
                                'hat_antworten', exists (select 1 from urlaub.antwort_optionen ao where ao.option_id = o.id))
                         else jsonb_build_object('id', o.id, 'text', o.text) end
                       order by o.position, o.id)
      from urlaub.optionen o where o.frage_id = p_f.id and (p_alles or o.aktiv)), '[]'::jsonb),
    'regeln', case when p_alles
      then coalesce((select jsonb_object_agg(r.art, jsonb_build_object('wert', r.wert, 'aktiv', r.aktiv))
                     from urlaub.regeln r where r.frage_id = p_f.id), '{}'::jsonb)
      else coalesce((select jsonb_object_agg(r.art, r.wert)
                     from urlaub.regeln r where r.frage_id = p_f.id and r.aktiv), '{}'::jsonb) end,
    'bedingungen', coalesce((
      select jsonb_agg(case when p_alles
                         then jsonb_build_object('id', b.id, 'quelle_id', b.quelle_id, 'operator', b.operator,
                                                 'werte', b.werte, 'aktiv', b.aktiv)
                         else jsonb_build_object('quelle_id', b.quelle_id, 'operator', b.operator, 'werte', b.werte) end
                       order by b.id)
      from urlaub.bedingungen b where b.frage_id = p_f.id and (p_alles or b.aktiv)), '[]'::jsonb),
    'skala', case when p_f.typ = 'skala'
      then jsonb_build_object('von', p_f.skala_von, 'bis', p_f.skala_bis, 'links', p_f.skala_links, 'rechts', p_f.skala_rechts) end,
    'urlaubswochen', case when p_f.typ = 'urlaubswochen'
      then jsonb_build_object('jahr', p_f.jahr, 'bundesland', p_f.bundesland,
                              'arbeitstage_pro_woche', p_f.arbeitstage_pro_woche, 'sperr_hinweis', p_f.sperr_hinweis,
                              'kalender', urlaub.kalender_json(p_f.umfrage_id)) end)
  || case when p_alles
       then jsonb_build_object('aktiv', p_f.aktiv,
                               'hat_antworten', exists (select 1 from urlaub.antworten an where an.frage_id = p_f.id))
       else '{}'::jsonb end
$$;

-- Daten für die Mitarbeiter-Seite: nur diese Person, nur eingeschaltete Fragen.
create or replace function urlaub.formular(p_mitarbeiter_id bigint)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'name',         m.name,
    'titel',        u.titel,
    'frist',        u.frist,
    'offen',        now() < u.frist,
    'geaendert_am', a.geaendert_am,
    'fragen', coalesce((select jsonb_agg(urlaub.frage_json(f, false) order by f.position, f.id)
                        from urlaub.fragen f where f.umfrage_id = u.id and f.aktiv), '[]'::jsonb),
    -- Gespeicherte Antworten ohne inzwischen ausgeschaltete Optionen.
    'antworten', coalesce((select jsonb_object_agg(x.frage_id::text, x.wert)
                           from (select an.frage_id,
                                        case f.typ
                                          when 'einfach' then
                                            case when exists (select 1 from urlaub.optionen o
                                                              where o.id = (an.wert #>> '{}')::bigint and o.aktiv)
                                                 then an.wert end
                                          when 'mehrfach' then
                                            (select jsonb_agg(e order by (e #>> '{}')::numeric)
                                             from jsonb_array_elements(an.wert) e
                                             where exists (select 1 from urlaub.optionen o
                                                           where o.id = (e #>> '{}')::bigint and o.aktiv))
                                          else an.wert
                                        end as wert
                                 from urlaub.antworten an
                                 join urlaub.fragen f on f.id = an.frage_id and f.aktiv
                                 where an.mitarbeiter_id = m.id) x
                           where x.wert is not null), '{}'::jsonb))
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
  return urlaub.formular(v_id);
end;
$$;

-- Prüft alle Antworten; bei Fehlern wird nichts gespeichert (detail = Fehler je Frage).
-- Sonst ersetzt die Abgabe die bisherigen Antworten dieser Person auf eingeschaltete
-- Fragen (auch durch Bedingungen verborgene). Antworten auf ausgeschaltete Fragen
-- bleiben erhalten und sind nach dem Wiedereinschalten wieder da.
create or replace function public.umfrage_absenden(p_code text, p_antworten jsonb)
returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_m     urlaub.mitarbeiter;
  v_frist timestamptz;
  v_r     jsonb;
  v_id    text;
  v_wert  jsonb;
  v_typ   text;
begin
  -- Erst die Umfrage-Zeile teilen (Editor-Änderungen wie Typ- oder Jahreswechsel sperren
  -- sie for update und warten so auf die Abgabe bzw. umgekehrt), dann die Person sperren.
  -- Diese Reihenfolge entspricht dem Löschen einer Umfrage (Umfrage, dann per Kaskade
  -- ihre Mitarbeiter) und vermeidet so eine gegenseitige Blockade.
  select * into v_m from urlaub.mitarbeiter where code = p_code;
  if not found then
    raise exception 'LINK_UNGUELTIG';
  end if;
  perform 1 from urlaub.umfragen where id = v_m.umfrage_id for share;
  -- Neu lesen: Link kann inzwischen erneuert oder die Person gelöscht worden sein.
  select * into v_m from urlaub.mitarbeiter where code = p_code for update;
  if not found then
    raise exception 'LINK_UNGUELTIG';
  end if;
  select frist into v_frist from urlaub.umfragen where id = v_m.umfrage_id;
  if now() >= v_frist then
    raise exception 'FRIST_ABGELAUFEN';
  end if;
  v_r := urlaub.pruefe_antworten(v_m.umfrage_id, p_antworten);
  if v_r -> 'fehler' <> '{}'::jsonb then
    raise exception 'ANTWORTEN_UNGUELTIG' using detail = (v_r -> 'fehler')::text;
  end if;
  -- antwort_optionen folgen per "on delete cascade".
  delete from urlaub.antworten an using urlaub.fragen f
  where an.mitarbeiter_id = v_m.id and f.id = an.frage_id and f.aktiv;
  for v_id, v_wert in select key, value from jsonb_each(v_r -> 'antworten') loop
    insert into urlaub.antworten (mitarbeiter_id, frage_id, wert) values (v_m.id, v_id::bigint, v_wert);
    select typ into v_typ from urlaub.fragen where id = v_id::bigint;
    if v_typ = 'einfach' then
      insert into urlaub.antwort_optionen (mitarbeiter_id, frage_id, option_id)
      values (v_m.id, v_id::bigint, (v_wert #>> '{}')::bigint);
    elsif v_typ = 'mehrfach' then
      insert into urlaub.antwort_optionen (mitarbeiter_id, frage_id, option_id)
      select v_m.id, v_id::bigint, (e #>> '{}')::bigint from jsonb_array_elements(v_wert) e;
    end if;
  end loop;
  insert into urlaub.abgaben (mitarbeiter_id, geaendert_am) values (v_m.id, now())
  on conflict (mitarbeiter_id) do update set geaendert_am = excluded.geaendert_am;
  return urlaub.formular(v_m.id);
end;
$$;

revoke all on function public.urlaub_laden(text)             from public, anon, authenticated;
revoke all on function public.umfrage_absenden(text, jsonb)  from public, anon, authenticated;
grant execute on function public.urlaub_laden(text)            to anon;
grant execute on function public.umfrage_absenden(text, jsonb) to anon;

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
             'jahr',        (select f.jahr from urlaub.fragen f where f.umfrage_id = u.id and f.typ = 'urlaubswochen'),
             'bundesland',  (select f.bundesland from urlaub.fragen f where f.umfrage_id = u.id and f.typ = 'urlaubswochen'),
             'frist',       u.frist,
             'offen',       now() < u.frist,
             'mitarbeiter', (select count(*) from urlaub.mitarbeiter m where m.umfrage_id = u.id),
             'abgegeben',   (select count(*) from urlaub.mitarbeiter m
                               join urlaub.abgaben a on a.mitarbeiter_id = m.id where m.umfrage_id = u.id))
           order by (select f.jahr from urlaub.fragen f where f.umfrage_id = u.id and f.typ = 'urlaubswochen') desc nulls last, u.titel)
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
    insert into urlaub.umfragen (organisator_id, titel, frist)
    values (v_uid, btrim(p_titel), make_timestamp(p_jahr - 1, 11, 30, 23, 59, 59) at time zone 'Europe/Berlin')
    returning id into v_id;
    perform urlaub.standard_urlaubsfrage(v_id, p_jahr, p_bundesland);
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
      'id',            v_u.id,
      'titel',         v_u.titel,
      'frist',         v_u.frist,
      'frist_eingabe', to_char(v_u.frist at time zone 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI'),
      'offen',         now() < v_u.frist),
    'freie_tage', coalesce((
      select jsonb_agg(jsonb_build_object('datum', f.datum, 'name', f.name) order by f.datum)
      from urlaub.freie_tage f where f.umfrage_id = v_u.id), '[]'::jsonb),
    'fragen', coalesce((
      select jsonb_agg(urlaub.frage_json(f, true) order by f.position, f.id)
      from urlaub.fragen f where f.umfrage_id = v_u.id), '[]'::jsonb),
    -- verstoesse: gespeicherte Antworten gegen die heutigen Fragen und Regeln geprüft
    -- (z. B. nach einer nachträglich verschärften Regel); ohne Abgabe leer.
    'mitarbeiter', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           x.id,
               'name',         x.name,
               'link',         v_basis || '#' || x.code,
               'geaendert_am', x.geaendert_am,
               'antworten',    x.antworten,
               'verstoesse',   case when x.geaendert_am is null then '{}'::jsonb
                                    else urlaub.pruefe_antworten(v_u.id, x.antworten) -> 'fehler' end)
             order by x.name)
      from (select m.id, m.name, m.code, a.geaendert_am,
                   coalesce((select jsonb_object_agg(an.frage_id::text, an.wert)
                             from urlaub.antworten an where an.mitarbeiter_id = m.id), '{}'::jsonb) as antworten
            from urlaub.mitarbeiter m
            left join urlaub.abgaben a on a.mitarbeiter_id = m.id
            where m.umfrage_id = v_u.id) x), '[]'::jsonb),
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
  v_u     urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
  v_frist text := btrim(p_daten ->> 'frist');
begin
  if p_daten ? 'frist' and (v_frist is null or v_frist = '') then
    raise exception 'FRIST_LEER';
  end if;
  if lower(coalesce(v_frist, '')) in ('infinity', '-infinity', '+infinity') then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end if;
  begin
    update urlaub.umfragen set
      titel = coalesce(btrim(p_daten ->> 'titel'), titel),
      frist = case
                when v_frist is null
                  or to_char(frist at time zone 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI') = v_frist
                then frist
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
  if p_datum is null
     or ((urlaub.urlaubsfrage(v_u.id)).jahr is not null
         and extract(year from p_datum) <> (urlaub.urlaubsfrage(v_u.id)).jahr) then
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
-- Fragen-Editor (Organisatoren)
-- ---------------------------------------------------------------------------
--
-- Gemeinsame Regeln: Besitz wird im declare-Block geprüft (fremde und nicht
-- vorhandene Objekte sind nicht unterscheidbar). Strukturänderungen sperren die
-- Umfrage-Zeile (for update), damit gleichzeitige Änderungen an Reihenfolge,
-- Bedingungen und Löschungen einander nicht überholen.
-- Die Schutz-Fremdschlüssel (antworten.frage_id, antwort_optionen.option_id,
-- bedingungen.quelle_id) sind aufgeschoben und greifen erst beim Commit; darum
-- prüfen die Löschfunktionen HAT_ANTWORTEN und BEDINGUNG_VERWEIST vorher selbst.

create or replace function urlaub.eigene_frage(p_frage_id bigint)
returns urlaub.fragen
language plpgsql stable
set search_path = ''
as $$
declare
  v_uid uuid := (urlaub.ich()).user_id;
  v_f   urlaub.fragen;
begin
  select f.* into v_f
  from urlaub.fragen f join urlaub.umfragen u on u.id = f.umfrage_id
  where f.id = p_frage_id and u.organisator_id = v_uid;
  if not found then
    raise exception 'FRAGE_NICHT_GEFUNDEN';
  end if;
  return v_f;
end;
$$;

create or replace function urlaub.eigene_option(p_option_id bigint)
returns urlaub.optionen
language plpgsql stable
set search_path = ''
as $$
declare
  v_uid uuid := (urlaub.ich()).user_id;
  v_o   urlaub.optionen;
begin
  select o.* into v_o
  from urlaub.optionen o
  join urlaub.fragen f on f.id = o.frage_id
  join urlaub.umfragen u on u.id = f.umfrage_id
  where o.id = p_option_id and u.organisator_id = v_uid;
  if not found then
    raise exception 'OPTION_NICHT_GEFUNDEN';
  end if;
  return v_o;
end;
$$;

create or replace function urlaub.eigene_bedingung(p_bedingung_id bigint)
returns urlaub.bedingungen
language plpgsql stable
set search_path = ''
as $$
declare
  v_uid uuid := (urlaub.ich()).user_id;
  v_b   urlaub.bedingungen;
begin
  select b.* into v_b
  from urlaub.bedingungen b
  join urlaub.fragen f on f.id = b.frage_id
  join urlaub.umfragen u on u.id = f.umfrage_id
  where b.id = p_bedingung_id and u.organisator_id = v_uid;
  if not found then
    raise exception 'BEDINGUNG_NICHT_GEFUNDEN';
  end if;
  return v_b;
end;
$$;

-- Regel-Arten je Fragetyp; unbekannter Typ: keine.
create or replace function urlaub.erlaubte_regeln(p_typ text)
returns text[]
language sql immutable
set search_path = ''
as $$
  select case p_typ
    when 'urlaubswochen' then array['pflicht', 'min_wochen', 'max_wochen', 'max_am_stueck', 'max_urlaubstage',
                                    'gesperrte_monate', 'gesperrte_wochen']
    when 'einfach'       then array['pflicht']
    when 'janein'        then array['pflicht']
    when 'skala'         then array['pflicht']
    when 'mehrfach'      then array['pflicht', 'min_anzahl', 'max_anzahl']
    when 'text_kurz'     then array['pflicht', 'max_zeichen']
    when 'text_lang'     then array['pflicht', 'max_zeichen']
    when 'zahl'          then array['pflicht', 'min_zahl', 'max_zahl']
    when 'datum'         then array['pflicht', 'fruehestens', 'spaetestens']
    else '{}'::text[]
  end
$$;

-- Nummeriert die Fragen einer Umfrage lückenlos 1…n (Reihenfolge position, id).
create or replace function urlaub.positionen_neu(p_umfrage_id bigint)
returns void
language sql volatile
set search_path = ''
as $$
  update urlaub.fragen f set position = x.n
  from (select id, row_number() over (order by position, id)::int as n
        from urlaub.fragen where umfrage_id = p_umfrage_id) x
  where f.id = x.id and f.position <> x.n
$$;

create or replace function urlaub.optionen_positionen_neu(p_frage_id bigint)
returns void
language sql volatile
set search_path = ''
as $$
  update urlaub.optionen o set position = x.n
  from (select id, row_number() over (order by position, id)::int as n
        from urlaub.optionen where frage_id = p_frage_id) x
  where o.id = x.id and o.position <> x.n
$$;

-- Gespeicherte Form eines Regelwerts, sonst UNGUELTIGE_EINSTELLUNG. Streng, weil
-- antwort_verstoss/wochen_verstoss/kalender die Werte ohne Schutz umwandeln
-- (::int, ::numeric, ::date). Ganze Zahlen bleiben im int-Bereich; max_zeichen,
-- max_am_stueck und max_urlaubstage mindestens 1.
create or replace function urlaub.regelwert(p_art text, p_wert jsonb)
returns jsonb
language plpgsql immutable
set search_path = ''
as $$
declare
  v_zahl  numeric;
  v_datum date;
begin
  if p_art = 'pflicht' then
    return 'null'::jsonb;
  end if;
  if p_art in ('min_anzahl', 'max_anzahl', 'min_wochen', 'max_wochen', 'max_am_stueck', 'max_urlaubstage',
               'max_zeichen') then
    if jsonb_typeof(p_wert) is distinct from 'number' then
      raise exception 'UNGUELTIGE_EINSTELLUNG';
    end if;
    v_zahl := (p_wert #>> '{}')::numeric;
    if v_zahl <> trunc(v_zahl)
       or v_zahl < (case when p_art in ('max_zeichen', 'max_am_stueck', 'max_urlaubstage') then 1 else 0 end)
       or v_zahl > 2147483647 then
      raise exception 'UNGUELTIGE_EINSTELLUNG';
    end if;
    return to_jsonb(v_zahl::int);
  end if;
  if p_art in ('min_zahl', 'max_zahl') then
    if jsonb_typeof(p_wert) is distinct from 'number' then
      raise exception 'UNGUELTIGE_EINSTELLUNG';
    end if;
    return to_jsonb((p_wert #>> '{}')::numeric);
  end if;
  if p_art in ('fruehestens', 'spaetestens') then
    if jsonb_typeof(p_wert) is distinct from 'string' or (p_wert #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'UNGUELTIGE_EINSTELLUNG';
    end if;
    begin
      v_datum := (p_wert #>> '{}')::date;
    exception when data_exception then
      raise exception 'UNGUELTIGE_EINSTELLUNG';
    end;
    return to_jsonb(to_char(v_datum, 'YYYY-MM-DD'));
  end if;
  if p_art in ('gesperrte_monate', 'gesperrte_wochen') then
    if jsonb_typeof(p_wert) is distinct from 'array'
       or exists (select 1 from jsonb_array_elements(p_wert) e
                  where jsonb_typeof(e) <> 'number'
                     or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric)
                     or (e #>> '{}')::numeric not between 1 and (case p_art when 'gesperrte_wochen' then 53 else 12 end)) then
      raise exception 'UNGUELTIGE_EINSTELLUNG';
    end if;
    return coalesce((select jsonb_agg(m order by m)
                     from (select distinct ((e #>> '{}')::numeric)::int as m from jsonb_array_elements(p_wert) e) s),
                    '[]'::jsonb);
  end if;
  raise exception 'UNGUELTIGE_EINSTELLUNG';
end;
$$;

-- Gespeicherte Form der Werte einer Bedingung, sonst BEDINGUNG_UNGUELTIG.
-- Quelle: andere Frage derselben Umfrage, die vor dem Ziel steht; Operator und
-- Werte passend zum Quelltyp. Options-IDs werden sortiert und ohne Doppelte gespeichert.
create or replace function urlaub.bedingung_werte(p_ziel urlaub.fragen, p_quelle_id bigint, p_operator text, p_werte jsonb)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_q urlaub.fragen;
begin
  select * into v_q from urlaub.fragen
  where id = p_quelle_id and umfrage_id = p_ziel.umfrage_id and id <> p_ziel.id
    and (position, id) < (p_ziel.position, p_ziel.id);
  if not found then
    raise exception 'BEDINGUNG_UNGUELTIG';
  end if;
  if (v_q.typ = 'einfach' and p_operator in ('ist_eine_von', 'ist_keine_von'))
     or (v_q.typ = 'mehrfach' and p_operator in ('enthaelt_eine_von', 'enthaelt_keine_von')) then
    if jsonb_typeof(p_werte) is distinct from 'array' or jsonb_array_length(p_werte) = 0
       or exists (select 1 from jsonb_array_elements(p_werte) e
                  where jsonb_typeof(e) <> 'number'
                     or not exists (select 1 from urlaub.optionen o
                                    where o.frage_id = v_q.id and o.id::numeric = (e #>> '{}')::numeric)) then
      raise exception 'BEDINGUNG_UNGUELTIG';
    end if;
    return (select jsonb_agg(i order by i)
            from (select distinct ((e #>> '{}')::numeric)::bigint as i from jsonb_array_elements(p_werte) e) s);
  end if;
  if v_q.typ = 'janein' and p_operator = 'ist' and jsonb_typeof(p_werte) = 'boolean' then
    return p_werte;
  end if;
  if v_q.typ in ('skala', 'zahl') and p_operator in ('gleich', 'groesser', 'kleiner')
     and jsonb_typeof(p_werte) = 'number' then
    return p_werte;
  end if;
  raise exception 'BEDINGUNG_UNGUELTIG';
end;
$$;

-- Neue Frage am Ende. Vorgaben: Text "Neue Frage" (Hinweis: "Hinweis"), bei Auswahl
-- zwei Antwortmöglichkeiten, Skala 1–5; Urlaubswochen mit den Standard-Regeln für das
-- Jahr nach der Frist (höchstens eine je Umfrage).
create or replace function public.org_frage_anlegen(p_umfrage_id bigint, p_typ text)
returns bigint
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u  urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
  v_id bigint;
begin
  if p_typ is null or p_typ not in ('urlaubswochen', 'einfach', 'mehrfach', 'janein', 'skala',
                                    'text_kurz', 'text_lang', 'zahl', 'datum', 'hinweis') then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end if;
  perform 1 from urlaub.umfragen where id = v_u.id for update;
  if p_typ = 'urlaubswochen' then
    if exists (select 1 from urlaub.fragen where umfrage_id = v_u.id and typ = 'urlaubswochen') then
      raise exception 'URLAUBSWOCHEN_DOPPELT';
    end if;
    begin
      v_id := urlaub.standard_urlaubsfrage(
                v_u.id, extract(year from v_u.frist at time zone 'Europe/Berlin')::int + 1, 'BY');
    exception when check_violation or not_null_violation or data_exception then
      raise exception 'UNGUELTIGE_EINSTELLUNG';
    end;
    return v_id;
  end if;
  insert into urlaub.fragen (umfrage_id, position, typ, text, skala_von, skala_bis)
  values (v_u.id,
          coalesce((select max(position) from urlaub.fragen where umfrage_id = v_u.id), 0) + 1,
          p_typ,
          case when p_typ = 'hinweis' then 'Hinweis' else 'Neue Frage' end,
          case when p_typ = 'skala' then 1 end,
          case when p_typ = 'skala' then 5 end)
  returning id into v_id;
  if p_typ in ('einfach', 'mehrfach') then
    insert into urlaub.optionen (frage_id, position, text) values (v_id, 1, 'Antwort 1'), (v_id, 2, 'Antwort 2');
  end if;
  return v_id;
end;
$$;

-- Alle Schlüssel optional; Felder eines anderen Typs (z. B. jahr bei einer Skala) werden ignoriert.
-- Die Besitzprüfung (declare-Block) liegt außerhalb der inneren exception-Blöcke.
create or replace function public.org_frage_speichern(p_frage_id bigint, p_daten jsonb)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_f       urlaub.fragen := urlaub.eigene_frage(p_frage_id);
  v_neu     urlaub.fragen;
  v_u       urlaub.umfragen;
  v_antwort boolean;
begin
  if jsonb_typeof(p_daten) is distinct from 'object' then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end if;
  select * into v_u from urlaub.umfragen where id = v_f.umfrage_id for update;
  v_antwort := exists (select 1 from urlaub.antworten where frage_id = v_f.id);
  v_neu := v_f;

  -- Texte
  if p_daten ? 'text' then
    v_neu.text := urlaub.trim_alles(p_daten ->> 'text');
    if v_neu.text is null or v_neu.text = '' then
      raise exception 'FRAGETEXT_LEER';
    end if;
  end if;
  if p_daten ? 'hilfetext' then
    v_neu.hilfetext := coalesce(urlaub.trim_alles(p_daten ->> 'hilfetext'), '');
  end if;
  if p_daten ? 'verknuepfung' then
    v_neu.verknuepfung := p_daten ->> 'verknuepfung';
  end if;

  -- Typwechsel
  if p_daten ? 'typ' and (p_daten ->> 'typ') is distinct from v_f.typ then
    v_neu.typ := p_daten ->> 'typ';
    if v_neu.typ is null or v_neu.typ = 'urlaubswochen' or v_f.typ = 'urlaubswochen'
       or v_neu.typ not in ('einfach', 'mehrfach', 'janein', 'skala', 'text_kurz', 'text_lang', 'zahl', 'datum',
                            'hinweis') then
      raise exception 'UNGUELTIGE_EINSTELLUNG';
    end if;
    if v_antwort then
      raise exception 'TYP_GESPERRT';
    end if;
    if exists (select 1 from urlaub.bedingungen where quelle_id = v_f.id) then
      raise exception 'BEDINGUNG_VERWEIST';
    end if;
    if v_neu.typ = 'skala' then
      v_neu.skala_von := 1; v_neu.skala_bis := 5; v_neu.skala_links := null; v_neu.skala_rechts := null;
    else
      v_neu.skala_von := null; v_neu.skala_bis := null; v_neu.skala_links := null; v_neu.skala_rechts := null;
    end if;
  end if;

  -- Typ-Einstellungen; Umwandlungsfehler (z. B. "abc" als Zahl) werden UNGUELTIGE_EINSTELLUNG.
  begin
    if v_neu.typ = 'skala' then
      if p_daten ? 'skala_von' then v_neu.skala_von := (p_daten ->> 'skala_von')::int; end if;
      if p_daten ? 'skala_bis' then v_neu.skala_bis := (p_daten ->> 'skala_bis')::int; end if;
      if p_daten ? 'skala_links' then v_neu.skala_links := nullif(urlaub.trim_alles(p_daten ->> 'skala_links'), ''); end if;
      if p_daten ? 'skala_rechts' then v_neu.skala_rechts := nullif(urlaub.trim_alles(p_daten ->> 'skala_rechts'), ''); end if;
    end if;
    if v_neu.typ = 'urlaubswochen' then
      if p_daten ? 'jahr' then v_neu.jahr := (p_daten ->> 'jahr')::int; end if;
      if p_daten ? 'bundesland' then v_neu.bundesland := p_daten ->> 'bundesland'; end if;
      if p_daten ? 'arbeitstage_pro_woche' then
        v_neu.arbeitstage_pro_woche := (p_daten ->> 'arbeitstage_pro_woche')::int;
      end if;
      if p_daten ? 'sperr_hinweis' then v_neu.sperr_hinweis := urlaub.trim_alles(p_daten ->> 'sperr_hinweis'); end if;
    end if;
  exception when data_exception then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end;
  if v_antwort and (v_neu.jahr, v_neu.bundesland, v_neu.arbeitstage_pro_woche, v_neu.skala_von, v_neu.skala_bis)
                   is distinct from (v_f.jahr, v_f.bundesland, v_f.arbeitstage_pro_woche, v_f.skala_von, v_f.skala_bis) then
    raise exception 'GRUNDDATEN_GESPERRT';
  end if;

  begin
    update urlaub.fragen set
      text = v_neu.text, hilfetext = v_neu.hilfetext, verknuepfung = v_neu.verknuepfung, typ = v_neu.typ,
      skala_von = v_neu.skala_von, skala_bis = v_neu.skala_bis,
      skala_links = v_neu.skala_links, skala_rechts = v_neu.skala_rechts,
      jahr = v_neu.jahr, bundesland = v_neu.bundesland, arbeitstage_pro_woche = v_neu.arbeitstage_pro_woche,
      sperr_hinweis = v_neu.sperr_hinweis
    where id = v_f.id;
    -- Frist auf dem Standard des alten Jahres (30.11. des Vorjahres) zieht mit.
    if v_neu.jahr is distinct from v_f.jahr and v_f.jahr is not null
       and v_u.frist = make_timestamp(v_f.jahr - 1, 11, 30, 23, 59, 59) at time zone 'Europe/Berlin' then
      update urlaub.umfragen
      set frist = make_timestamp(v_neu.jahr - 1, 11, 30, 23, 59, 59) at time zone 'Europe/Berlin'
      where id = v_u.id;
    end if;
  exception when check_violation or not_null_violation or data_exception then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end;

  if v_neu.typ is distinct from v_f.typ then
    delete from urlaub.regeln where frage_id = v_f.id and not (art = any (urlaub.erlaubte_regeln(v_neu.typ)));
    if v_neu.typ in ('einfach', 'mehrfach') then
      if not exists (select 1 from urlaub.optionen where frage_id = v_f.id) then
        insert into urlaub.optionen (frage_id, position, text)
        values (v_f.id, 1, 'Antwort 1'), (v_f.id, 2, 'Antwort 2');
      end if;
    else
      delete from urlaub.optionen where frage_id = v_f.id;
    end if;
  end if;
end;
$$;

create or replace function public.org_frage_schalten(p_frage_id bigint, p_aktiv boolean)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_f urlaub.fragen := urlaub.eigene_frage(p_frage_id);
begin
  update urlaub.fragen set aktiv = coalesce(p_aktiv, aktiv) where id = v_f.id;
end;
$$;

-- Tauscht mit der Nachbarfrage (−1 nach oben, +1 nach unten); am Rand passiert nichts.
-- Danach muss jede Bedingung (auch ausgeschaltete) ihre Quelle weiterhin vor dem Ziel haben.
create or replace function public.org_frage_verschieben(p_frage_id bigint, p_richtung int)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_f       urlaub.fragen := urlaub.eigene_frage(p_frage_id);
  v_pos     int;
  v_nachbar bigint;
begin
  if p_richtung is null or p_richtung not in (-1, 1) then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end if;
  perform 1 from urlaub.umfragen where id = v_f.umfrage_id for update;
  perform urlaub.positionen_neu(v_f.umfrage_id);
  select position into v_pos from urlaub.fragen where id = v_f.id;
  select id into v_nachbar from urlaub.fragen where umfrage_id = v_f.umfrage_id and position = v_pos + p_richtung;
  if v_nachbar is null then
    return;
  end if;
  update urlaub.fragen set position = case id when v_f.id then v_pos + p_richtung else v_pos end
  where id in (v_f.id, v_nachbar);
  if exists (select 1 from urlaub.bedingungen b
             join urlaub.fragen z on z.id = b.frage_id
             join urlaub.fragen q on q.id = b.quelle_id
             where (b.frage_id in (v_f.id, v_nachbar) or b.quelle_id in (v_f.id, v_nachbar))
               and q.position >= z.position) then
    raise exception 'REIHENFOLGE_BEDINGUNG';
  end if;
end;
$$;

create or replace function public.org_frage_loeschen(p_frage_id bigint)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_f urlaub.fragen := urlaub.eigene_frage(p_frage_id);
begin
  perform 1 from urlaub.umfragen where id = v_f.umfrage_id for update;
  if exists (select 1 from urlaub.antworten where frage_id = v_f.id) then
    raise exception 'HAT_ANTWORTEN';
  end if;
  if exists (select 1 from urlaub.bedingungen where quelle_id = v_f.id) then
    raise exception 'BEDINGUNG_VERWEIST';
  end if;
  delete from urlaub.fragen where id = v_f.id;  -- Optionen, Regeln, eigene Bedingungen werden mitgelöscht
  perform urlaub.positionen_neu(v_f.umfrage_id);
end;
$$;

create or replace function public.org_option_anlegen(p_frage_id bigint, p_text text)
returns bigint
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_f    urlaub.fragen := urlaub.eigene_frage(p_frage_id);
  v_text text := urlaub.trim_alles(p_text);
  v_id   bigint;
begin
  if v_f.typ not in ('einfach', 'mehrfach') then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end if;
  if v_text is null or v_text = '' then
    raise exception 'FRAGETEXT_LEER';
  end if;
  perform 1 from urlaub.fragen where id = v_f.id for update;
  insert into urlaub.optionen (frage_id, position, text)
  values (v_f.id, coalesce((select max(position) from urlaub.optionen where frage_id = v_f.id), 0) + 1, v_text)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.org_option_speichern(p_option_id bigint, p_text text)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o    urlaub.optionen := urlaub.eigene_option(p_option_id);
  v_text text := urlaub.trim_alles(p_text);
begin
  if v_text is null or v_text = '' then
    raise exception 'FRAGETEXT_LEER';
  end if;
  update urlaub.optionen set text = v_text where id = v_o.id;
end;
$$;

create or replace function public.org_option_schalten(p_option_id bigint, p_aktiv boolean)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o urlaub.optionen := urlaub.eigene_option(p_option_id);
begin
  update urlaub.optionen set aktiv = coalesce(p_aktiv, aktiv) where id = v_o.id;
end;
$$;

create or replace function public.org_option_verschieben(p_option_id bigint, p_richtung int)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o       urlaub.optionen := urlaub.eigene_option(p_option_id);
  v_pos     int;
  v_nachbar bigint;
begin
  if p_richtung is null or p_richtung not in (-1, 1) then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end if;
  perform 1 from urlaub.fragen where id = v_o.frage_id for update;
  perform urlaub.optionen_positionen_neu(v_o.frage_id);
  select position into v_pos from urlaub.optionen where id = v_o.id;
  select id into v_nachbar from urlaub.optionen where frage_id = v_o.frage_id and position = v_pos + p_richtung;
  if v_nachbar is null then
    return;
  end if;
  update urlaub.optionen set position = case id when v_o.id then v_pos + p_richtung else v_pos end
  where id in (v_o.id, v_nachbar);
end;
$$;

create or replace function public.org_option_loeschen(p_option_id bigint)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o urlaub.optionen := urlaub.eigene_option(p_option_id);
begin
  perform 1 from urlaub.umfragen u join urlaub.fragen f on f.umfrage_id = u.id where f.id = v_o.frage_id
  for update of u;
  if exists (select 1 from urlaub.antwort_optionen where option_id = v_o.id) then
    raise exception 'HAT_ANTWORTEN';
  end if;
  if exists (select 1 from urlaub.bedingungen
             where quelle_id = v_o.frage_id and jsonb_typeof(werte) = 'array'
               and werte @> jsonb_build_array(v_o.id)) then
    raise exception 'BEDINGUNG_VERWEIST';
  end if;
  delete from urlaub.optionen where id = v_o.id;
end;
$$;

-- Legt die Regel an oder ändert Wert und Schalter. pflicht speichert immer null.
-- Sind danach beide Regeln eines Paares (min/max, frühestens/spätestens) eingeschaltet
-- und die untere größer als die obere, scheitert der ganze Aufruf (gilt auch fürs
-- Einschalten). Gleiche Werte sind erlaubt.
create or replace function public.org_regel_setzen(p_frage_id bigint, p_art text, p_wert jsonb, p_aktiv boolean)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_f    urlaub.fragen := urlaub.eigene_frage(p_frage_id);
  v_wert jsonb;
begin
  if p_art is null or not (p_art = any (urlaub.erlaubte_regeln(v_f.typ))) then
    raise exception 'REGEL_UNPASSEND';
  end if;
  v_wert := urlaub.regelwert(p_art, p_wert);
  insert into urlaub.regeln (frage_id, art, wert, aktiv)
  values (v_f.id, p_art, v_wert, coalesce(p_aktiv, true))
  on conflict (frage_id, art) do update set wert = excluded.wert, aktiv = coalesce(p_aktiv, urlaub.regeln.aktiv);
  if exists (
    select 1
    from (values ('min_wochen', 'max_wochen'), ('min_anzahl', 'max_anzahl'), ('min_zahl', 'max_zahl'),
                 ('fruehestens', 'spaetestens')) as p (unten, oben)
    join urlaub.regeln ru on ru.frage_id = v_f.id and ru.art = p.unten and ru.aktiv
    join urlaub.regeln ro on ro.frage_id = v_f.id and ro.art = p.oben and ro.aktiv
    where p_art in (p.unten, p.oben)
      and case when p.unten = 'fruehestens' then (ru.wert #>> '{}')::date > (ro.wert #>> '{}')::date
               else (ru.wert #>> '{}')::numeric > (ro.wert #>> '{}')::numeric end) then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end if;
end;
$$;

create or replace function public.org_bedingung_anlegen(p_frage_id bigint, p_quelle_id bigint, p_operator text, p_werte jsonb)
returns bigint
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_f     urlaub.fragen := urlaub.eigene_frage(p_frage_id);
  v_werte jsonb;
  v_id    bigint;
begin
  perform 1 from urlaub.umfragen where id = v_f.umfrage_id for update;
  select * into v_f from urlaub.fragen where id = v_f.id;  -- Position nach der Sperre
  v_werte := urlaub.bedingung_werte(v_f, p_quelle_id, p_operator, p_werte);
  insert into urlaub.bedingungen (frage_id, quelle_id, operator, werte)
  values (v_f.id, p_quelle_id, p_operator, v_werte)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.org_bedingung_speichern(p_bedingung_id bigint, p_operator text, p_werte jsonb)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_b     urlaub.bedingungen := urlaub.eigene_bedingung(p_bedingung_id);
  v_f     urlaub.fragen;
  v_werte jsonb;
begin
  perform 1 from urlaub.umfragen u join urlaub.fragen f on f.umfrage_id = u.id where f.id = v_b.frage_id
  for update of u;
  select * into v_f from urlaub.fragen where id = v_b.frage_id;
  v_werte := urlaub.bedingung_werte(v_f, v_b.quelle_id, p_operator, p_werte);
  update urlaub.bedingungen set operator = p_operator, werte = v_werte where id = v_b.id;
end;
$$;

create or replace function public.org_bedingung_schalten(p_bedingung_id bigint, p_aktiv boolean)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_b urlaub.bedingungen := urlaub.eigene_bedingung(p_bedingung_id);
begin
  update urlaub.bedingungen set aktiv = coalesce(p_aktiv, aktiv) where id = v_b.id;
end;
$$;

create or replace function public.org_bedingung_loeschen(p_bedingung_id bigint)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_b urlaub.bedingungen := urlaub.eigene_bedingung(p_bedingung_id);
begin
  delete from urlaub.bedingungen where id = v_b.id;
end;
$$;

-- Kopie mit allen Fragen, Optionen, Regeln, Bedingungen (Schalter wie im Original)
-- und freien Tagen; ohne Mitarbeiter und Antworten. IDs werden über Zuordnungen
-- alt → neu umgeschlüsselt, auch die Options-IDs in den Bedingungswerten.
create or replace function public.org_umfrage_kopieren(p_umfrage_id bigint)
returns bigint
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u        urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
  v_id       bigint;
  v_neu      bigint;
  v_neue_opt bigint;
  v_fragen   jsonb := '{}';  -- alte Frage-ID → neue
  v_optionen jsonb := '{}';  -- alte Options-ID → neue
  v_f        urlaub.fragen;
  v_o        urlaub.optionen;
begin
  insert into urlaub.umfragen (organisator_id, titel, frist)
  values (v_u.organisator_id, 'Kopie von ' || v_u.titel, v_u.frist)
  returning id into v_id;
  for v_f in select * from urlaub.fragen where umfrage_id = v_u.id order by position, id loop
    insert into urlaub.fragen (umfrage_id, position, typ, text, hilfetext, aktiv, verknuepfung, jahr, bundesland,
                               arbeitstage_pro_woche, sperr_hinweis, skala_von, skala_bis, skala_links, skala_rechts)
    values (v_id, v_f.position, v_f.typ, v_f.text, v_f.hilfetext, v_f.aktiv, v_f.verknuepfung, v_f.jahr,
            v_f.bundesland, v_f.arbeitstage_pro_woche, v_f.sperr_hinweis, v_f.skala_von, v_f.skala_bis,
            v_f.skala_links, v_f.skala_rechts)
    returning id into v_neu;
    v_fragen := v_fragen || jsonb_build_object(v_f.id::text, v_neu);
    for v_o in select * from urlaub.optionen where frage_id = v_f.id order by position, id loop
      insert into urlaub.optionen (frage_id, position, text, aktiv)
      values (v_neu, v_o.position, v_o.text, v_o.aktiv)
      returning id into v_neue_opt;
      v_optionen := v_optionen || jsonb_build_object(v_o.id::text, v_neue_opt);
    end loop;
  end loop;

  insert into urlaub.regeln (frage_id, art, wert, aktiv)
  select (v_fragen ->> r.frage_id::text)::bigint, r.art, r.wert, r.aktiv
  from urlaub.regeln r join urlaub.fragen f on f.id = r.frage_id
  where f.umfrage_id = v_u.id;

  -- Options-IDs in den Werten nur bei Auswahl-Quellen; andere Werte (true, 2.5) bleiben.
  insert into urlaub.bedingungen (frage_id, quelle_id, operator, werte, aktiv)
  select (v_fragen ->> b.frage_id::text)::bigint,
         (v_fragen ->> b.quelle_id::text)::bigint,
         b.operator,
         case when q.typ in ('einfach', 'mehrfach') and jsonb_typeof(b.werte) = 'array'
              then (select coalesce(jsonb_agg(v_optionen -> (e #>> '{}') order by (v_optionen ->> (e #>> '{}'))::bigint),
                                    '[]'::jsonb)
                    from jsonb_array_elements(b.werte) e where v_optionen ? (e #>> '{}'))
              else b.werte end,
         b.aktiv
  from urlaub.bedingungen b
  join urlaub.fragen z on z.id = b.frage_id
  join urlaub.fragen q on q.id = b.quelle_id
  where z.umfrage_id = v_u.id
  order by b.id;

  insert into urlaub.freie_tage (umfrage_id, datum, name)
  select v_id, datum, name from urlaub.freie_tage where umfrage_id = v_u.id;
  return v_id;
end;
$$;

revoke all on function public.org_frage_anlegen(bigint, text)                    from public, anon, authenticated;
revoke all on function public.org_frage_speichern(bigint, jsonb)                 from public, anon, authenticated;
revoke all on function public.org_frage_schalten(bigint, boolean)                from public, anon, authenticated;
revoke all on function public.org_frage_verschieben(bigint, int)                 from public, anon, authenticated;
revoke all on function public.org_frage_loeschen(bigint)                         from public, anon, authenticated;
revoke all on function public.org_option_anlegen(bigint, text)                   from public, anon, authenticated;
revoke all on function public.org_option_speichern(bigint, text)                 from public, anon, authenticated;
revoke all on function public.org_option_schalten(bigint, boolean)               from public, anon, authenticated;
revoke all on function public.org_option_verschieben(bigint, int)                from public, anon, authenticated;
revoke all on function public.org_option_loeschen(bigint)                        from public, anon, authenticated;
revoke all on function public.org_regel_setzen(bigint, text, jsonb, boolean)     from public, anon, authenticated;
revoke all on function public.org_bedingung_anlegen(bigint, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.org_bedingung_speichern(bigint, text, jsonb)       from public, anon, authenticated;
revoke all on function public.org_bedingung_schalten(bigint, boolean)            from public, anon, authenticated;
revoke all on function public.org_bedingung_loeschen(bigint)                     from public, anon, authenticated;
revoke all on function public.org_umfrage_kopieren(bigint)                       from public, anon, authenticated;
grant execute on function public.org_frage_anlegen(bigint, text)                    to authenticated;
grant execute on function public.org_frage_speichern(bigint, jsonb)                 to authenticated;
grant execute on function public.org_frage_schalten(bigint, boolean)                to authenticated;
grant execute on function public.org_frage_verschieben(bigint, int)                 to authenticated;
grant execute on function public.org_frage_loeschen(bigint)                         to authenticated;
grant execute on function public.org_option_anlegen(bigint, text)                   to authenticated;
grant execute on function public.org_option_speichern(bigint, text)                 to authenticated;
grant execute on function public.org_option_schalten(bigint, boolean)               to authenticated;
grant execute on function public.org_option_verschieben(bigint, int)                to authenticated;
grant execute on function public.org_option_loeschen(bigint)                        to authenticated;
grant execute on function public.org_regel_setzen(bigint, text, jsonb, boolean)     to authenticated;
grant execute on function public.org_bedingung_anlegen(bigint, bigint, text, jsonb) to authenticated;
grant execute on function public.org_bedingung_speichern(bigint, text, jsonb)       to authenticated;
grant execute on function public.org_bedingung_schalten(bigint, boolean)            to authenticated;
grant execute on function public.org_bedingung_loeschen(bigint)                     to authenticated;
grant execute on function public.org_umfrage_kopieren(bigint)                       to authenticated;

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
