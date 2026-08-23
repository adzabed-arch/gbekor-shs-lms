# Gbekor SHS LMS – Supabase Connected

## Files
- index.html — LMS with Supabase client and real email/password authentication
- supabase_setup.sql — Database, tables, policies, storage bucket and sample courses

## IMPORTANT SETUP
1. In Supabase, open SQL Editor.
2. Create a new query.
3. Open supabase_setup.sql and copy everything.
4. Paste it into the SQL Editor and click Run.
5. Go to Authentication > Users > Add user.
6. Create a student, teacher or admin email/password account.
7. Copy the new user's UUID.
8. Insert a matching row in the profiles table using the example at the bottom of the SQL file.
9. Upload index.html to GitHub and redeploy GitHub Pages.

The browser publishable key is already included. Never add a service_role or secret key to index.html.
