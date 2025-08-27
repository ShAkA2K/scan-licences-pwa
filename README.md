# Scan Licences – Correctif définitif (React + Vite + Supabase)

## 0) Prérequis
- Node 18+
- Un projet Supabase

## 1) Configuration Auth Supabase
**Authentication → Providers → Email**
- Email: ON
- Magic Link: ON
- Email OTP: ON
- Allow new users to sign up: ON

**Authentication → URL Configuration**
- Site URL: `http://localhost:5173`
- Additional Redirect URLs: `http://localhost:5173`, `http://127.0.0.1:5173`

(En prod, ajoute l'URL de ton déploiement.)

## 2) Schéma SQL (définitif)
Exécute ce bloc dans Supabase → SQL Editor :

```sql
-- Tables
create table if not exists public.sessions (
  id uuid primary key,
  date date not null unique
);

create table if not exists public.members (
  licence_no text primary key,
  first_name text,
  last_name text,
  valid_until date
);

create table if not exists public.entries (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  licence_no text not null references public.members(licence_no),
  "timestamp" timestamptz not null default now(),
  range_lane text,
  valid_flag boolean,
  entry_day date generated always as ( ("timestamp" at time zone 'Europe/Paris')::date ) stored
);

-- Unicité journalière par session et licence
create unique index if not exists entries_unique_session_licence_day
  on public.entries (session_id, licence_no, entry_day);

-- RLS
alter table public.sessions enable row level security;
alter table public.entries  enable row level security;
alter table public.members  enable row level security;

-- Policies
drop policy if exists sessions_select_auth  on public.sessions;
drop policy if exists sessions_insert_auth  on public.sessions;
drop policy if exists sessions_update_auth  on public.sessions;
drop policy if exists sessions_delete_auth  on public.sessions;
create policy sessions_select_auth  on public.sessions for select to authenticated using (true);
create policy sessions_insert_auth  on public.sessions for insert to authenticated with check (true);
create policy sessions_update_auth  on public.sessions for update to authenticated using (true) with check (true);
create policy sessions_delete_auth  on public.sessions for delete to authenticated using (true);

drop policy if exists entries_select_auth  on public.entries;
drop policy if exists entries_insert_auth  on public.entries;
drop policy if exists entries_update_auth  on public.entries;
drop policy if exists entries_delete_auth  on public.entries;
create policy entries_select_auth  on public.entries for select to authenticated using (true);
create policy entries_insert_auth  on public.entries for insert to authenticated with check (true);
create policy entries_update_auth  on public.entries for update to authenticated using (true) with check (true);
create policy entries_delete_auth  on public.entries for delete to authenticated using (true);

drop policy if exists members_select_auth on public.members;
create policy members_select_auth on public.members for select to authenticated using (true);
```

*(Remarque: on génère les `id` côté client avec `crypto.randomUUID()` donc pas besoin d'extensions Postgres.)*

## 3) Installer et lancer l'app
```bash
npm install
cp .env.example .env    # puis colle tes valeurs Supabase
npm run dev
```

## 4) Connexion (OTP recommandé)
- Saisis ton email, clique "Recevoir lien / code".
- Si l'email contient un **code**, saisis-le et "Valider le code".
- Sinon ouvre le **lien magique** dans **le même navigateur/onglet**.

## 5) Utilisation
- Clique "Ouvrir la session du jour" (ou elle s'ouvrira automatiquement après login).
- Colle l'URL du QR (ex: itac.pro/F.aspx?...&C=E17F6A39) puis **Ajouter**.

**Résultats possibles** :
- ✅ OK → entrée créée
- 🟧 Doublon → déjà enregistré aujourd’hui
- 🟥 Membre introuvable → ajoute d'abord le membre :
  ```sql
  insert into public.members (licence_no, first_name, last_name, valid_until)
  values ('E17F6A39','Prenom','Nom','2026-12-31')
  on conflict (licence_no) do nothing;
  ```

## 6) Déploiement (prod)
- Vercel / Netlify : définir `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans les variables d'env.
- Supabase Auth → URL Configuration : ajoute ton domaine public.
- RLS: garde les policies ci-dessus pour n'autoriser que les utilisateurs connectés.
```

