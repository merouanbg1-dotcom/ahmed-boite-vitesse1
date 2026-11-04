/* =====================================================================
   CONFIGURATION — à remplir une seule fois
   Supabase › Project Settings › API :
     - "Project URL"            → supabaseUrl
     - "anon public" (API key)  → supabaseAnonKey
   (La clé "anon" est faite pour être publique : la sécurité est assurée
    par les règles RLS du fichier supabase/schema.sql.
    Ne mettez JAMAIS la clé "service_role" ici.)
   ===================================================================== */
window.ABV_CONFIG = {
  supabaseUrl: 'https://VOTRE-PROJET.supabase.co',
  supabaseAnonKey: 'VOTRE_CLE_ANON',
  /* Adresse du site une fois en ligne (sert aux liens de suivi envoyés aux clients) */
  siteUrl: 'https://ahmed-boite-vitesse.vercel.app'
};
