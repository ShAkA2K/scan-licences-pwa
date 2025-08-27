# Patch: valid_until + photo (Edge Function)

## 1) Colonnes supplémentaires (si absentes)
```sql
alter table public.members add column if not exists valid_until date;
alter table public.members add column if not exists season_label text;
alter table public.members add column if not exists photo_url text;
```

## 2) Déployer l'Edge Function (itac_profile)
- Installer le CLI si besoin : https://supabase.com/docs/guides/cli
```bash
supabase functions deploy itac_profile
```
*(aucun secret requis, la fonction ne touche pas au Storage — elle ne fait que parser la page et renvoyer du JSON).*

## 3) App: config (optionnel)
Dans `.env`, tu peux ajuster la fin de saison (par défaut 31 août) :
```
VITE_SEASON_END_MONTH=8
VITE_SEASON_END_DAY=31
```

## 4) Utilisation
- L'app tentera d'abord l'**Edge Function** (photo incluse).  
- Si indisponible, elle bascule sur le **proxy texte** (sans photo).
- `valid_until` est calculé automatiquement à partir du libellé de saison : fin du mois/jour configuré de la 2e année.

## 5) RLS (rappel)
Assure-toi d'avoir :
```sql
create policy members_select_auth on public.members for select to authenticated using (true);
create policy members_insert_auth on public.members for insert  to authenticated with check (true);
create policy members_update_auth on public.members for update  to authenticated using (true) with check (true);
```
