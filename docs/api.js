// Verbindung zu Supabase (REST). Fehler werden als Error mit dem Fehlercode der
// Datenbank (z. B. "LINK_UNGUELTIG") oder "KEINE_VERBINDUNG" geworfen.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

async function anfrage(pfad, body, token) {
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  // Angemeldet: Sitzungs-Token. Sonst: alte "anon"-Schlüssel sind JWTs und gehen
  // zusätzlich als Bearer mit; neue "publishable"-Schlüssel nur als apikey.
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  let antwort;
  try {
    antwort = await fetch(`${SUPABASE_URL}${pfad}`, {
      method: 'POST', headers, body: JSON.stringify(body),
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new Error('KEINE_VERBINDUNG');
  }
  const inhalt = antwort.status === 204 ? null : await antwort.json().catch(() => null);
  if (!antwort.ok) {
    const fehler = new Error(inhalt?.message || `HTTP_${antwort.status}`);
    fehler.status = antwort.status;
    throw fehler;
  }
  return inhalt;
}

export function rpc(funktion, parameter = {}, token = null) {
  return anfrage(`/rest/v1/rpc/${funktion}`, parameter, token);
}

export function anmelden(email, passwort) {
  return anfrage('/auth/v1/token?grant_type=password', { email, password: passwort });
}

export function erneuern(refreshToken) {
  return anfrage('/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshToken });
}

export function abmeldenServer(token) {
  return anfrage('/auth/v1/logout', {}, token);
}
