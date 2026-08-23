-- GBEKOR SHS LMS DATABASE SETUP
-- Run this entire script in Supabase Dashboard > SQL Editor > New Query

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('student','teacher','admin')),
  created_at timestamptz default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  teacher_name text,
  lesson_count integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  progress numeric default 0 check (progress >= 0 and progress <= 100),
  unique(student_id, course_id)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  title text not null,
  instructions text,
  due_date timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.assignments(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  file_path text,
  status text default 'submitted',
  submitted_at timestamptz default now()
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  title text not null,
  pass_mark numeric default 50,
  created_at timestamptz default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references public.quizzes(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  score numeric not null,
  percentage numeric not null,
  attempted_at timestamptz default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  author_id uuid references public.profiles(id) on delete set null,
  audience text default 'all',
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.enrollments enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.announcements enable row level security;

-- Simple starter policies
drop policy if exists "profiles own read" on public.profiles;
create policy "profiles own read" on public.profiles for select to authenticated
using (id = auth.uid() or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));

drop policy if exists "courses authenticated read" on public.courses;
create policy "courses authenticated read" on public.courses for select to authenticated using (true);

drop policy if exists "enrollments own read" on public.enrollments;
create policy "enrollments own read" on public.enrollments for select to authenticated
using (student_id = auth.uid() or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('teacher','admin')));

drop policy if exists "submissions own insert" on public.submissions;
create policy "submissions own insert" on public.submissions for insert to authenticated
with check (student_id = auth.uid());

drop policy if exists "submissions own read" on public.submissions;
create policy "submissions own read" on public.submissions for select to authenticated
using (student_id = auth.uid() or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('teacher','admin')));

drop policy if exists "quiz attempts own insert" on public.quiz_attempts;
create policy "quiz attempts own insert" on public.quiz_attempts for insert to authenticated
with check (student_id = auth.uid());

drop policy if exists "quiz attempts own read" on public.quiz_attempts;
create policy "quiz attempts own read" on public.quiz_attempts for select to authenticated
using (student_id = auth.uid() or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('teacher','admin')));

drop policy if exists "announcements authenticated read" on public.announcements;
create policy "announcements authenticated read" on public.announcements for select to authenticated using (true);

drop policy if exists "announcements staff insert" on public.announcements;
create policy "announcements staff insert" on public.announcements for insert to authenticated
with check (author_id = auth.uid() and exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('teacher','admin')));

-- Assignment file storage
insert into storage.buckets (id, name, public) values ('assignment-files','assignment-files',false)
on conflict (id) do nothing;

drop policy if exists "students upload own assignment files" on storage.objects;
create policy "students upload own assignment files"
on storage.objects for insert to authenticated
with check (bucket_id='assignment-files' and (storage.foldername(name))[1]=auth.uid()::text);

-- Sample courses
insert into public.courses (title, description, teacher_name, lesson_count)
select * from (values
('Information & Communication Technology','ICT theory and practical skills','Mr. Dennis Adzabe',12),
('Core Mathematics','Mathematics learning materials and assessments','Mathematics Department',18),
('English Language','Language and communication skills','English Department',14),
('Integrated Science','Scientific concepts and practical work','Science Department',16)
) as v(title,description,teacher_name,lesson_count)
where not exists (select 1 from public.courses limit 1);

-- IMPORTANT:
-- Create users first in Supabase Authentication > Users.
-- Then insert their profile using the user's Auth UUID, for example:
-- insert into public.profiles (id, full_name, role)
-- values ('PASTE_AUTH_USER_UUID_HERE', 'Dennis Adzabe', 'teacher');
