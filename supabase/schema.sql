-- Urlaubswünsche 2027 – Datenbank
--
-- Einmal komplett im Supabase SQL-Editor ausführen. Erneutes Ausführen ist
-- unschädlich: vorhandene Mitarbeiter, Abgaben und Einstellungen bleiben.
--
-- Sicherheitsprinzip: Alle Tabellen und Ansichten liegen im Schema "urlaub".
-- Darauf hat der Browser-Schlüssel (Rolle anon) keinerlei Zugriff. Der Browser
-- darf nur die zwei Funktionen public.urlaub_laden und public.urlaub_speichern
-- aufrufen. Sie prüfen den Code aus dem Link und liefern nur den eigenen Eintrag.

create schema if not exists urlaub;
revoke all on schema urlaub from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

-- Genau eine Zeile. Hier änderst du Frist, Link-Adresse und Dezember-Hinweis.
create table if not exists urlaub.einstellungen (
  id               boolean primary key default true check (id),
  frist            timestamptz not null,
  link_basis       text not null,
  dezember_hinweis text not null,
  max_wochen       int not null default 6  check (max_wochen between 1 and 47),
  urlaubstage      int not null default 36 check (urlaubstage > 0)
);

-- Feiertage, die keinen Urlaubstag kosten (Bayern 2027).
create table if not exists urlaub.feiertage (
  datum date primary key,
  name  text not null
);

-- Hier legst du Mitarbeiter an: nur den Namen eintragen, der Code entsteht von selbst.
-- gen_random_uuid() liefert 122 Bit Zufall aus einem kryptografischen Zufallsgenerator.
create table if not exists urlaub.mitarbeiter (
  id          bigint generated always as identity primary key,
  name        text not null unique check (btrim(name) <> ''),
  code        text not null unique
              default replace(gen_random_uuid()::text, '-', '')
              check (code ~ '^[0-9a-f]{32}$'),
  angelegt_am timestamptz not null default now()
);

-- Eine Zeile pro Person (Primärschlüssel = Mitarbeiter).
create table if not exists urlaub.abgaben (
  mitarbeiter_id bigint primary key references urlaub.mitarbeiter (id) on delete cascade,
  wochen         int[] not null
                 check (cardinality(wochen) >= 1
                        and array_position(wochen, null) is null
                        and 1 <= all (wochen) and 47 >= all (wochen)),
  geaendert_am   timestamptz not null default now()
);

alter table urlaub.einstellungen enable row level security;
alter table urlaub.feiertage     enable row level security;
alter table urlaub.mitarbeiter   enable row level security;
alter table urlaub.abgaben       enable row level security;
revoke all on all tables in schema urlaub from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Startwerte
-- ---------------------------------------------------------------------------

-- PLATZHALTER: Frist, Link-Adresse und Dezember-Hinweis anpassen (siehe ANLEITUNG.md).
insert into urlaub.einstellungen (frist, link_basis, dezember_hinweis)
values ('2026-11-30 23:59:59 Europe/Berlin',
        'https://dangtu1190-tech.github.io/Urlaub/',
        'Im Dezember ist kein Urlaub möglich.')
on conflict (id) do nothing;

-- Gesetzliche Feiertage Bayern 2027. Mariä Himmelfahrt gilt nur in Gemeinden mit
-- überwiegend katholischer Bevölkerung, fällt 2027 aber ohnehin auf einen Sonntag.
insert into urlaub.feiertage (datum, name) values
  ('2027-01-01', 'Neujahr'),
  ('2027-01-06', 'Heilige Drei Könige'),
  ('2027-03-26', 'Karfreitag'),
  ('2027-03-29', 'Ostermontag'),
  ('2027-05-01', 'Tag der Arbeit'),
  ('2027-05-06', 'Christi Himmelfahrt'),
  ('2027-05-17', 'Pfingstmontag'),
  ('2027-05-27', 'Fronleichnam'),
  ('2027-08-15', 'Mariä Himmelfahrt'),
  ('2027-10-03', 'Tag der Deutschen Einheit'),
  ('2027-11-01', 'Allerheiligen'),
  ('2027-12-25', '1. Weihnachtstag'),
  ('2027-12-26', '2. Weihnachtstag')
on conflict (datum) do nothing;

-- ---------------------------------------------------------------------------
-- Kalender: KW 1–47 nach ISO 8601. Arbeitstage = Montag bis Samstag
-- abzüglich Feiertage, die auf diese Tage fallen.
-- ---------------------------------------------------------------------------

create or replace view urlaub.kalender with (security_invoker = true) as
select w.kw,
       w.montag,
       w.montag + 6                                   as sonntag,
       extract(month from w.montag + 3)::int          as monat,  -- Monat des Donnerstags
       6 - count(f.datum)::int                        as arbeitstage,
       string_agg(f.name, ', ' order by f.datum)      as feiertag
from (select kw, date '2027-01-04' + (kw - 1) * 7 as montag
      from generate_series(1, 47) as kw) w
left join urlaub.feiertage f
       on f.datum between w.montag and w.montag + 5
