-- =====================================================================
--  Ahmed Boîte Vitesse — schéma Supabase
--  À coller en entier dans Supabase › SQL Editor › New query › Run
--  (on peut le relancer : il ne casse pas ce qui existe déjà)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Administrateurs
--    Un utilisateur Supabase Auth devient admin quand son id est ici.
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Normalise un numéro de téléphone : garde les 9 derniers chiffres
create or replace function public.norm_phone(p text)
returns text
language sql immutable
as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9);
$$;

-- ---------------------------------------------------------------------
-- 2. Rendez-vous (envoyés par le site public)
-- ---------------------------------------------------------------------
create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  services      text[] not null default '{}',
  box_type      text not null default 'nsp' check (box_type in ('man','auto','dsg','cvt','nsp')),
  brand         text,
  model         text,
  year          text,
  notes         text,
  workshop      text not null default 'om' check (workshop in ('om','bo')),
  appt_date     date not null,
  appt_time     time not null,
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  phone         text not null check (char_length(phone) between 6 and 30),
  lang          text not null default 'fr' check (lang in ('fr','ar','en')),
  status        text not null default 'nouveau' check (status in ('nouveau','confirme','annule','termine')),
  admin_note    text,
  repair_id     uuid
);
create index if not exists appointments_date_idx on public.appointments (appt_date, appt_time);
create index if not exists appointments_status_idx on public.appointments (status);

-- ---------------------------------------------------------------------
-- 3. Dossiers de réparation (suivi client)
--    step : 0 reçu · 1 diagnostic · 2 devis à valider · 3 réparation
--           4 contrôle & essai · 5 prêt à récupérer · 6 rendu
-- ---------------------------------------------------------------------
create sequence if not exists public.repair_code_seq start 1001;

