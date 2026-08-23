-- Gbekor SHS LMS database schema. Run this once in the Supabase SQL Editor.
-- Authentication is handled by Supabase Auth; this script never stores passwords.
create extension if not exists pgcrypto;

create type public.user_role as enum ('student', 'teacher', 'admin');
create type public.submission_status as enum ('submitted', 'graded', 'returned');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'New user',
  email text,
  role public.user_role not null default 'student',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 160),
  description text not null default '',
  teacher_id uuid references public.profiles(id) on delete set null,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.enrollments (
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (course_id, student_id)
);
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 2 and 160),
  instructions text not null default '',
  due_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  file_path text not null,
  note text not null default '',
  status public.submission_status not null default 'submitted',
  score numeric(5,2) check (score between 0 and 100),
  feedback text not null default '',
  submitted_at timestamptz not null default now(),
  graded_at timestamptz,
  unique (assignment_id, student_id)
);
create index enrollments_student_idx on public.enrollments(student_id);
create index assignments_course_idx on public.assignments(course_id);
create index submissions_assignment_idx on public.submissions(assignment_id);

-- Every new Auth user gets a profile. Admins then change the role and name.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_active);
$$;
create or replace function public.teaches_course(course uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.courses where id = course and teacher_id = auth.uid());
$$;
create or replace function public.is_enrolled(course uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.enrollments where course_id = course and student_id = auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.enrollments enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;

create policy "profiles: own or authorised staff read" on public.profiles for select using (
  id = auth.uid() or public.is_admin() or exists (select 1 from public.enrollments e join public.courses c on c.id=e.course_id where e.student_id=profiles.id and c.teacher_id=auth.uid())
);
create policy "profiles: admins update" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

create policy "courses: authorised read" on public.courses for select using (is_published and (public.is_enrolled(id) or teacher_id=auth.uid() or public.is_admin()));
create policy "courses: staff create" on public.courses for insert with check (public.is_admin() or teacher_id=auth.uid());
create policy "courses: owner or admin update" on public.courses for update using (teacher_id=auth.uid() or public.is_admin()) with check (teacher_id=auth.uid() or public.is_admin());
create policy "courses: owner or admin delete" on public.courses for delete using (teacher_id=auth.uid() or public.is_admin());

create policy "enrollments: relevant read" on public.enrollments for select using (student_id=auth.uid() or public.teaches_course(course_id) or public.is_admin());
create policy "enrollments: admins manage" on public.enrollments for all using (public.is_admin()) with check (public.is_admin());

create policy "assignments: course members read" on public.assignments for select using (public.is_enrolled(course_id) or public.teaches_course(course_id) or public.is_admin());
create policy "assignments: course staff create" on public.assignments for insert with check (public.teaches_course(course_id) or public.is_admin());
create policy "assignments: course staff update" on public.assignments for update using (public.teaches_course(course_id) or public.is_admin()) with check (public.teaches_course(course_id) or public.is_admin());
create policy "assignments: course staff delete" on public.assignments for delete using (public.teaches_course(course_id) or public.is_admin());

create policy "submissions: owner or course staff read" on public.submissions for select using (student_id=auth.uid() or exists (select 1 from public.assignments a where a.id=assignment_id and (public.teaches_course(a.course_id) or public.is_admin())));
create policy "submissions: students submit own" on public.submissions for insert with check (student_id=auth.uid() and exists (select 1 from public.assignments a where a.id=assignment_id and public.is_enrolled(a.course_id)));
create policy "submissions: students replace own" on public.submissions for update using (student_id=auth.uid()) with check (student_id=auth.uid() and status='submitted');
create policy "submissions: course staff grade" on public.submissions for update using (exists (select 1 from public.assignments a where a.id=assignment_id and (public.teaches_course(a.course_id) or public.is_admin()))) with check (exists (select 1 from public.assignments a where a.id=assignment_id and (public.teaches_course(a.course_id) or public.is_admin())));

-- Private bucket: files are only accessible to their owner, the course teacher, or an admin.
insert into storage.buckets (id, name, public) values ('assignment-submissions', 'assignment-submissions', false) on conflict (id) do nothing;
create policy "submission files: student upload own path" on storage.objects for insert to authenticated with check (bucket_id='assignment-submissions' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "submission files: authorised view" on storage.objects for select to authenticated using (bucket_id='assignment-submissions' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin() or exists (select 1 from public.assignments a where a.id=((storage.foldername(name))[2])::uuid and public.teaches_course(a.course_id))));