group by w.kw, w.montag;

-- Antwort an den Browser: nur Daten der Person mit dieser ID.
create or replace function urlaub.antwort(p_mitarbeiter_id bigint)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'name',             m.name,
    'wochen',           coalesce(to_jsonb(a.wochen), '[]'::jsonb),
    'geaendert_am',     a.geaendert_am,
    'frist',            e.frist,
    'offen',            now() < e.frist,
    'max_wochen',       e.max_wochen,
    'urlaubstage',      e.urlaubstage,
    'dezember_hinweis', e.dezember_hinweis,
    'kalender', (select jsonb_agg(jsonb_build_object(
                          'kw',          k.kw,
                          'von',         to_char(k.montag,  'DD.MM.'),
                          'bis',         to_char(k.sonntag, 'DD.MM.'),
                          'monat',       k.monat,
                          'arbeitstage', k.arbeitstage,
                          'feiertag',    k.feiertag) order by k.kw)
                 from urlaub.kalender k))
  from urlaub.mitarbeiter m
  cross join urlaub.einstellungen e
  left join urlaub.abgaben a on a.mitarbeiter_id = m.id
  where m.id = p_mitarbeiter_id
$$;

revoke all on function urlaub.antwort(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Die einzigen zwei Funktionen, die der Browser aufrufen darf
-- ---------------------------------------------------------------------------

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
  v_id     bigint;
  v_e      urlaub.einstellungen;
  v_wochen int[];
  v_tage   int;
begin
  select id into v_id from urlaub.mitarbeiter where code = p_code;
  if v_id is null then
    raise exception 'LINK_UNGUELTIG';
  end if;

  select * into strict v_e from urlaub.einstellungen;
  if now() >= v_e.frist then
    raise exception 'FRIST_ABGELAUFEN';
  end if;

  if p_wochen is null or cardinality(p_wochen) = 0 then
    raise exception 'KEINE_WOCHE';
  end if;
  if exists (select 1 from unnest(p_wochen) x where x is null or x < 1 or x > 47) then
    raise exception 'UNGUELTIGE_WOCHE';
  end if;

  select array_agg(distinct x order by x) into v_wochen from unnest(p_wochen) x;
  if cardinality(v_wochen) <> cardinality(p_wochen) then
    raise exception 'DOPPELTE_WOCHE';
  end if;
  if cardinality(v_wochen) > v_e.max_wochen then
    raise exception 'ZU_VIELE_WOCHEN';
  end if;

  select sum(k.arbeitstage) into v_tage from urlaub.kalender k where k.kw = any (v_wochen);
  if v_tage > v_e.urlaubstage then
    raise exception 'ZU_VIELE_TAGE';
  end if;

  insert into urlaub.abgaben (mitarbeiter_id, wochen, geaendert_am)
  values (v_id, v_wochen, now())
  on conflict (mitarbeiter_id)
  do update set wochen = excluded.wochen, geaendert_am = excluded.geaendert_am;

  return urlaub.antwort(v_id);
end;
$$;

revoke all on function public.urlaub_laden(text)            from public, anon, authenticated;
revoke all on function public.urlaub_speichern(text, int[]) from public, anon, authenticated;
grant execute on function public.urlaub_laden(text)            to anon;
grant execute on function public.urlaub_speichern(text, int[]) to anon;

-- ---------------------------------------------------------------------------
-- Ansichten für dich im Dashboard (Table Editor → Schema "urlaub")
-- ---------------------------------------------------------------------------

create or replace view urlaub.links with (security_invoker = true) as
select m.name,
       e.link_basis || '#' || m.code as link
from urlaub.mitarbeiter m
cross join urlaub.einstellungen e
order by m.name;

create or replace view urlaub.auswertung_personen with (security_invoker = true) as
select m.name,
       case when a.mitarbeiter_id is null then 'nein' else 'ja' end            as abgegeben,
       (select string_agg('KW ' || w, ', ' order by w) from unnest(a.wochen) w) as wochen,
       cardinality(a.wochen)                                                     as anzahl_wochen,
       (select sum(k.arbeitstage)::int from urlaub.kalender k
         where k.kw = any (a.wochen))                                            as urlaubstage,
       to_char(a.geaendert_am at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI') as letzte_aenderung
from urlaub.mitarbeiter m
left join urlaub.abgaben a on a.mitarbeiter_id = m.id
order by m.name;

create or replace view urlaub.auswertung_wochen with (security_invoker = true) as
select k.kw,
       to_char(k.montag, 'DD.MM.') || '–' || to_char(k.sonntag, 'DD.MM.') as zeitraum,
       k.arbeitstage,
       k.feiertag,
       count(m.id)::int                                                    as anzahl,
       string_agg(m.name, ', ' order by m.name)                            as namen
from urlaub.kalender k
left join urlaub.abgaben a on k.kw = any (a.wochen)
left join urlaub.mitarbeiter m on m.id = a.mitarbeiter_id
group by k.kw, k.montag, k.sonntag, k.arbeitstage, k.feiertag
order by k.kw;

revoke all on all tables in schema urlaub from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin-Seite (admin.html)
--
-- Anmeldung über Supabase Auth. Angemeldete Nutzer haben die Rolle
-- "authenticated"; zusätzlich muss ihre Nutzer-ID in urlaub.admins stehen.
-- Jede Admin-Funktion prüft das selbst. Der Browser-Schlüssel ohne Anmeldung
-- (anon) darf keine Admin-Funktion aufrufen.
-- ---------------------------------------------------------------------------

create table if not exists urlaub.admins (
  user_id uuid primary key,
  notiz   text
);
alter table urlaub.admins enable row level security;

create or replace function urlaub.pruefe_admin()
returns void
language plpgsql stable
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from urlaub.admins where user_id = auth.uid()) then
    raise exception 'KEIN_ADMIN';
  end if;
end;
$$;

create or replace function public.admin_uebersicht()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  perform urlaub.pruefe_admin();
  return jsonb_build_object(
    'einstellungen', (
      select jsonb_build_object(
        'frist',             e.frist,
        'frist_eingabe',     to_char(e.frist at time zone 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI'),
        'offen',             now() < e.frist,
        'dezember_hinweis',  e.dezember_hinweis,
        'max_wochen',        e.max_wochen,
        'urlaubstage',       e.urlaubstage)
      from urlaub.einstellungen e),
    'mitarbeiter', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           m.id,
               'name',         m.name,
               'link',         e.link_basis || '#' || m.code,
               'wochen',       coalesce(to_jsonb(a.wochen), '[]'::jsonb),
               'urlaubstage',  (select coalesce(sum(k.arbeitstage), 0)::int
                                  from urlaub.kalender k where k.kw = any (a.wochen)),
               'geaendert_am', a.geaendert_am) order by m.name)
      from urlaub.mitarbeiter m
      cross join urlaub.einstellungen e
      left join urlaub.abgaben a on a.mitarbeiter_id = m.id), '[]'::jsonb),
    'kalender', (
      select jsonb_agg(jsonb_build_object(
               'kw',          k.kw,
               'von',         to_char(k.montag,  'DD.MM.'),
               'bis',         to_char(k.sonntag, 'DD.MM.'),
               'monat',       k.monat,
               'arbeitstage', k.arbeitstage,
               'feiertag',    k.feiertag) order by k.kw)
      from urlaub.kalender k));
