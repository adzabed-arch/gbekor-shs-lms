# Login Fix

1. In Supabase, open SQL Editor.
2. Open `supabase_account_policies.sql` and run the complete script.
3. In Supabase Authentication > Providers > Email, disable **Confirm email** if you want new users to sign in immediately after creating an account.
4. Replace the old `index.html` in GitHub with this new version.
5. For sign-in, users must first select Student, Teacher, or Administrator, then enter the email and password used when creating the account.

Important: If an old account was created before the SQL trigger was installed, this updated version can repair its LMS profile after a successful login.
