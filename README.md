# Gbekor SHS Learning Portal

This rebuild keeps the original school-branded design but replaces its demo-only data with a secure, hosted LMS.

It is a static GitHub Pages application using Supabase for:

- email/password accounts and password resets;
- student, teacher, and administrator roles;
- courses, enrolments, assignments, submissions, grades and feedback;
- private assignment-file storage;
- database-enforced access rules (Row Level Security).

## Deploy it

1. Create a Supabase project at [supabase.com](https://supabase.com), open **SQL Editor**, and run [`supabase/schema.sql`](supabase/schema.sql).
2. In Supabase Authentication, configure your GitHub Pages URL as a Site URL and Redirect URL. Create the first user, then change that user's `profiles.role` to `admin` in the Table Editor.
3. Copy `config.example.js` to `config.js` and paste the project URL and **anon/publishable** key. Never use a `service_role` key in a website.
4. Create teachers and students using Supabase Authentication. The trigger adds a student profile automatically; admins update profiles to `teacher` or `admin`, create courses, and add enrolments.
5. Push this folder to a GitHub repository. In **Settings → Pages**, deploy from the `main` branch and its root folder.

## Current capabilities

Students can sign in, see only their enrolled courses, upload or replace assignment work, and see grades/feedback. Teachers can create courses and assignments and see their enrolled students and submissions. Administrators can create courses and view the user directory. All of those permissions are checked by the database, not merely hidden in the page.

## Before opening to the school

- Use school email addresses and disable public sign-up in Supabase Authentication.
- Set up email delivery for password-reset messages.
- Add a school privacy notice and backup/export process.
- Test one student, teacher, and administrator account before inviting everyone.
