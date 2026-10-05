// Gemeinsamer Aufbau für alle Datenbanktests: PGlite mit nachgebildeten
// Supabase-Rollen, Standardrechten, auth.uid() und auth.users.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const SCHEMA = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
export const SCHEMA_V1 = readFileSync(new URL('./fixtures/schema-v1.sql', import.meta.url), 'utf8');

export async function neueDatenbank({ schema = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    create schema auth;
    grant usage on schema auth to anon, authenticated, supabase_auth_admin;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique not null,
      raw_user_meta_data jsonb not null default '{}'
    );
    grant select, insert on auth.users to supabase_auth_admin;
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
  `);
  if (schema) {
    await db.exec(SCHEMA);
    await db.exec(SCHEMA); // erneutes Ausführen muss unschädlich sein
  }
  return db;
}

// Führt SQL als Rolle aus, wie PostgREST es mit einem JWT tut.
export async function als(db, rolle, nutzer, sql, params = []) {
  await db.exec(`set role ${rolle}`);
  await db.query("select set_config('request.jwt.claims', $1, false)",
    [nutzer ? JSON.stringify({ sub: nutzer, role: rolle }) : '']);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

export const browser = (db, sql, params) => als(db, 'anon', null, sql, params);

export async function organisator(db, benutzername, { hauptadmin = false, gesperrt = false } = {}) {
  const r = await db.query(
    `insert into urlaub.organisatoren (user_id, anzeigename, benutzername, ist_hauptadmin, gesperrt)
     values (gen_random_uuid(), $1, $1, $2, $3) returning user_id`, [benutzername, hauptadmin, gesperrt]);
  return r.rows[0].user_id;
}

export async function umfrageAnlegen(db, organisatorId,
  { titel = 'Urlaubswünsche 2027', jahr = 2027, bundesland = 'BY', frist = "now() + interval '1 day'" } = {}) {
  const r = await db.query(
    `insert into urlaub.umfragen (organisator_id, titel, jahr, bundesland, frist)
     values ($1, $2, $3, $4, ${frist}) returning id`, [organisatorId, titel, jahr, bundesland]);
  return r.rows[0].id;
}

// Legt ein Konto so an, wie Supabase es bei /auth/v1/signup tut (Rolle supabase_auth_admin).
export async function registriere(db, benutzername, einladung, anzeigename = benutzername) {
  await db.exec('set role supabase_auth_admin');
  try {
    const r = await db.query(
      'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
      [`${benutzername}@example.com`, JSON.stringify({ einladung, anzeigename })]);
    return r.rows[0].id;
  } finally {
    await db.exec('reset role');
  }
}