create table if not exists public.repairs (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique default ('ABV-' || nextval('public.repair_code_seq')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  appointment_id uuid references public.appointments(id) on delete set null,
  customer_name  text not null,
  phone          text not null,
  brand          text,
  model          text,
  box_type       text not null default 'nsp' check (box_type in ('man','auto','dsg','cvt','nsp')),
  workshop       text not null default 'om' check (workshop in ('om','bo')),
  step           int  not null default 0 check (step between 0 and 6),
  diagnosis      text,
  quote_amount   numeric(12,2),
  quote_status   text not null default 'aucun' check (quote_status in ('aucun','en_attente','valide','refuse')),
  internal_note  text
);
create index if not exists repairs_step_idx on public.repairs (step);

do $$ begin
  alter table public.appointments
    add constraint appointments_repair_fk foreign key (repair_id) references public.repairs(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Historique visible par le client
create table if not exists public.repair_events (
  id         bigint generated always as identity primary key,
  repair_id  uuid not null references public.repairs(id) on delete cascade,
  created_at timestamptz not null default now(),
  step       int,
  message    text
);
create index if not exists repair_events_repair_idx on public.repair_events (repair_id, created_at);

-- updated_at automatique + événement à chaque changement d'étape
create or replace function public.repairs_before_update()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.repairs_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.repair_events (repair_id, step, message) values (new.id, new.step, null);
  elsif new.step is distinct from old.step then
    insert into public.repair_events (repair_id, step, message) values (new.id, new.step, null);
  end if;
  return new;
end $$;

drop trigger if exists repairs_bu on public.repairs;
create trigger repairs_bu before update on public.repairs
  for each row execute function public.repairs_before_update();

drop trigger if exists repairs_ai on public.repairs;
create trigger repairs_ai after insert or update on public.repairs
  for each row execute function public.repairs_after_change();

-- ---------------------------------------------------------------------
-- 4. Pièces (catalogue du site)
-- ---------------------------------------------------------------------
create table if not exists public.parts (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category   text not null check (category in ('emb','man','auto','dsg','cvt','oil','sens','full')),
  name_fr    text not null,
  name_ar    text,
  name_en    text,
  photo_url  text,
  in_stock   boolean not null default true,
  price      numeric(12,2),          -- prix interne (jamais affiché sur le site)
  active     boolean not null default true,
  sort       int not null default 100
);
create index if not exists parts_cat_idx on public.parts (category, sort);

-- Vue publique sans le prix
create or replace view public.parts_public
with (security_invoker = true) as
  select id, category, name_fr, name_ar, name_en, photo_url, in_stock, sort
  from public.parts where active;

-- ---------------------------------------------------------------------
-- 5. Sécurité (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.admins        enable row level security;
alter table public.appointments  enable row level security;
alter table public.repairs       enable row level security;
alter table public.repair_events enable row level security;
alter table public.parts         enable row level security;

drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- RDV : le public peut seulement CRÉER un RDV « nouveau » ; l'admin fait tout
drop policy if exists appt_public_insert on public.appointments;
create policy appt_public_insert on public.appointments for insert to anon, authenticated
  with check (status = 'nouveau' and admin_note is null and repair_id is null and appt_date >= current_date);
drop policy if exists appt_admin_all on public.appointments;
create policy appt_admin_all on public.appointments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Dossiers et historique : admin seulement (le client passe par les fonctions ci-dessous)
drop policy if exists repairs_admin_all on public.repairs;
create policy repairs_admin_all on public.repairs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists events_admin_all on public.repair_events;
create policy events_admin_all on public.repair_events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Pièces : lecture publique des pièces actives, écriture admin
drop policy if exists parts_public_read on public.parts;
create policy parts_public_read on public.parts for select to anon, authenticated using (active or public.is_admin());
drop policy if exists parts_admin_write on public.parts;
create policy parts_admin_write on public.parts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Le prix ne doit pas être lisible par le public : on retire la colonne au rôle anon
revoke select on public.parts from anon;
grant select (id, category, name_fr, name_ar, name_en, photo_url, in_stock, active, sort) on public.parts to anon;
grant select on public.parts_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Fonctions pour le client (suivi par code + téléphone)
-- ---------------------------------------------------------------------
create or replace function public.track_repair(p_code text, p_phone text)
returns json
language plpgsql stable security definer set search_path = public
as $$
declare r public.repairs; ev json;
begin
  select * into r from public.repairs
   where upper(code) = upper(trim(p_code)) and norm_phone(phone) = norm_phone(p_phone);
  if not found then return null; end if;
  select coalesce(json_agg(json_build_object('step', step, 'message', message, 'at', created_at) order by created_at), '[]'::json)
    into ev from public.repair_events where repair_id = r.id;
  return json_build_object(
    'code', r.code, 'brand', r.brand, 'model', r.model, 'box_type', r.box_type, 'workshop', r.workshop,
    'step', r.step, 'diagnosis', r.diagnosis, 'quote_amount', r.quote_amount, 'quote_status', r.quote_status,
    'updated_at', r.updated_at, 'events', ev);
end $$;

create or replace function public.approve_quote(p_code text, p_phone text)
returns boolean
language plpgsql volatile security definer set search_path = public
as $$
declare rid uuid;
begin
  update public.repairs set quote_status = 'valide', step = greatest(step, 3)
   where upper(code) = upper(trim(p_code)) and norm_phone(phone) = norm_phone(p_phone)
     and quote_status = 'en_attente'
  returning id into rid;
  if rid is null then return false; end if;
  insert into public.repair_events (repair_id, step, message) values (rid, null, 'devis_valide_client');
  return true;
end $$;

revoke all on function public.track_repair(text, text) from public;
revoke all on function public.approve_quote(text, text) from public;
grant execute on function public.track_repair(text, text) to anon, authenticated;
grant execute on function public.approve_quote(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Temps réel (l'admin reçoit les changements en direct)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['appointments','repairs','repair_events','parts'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

-- Les mises à jour envoient aussi l'ancienne ligne (utile pour les alertes de l'admin)
alter table public.repairs replica identity full;
alter table public.appointments replica identity full;

-- ---------------------------------------------------------------------
-- 8. Photos des pièces (Storage)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('parts', 'parts', true)
on conflict (id) do nothing;

drop policy if exists parts_photos_read on storage.objects;
create policy parts_photos_read on storage.objects for select to anon, authenticated using (bucket_id = 'parts');
drop policy if exists parts_photos_write on storage.objects;
create policy parts_photos_write on storage.objects for insert to authenticated with check (bucket_id = 'parts' and public.is_admin());
drop policy if exists parts_photos_update on storage.objects;
create policy parts_photos_update on storage.objects for update to authenticated using (bucket_id = 'parts' and public.is_admin());
drop policy if exists parts_photos_delete on storage.objects;
create policy parts_photos_delete on storage.objects for delete to authenticated using (bucket_id = 'parts' and public.is_admin());

-- ---------------------------------------------------------------------
-- 9. Catalogue de départ (seulement si la table est vide)
-- ---------------------------------------------------------------------
insert into public.parts (category, name_fr, name_ar, name_en, sort)
select * from (values
  ('emb','Kit d''embrayage (disque + mécanisme + butée)','طقم أمبرياج (ديسك + ميكانيزم + بوتي)','Clutch kit (disc + cover + bearing)',1),
  ('emb','Volant moteur bimasse','فولون مزدوج الكتلة','Dual-mass flywheel',2),
  ('emb','Butée hydraulique','بوتي هيدروليكية','Hydraulic release bearing',3),
  ('emb','Émetteur et récepteur d''embrayage','مضخة وأسطوانة الأمبرياج','Clutch master & slave cylinder',4),
  ('emb','Câble d''embrayage','كابل الأمبرياج','Clutch cable',5),
  ('man','Synchroniseurs','السانكرو','Synchronisers',10),
  ('man','Pignons et arbres','المسننات والأعمدة','Gears and shafts',11),
  ('man','Roulements de boîte','رولمان العلبة','Gearbox bearings',12),
  ('man','Fourchettes et baladeurs','الشوكات','Shift forks and sleeves',13),
  ('man','Joints spi et kit joints','جوانات وطقم جوانات','Oil seals and gasket kit',14),
  ('man','Différentiel','الديفيرونسيال','Differential',15),
  ('auto','Convertisseur de couple','محول العزم (كونفرتيسور)','Torque converter',20),
  ('auto','Bloc hydraulique (corps de valve)','البلوك الهيدروليكي','Valve body',21),
  ('auto','Électrovannes (solénoïdes)','الصمامات الكهربائية (سولونويد)','Solenoids',22),
  ('auto','Pompe à huile de boîte','مضخة زيت العلبة','Transmission oil pump',23),
  ('auto','Kit disques et garnitures','طقم الديسكات','Friction and steel plate kit',24),
  ('auto','Calculateur de boîte (TCU)','كمبيوتر العلبة (TCU)','Transmission control unit (TCU)',25),
  ('auto','Kit de révision (joints, segments)','طقم التجديد (جوانات وسيغمان)','Overhaul kit (seals, rings)',26),
  ('dsg','Bloc mécatronique','بلوك الميكاترونيك','Mechatronic unit',30),
  ('dsg','Double embrayage DSG','أمبرياج مزدوج DSG','DSG dual clutch',31),
  ('dsg','Accumulateur de pression','خزان الضغط','Pressure accumulator',32),
  ('cvt','Courroie / chaîne CVT','سير / سلسلة CVT','CVT belt / chain',40),
  ('cvt','Poulies CVT','بكرات CVT','CVT pulleys',41),
  ('oil','Huile ATF (boîte automatique)','زيت ATF (أوتوماتيك)','ATF oil (automatic)',50),
  ('oil','Huile DSG','زيت DSG','DSG oil',51),
  ('oil','Huile CVT','زيت CVT','CVT fluid',52),
  ('oil','Huile boîte manuelle (75W80 / 75W90)','زيت العلبة العادية (75W80 / 75W90)','Manual gearbox oil (75W80 / 75W90)',53),
  ('oil','Filtre de boîte + joint de carter','فلتر العلبة + جوان الكارتير','Transmission filter + pan gasket',54),
  ('sens','Capteur de vitesse','حساس السرعة','Speed sensor',60),
  ('sens','Contacteur de position (sélecteur)','حساس وضعية السيليكتور','Range / position switch',61),
  ('sens','Câbles et commande de vitesses','كابلات وتحكم السرعات','Gear shift cables and linkage',62),
  ('sens','Support de boîte','سوبور العلبة','Gearbox mount',63),
  ('full','Boîte automatique complète','علبة أوتوماتيكية كاملة','Complete automatic gearbox',70),
  ('full','Boîte manuelle complète','علبة عادية كاملة','Complete manual gearbox',71),
  ('full','Boîte DSG complète','علبة DSG كاملة','Complete DSG gearbox',72)
) as v(category, name_fr, name_ar, name_en, sort)
where not exists (select 1 from public.parts);

-- ---------------------------------------------------------------------
-- 10. Paramètres de l'entreprise (en-tête des factures)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id           int primary key default 1 check (id = 1),
  company_name text not null default 'Ahmed Boîte Vitesse',
  activity     text default 'Réparation et vente de pièces de boîtes de vitesses',
  address      text default 'Ouled Moussa, Boumerdès, Algérie',
  phones       text default '0550 45 25 42 · 0550 05 31 29 · 0550 48 02 62',
  email        text,
  rc           text,   -- Registre du commerce
  nif          text,   -- Numéro d'identification fiscale
  nis          text,   -- Numéro d'identification statistique
  ai           text,   -- Article d'imposition
  rib          text,   -- Compte bancaire / CCP
  default_tva  numeric(5,2) not null default 19,
  footer_note  text default 'Merci pour votre confiance.',
  updated_at   timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;
alter table public.settings enable row level security;
drop policy if exists settings_admin_all on public.settings;
create policy settings_admin_all on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 11. Factures  (numéro automatique : FAC-2026-0001, remis à 1 chaque année)
-- ---------------------------------------------------------------------
create table if not exists public.invoice_counters (
  year int primary key,
  last int not null default 0
);
alter table public.invoice_counters enable row level security;

create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  number           text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  invoice_date     date not null default current_date,
  repair_id        uuid references public.repairs(id) on delete set null,
  customer_name    text not null,
  customer_phone   text,
  customer_address text,
  customer_tax_id  text,
  vehicle          text,
  items            jsonb not null default '[]'::jsonb,  -- [{label, qty, unit_price}]
  discount         numeric(12,2) not null default 0,
  tva_rate         numeric(5,2) not null default 19,
  stamp_duty       numeric(12,2) not null default 0,     -- droit de timbre (si payé en espèces)
  total_ht         numeric(12,2) not null default 0,
  total_tva        numeric(12,2) not null default 0,
  total_ttc        numeric(12,2) not null default 0,
  payment_method   text not null default 'especes' check (payment_method in ('especes','cheque','virement','ccp','autre')),
  status           text not null default 'impayee' check (status in ('impayee','payee','annulee')),
  notes            text
);
create index if not exists invoices_date_idx on public.invoices (invoice_date desc);

create or replace function public.invoices_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare y int; n int; sub numeric;
begin
  if tg_op = 'INSERT' and (new.number is null or new.number = '') then
    y := extract(year from coalesce(new.invoice_date, current_date))::int;
    insert into public.invoice_counters (year, last) values (y, 1)
      on conflict (year) do update set last = public.invoice_counters.last + 1
      returning last into n;
    new.number := 'FAC-' || y || '-' || lpad(n::text, 4, '0');
  end if;
  -- les totaux sont toujours recalculés ici (on ne fait pas confiance au navigateur)
  select coalesce(sum(round((coalesce((x->>'qty')::numeric, 0) * coalesce((x->>'unit_price')::numeric, 0)), 2)), 0)
    into sub from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) x;
  new.total_ht  := greatest(sub - coalesce(new.discount, 0), 0);
  new.total_tva := round(new.total_ht * coalesce(new.tva_rate, 0) / 100, 2);
  new.total_ttc := new.total_ht + new.total_tva + coalesce(new.stamp_duty, 0);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists invoices_bw on public.invoices;
create trigger invoices_bw before insert or update on public.invoices
  for each row execute function public.invoices_before_write();

alter table public.invoices enable row level security;
drop policy if exists invoices_admin_all on public.invoices;
create policy invoices_admin_all on public.invoices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

do $$ begin
  begin execute 'alter publication supabase_realtime add table public.invoices';
  exception when duplicate_object then null; when undefined_object then null; end;
end $$;

-- =====================================================================
-- DERNIÈRE ÉTAPE (à faire une fois) :
-- 1. Supabase › Authentication › Users › Add user (email + mot de passe)
-- 2. Puis lancez ceci en remplaçant l'email :
--
--   insert into public.admins (user_id, full_name)
--   select id, 'Ahmed' from auth.users where email = 'VOTRE_EMAIL@exemple.com';
-- =====================================================================