end;
$$;

create or replace function public.admin_mitarbeiter_anlegen(p_name text)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  perform urlaub.pruefe_admin();
  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_LEER';
  end if;
  if exists (select 1 from urlaub.mitarbeiter where lower(name) = lower(btrim(p_name))) then
    raise exception 'NAME_DOPPELT';
  end if;
  insert into urlaub.mitarbeiter (name) values (btrim(p_name));
end;
$$;

create or replace function public.admin_mitarbeiter_loeschen(p_id bigint)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  perform urlaub.pruefe_admin();
  delete from urlaub.mitarbeiter where id = p_id;  -- Abgabe wird mitgelöscht
end;
$$;

-- Neuer Code: der alte Link funktioniert sofort nicht mehr, die Abgabe bleibt.
create or replace function public.admin_link_erneuern(p_id bigint)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  perform urlaub.pruefe_admin();
  update urlaub.mitarbeiter
     set code = replace(gen_random_uuid()::text, '-', '')
   where id = p_id;
end;
$$;

-- p_frist kommt als "YYYY-MM-DDTHH:MI" und wird als deutsche Zeit gelesen.
create or replace function public.admin_einstellungen_speichern(p_frist text, p_dezember_hinweis text)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  perform urlaub.pruefe_admin();
  if p_dezember_hinweis is null or btrim(p_dezember_hinweis) = '' then
    raise exception 'HINWEIS_LEER';
  end if;
  update urlaub.einstellungen
     set frist            = p_frist::timestamp at time zone 'Europe/Berlin',
         dezember_hinweis = btrim(p_dezember_hinweis);
end;
$$;

revoke all on function urlaub.pruefe_admin() from public, anon, authenticated;
revoke all on function public.admin_uebersicht()                          from public, anon, authenticated;
revoke all on function public.admin_mitarbeiter_anlegen(text)             from public, anon, authenticated;
revoke all on function public.admin_mitarbeiter_loeschen(bigint)          from public, anon, authenticated;
revoke all on function public.admin_link_erneuern(bigint)                 from public, anon, authenticated;
revoke all on function public.admin_einstellungen_speichern(text, text)   from public, anon, authenticated;
grant execute on function public.admin_uebersicht()                        to authenticated;
grant execute on function public.admin_mitarbeiter_anlegen(text)           to authenticated;
grant execute on function public.admin_mitarbeiter_loeschen(bigint)        to authenticated;
grant execute on function public.admin_link_erneuern(bigint)               to authenticated;
grant execute on function public.admin_einstellungen_speichern(text, text) to authenticated;

revoke all on all tables in schema urlaub from public, anon, authenticated;
