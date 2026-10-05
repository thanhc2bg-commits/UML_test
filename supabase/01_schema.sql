-- =========================================================================
-- 01_schema.sql — Cấu trúc dữ liệu cho dự án ui-prototype (UML Test)
-- Tài liệu tham chiếu: SUPABASE_SETUP.md mục 1 và mục 2
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán toàn bộ file này > Run
-- File này IDEMPOTENT: chạy lại nhiều lần vẫn an toàn, không mất dữ liệu.
-- Thứ tự chạy: 01_schema.sql -> 02_rls_policies.sql -> 03_constraints.sql
-- =========================================================================

create extension if not exists "uuid-ossp";

-- -------------------------------------------------------------------------
-- profiles: thông tin người dùng và vai trò student / admin
-- -------------------------------------------------------------------------
create table if not exists public.profiles (
    id           uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    role         text check (role in ('admin', 'student')) default 'student'
);

-- -------------------------------------------------------------------------
-- quiz_results: một dòng tổng kết cho mỗi lần nộp quiz
-- details chứa điểm của từng câu, ví dụ { "q1": 8, "q2": 0 }
-- -------------------------------------------------------------------------
create table if not exists public.quiz_results (
    id         uuid primary key default uuid_generate_v4(),
    user_id    uuid not null references public.profiles(id) on delete cascade,
    lesson_id  text not null,
    score      integer not null check (score between 0 and 100),
    details    jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- attempts: chi tiết câu trả lời của từng câu
-- question_id lưu theo dạng "<lessonId>:<questionId>" ví dụ "uc-m1-b1:q1"
-- vì nhiều bài học có thể cùng dùng ID câu hỏi "q1".
-- -------------------------------------------------------------------------
create table if not exists public.attempts (
    id          uuid primary key default uuid_generate_v4(),
    user_id     uuid not null references public.profiles(id) on delete cascade,
    question_id text not null,
    is_correct  boolean not null,
    answer      text not null default '',
    created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- lesson_progress: các bài học người dùng đã hoàn thành
-- -------------------------------------------------------------------------
create table if not exists public.lesson_progress (
    id         uuid primary key default uuid_generate_v4(),
    user_id    uuid not null references public.profiles(id) on delete cascade,
    lesson_id  text not null,
    created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- study_sessions: thời gian học của người dùng
-- -------------------------------------------------------------------------
create table if not exists public.study_sessions (
    id               uuid primary key default uuid_generate_v4(),
    user_id          uuid not null references public.profiles(id) on delete cascade,
    started_at       timestamptz not null default now(),
    last_heartbeat   timestamptz not null default now(),
    duration_seconds integer not null default 0
);

-- -------------------------------------------------------------------------
-- Index để truy vấn nhanh (idempotent)
-- -------------------------------------------------------------------------
create index if not exists quiz_results_user_lesson_idx
    on public.quiz_results (user_id, lesson_id, created_at desc);
create index if not exists attempts_user_idx
    on public.attempts (user_id, created_at desc);
create index if not exists attempts_user_question_idx
    on public.attempts (user_id, question_id);
create index if not exists lesson_progress_user_idx
    on public.lesson_progress (user_id);
create index if not exists study_sessions_user_idx
    on public.study_sessions (user_id, last_heartbeat desc);
-- =========================================================================
-- HÀM HỖ TRỢ
-- =========================================================================

-- SECURITY DEFINER để bỏ qua RLS khi kiểm tra bảng profiles
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles
        where id = auth.uid() and role = 'admin'
    );
$$;

-- Tự động tạo profile khi có user mới đăng ký trong auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, display_name, role)
    values (new.id, new.raw_user_meta_data ->> 'display_name', 'student')
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- Ngăn học sinh tự đổi role của chính mình qua API
create or replace function public.prevent_role_update()
returns trigger
language plpgsql
as $$
begin
    if new.role <> old.role then
        -- Bỏ qua khi chạy trực tiếp từ SQL Editor (auth.uid() = NULL)
        if auth.uid() is null then
            return new;
        end if;
        if not public.is_admin() then
            raise exception 'Chỉ admin mới được phép thay đổi quyền (role).';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists prevent_student_role_update on public.profiles;
create trigger prevent_student_role_update
    before update on public.profiles
    for each row execute procedure public.prevent_role_update();
-- =========================================================================
-- VIEW TỔNG HỢP CHO ADMIN
-- security_invoker = true để áp dụng RLS của các bảng gốc.
-- Tách subquery để tránh bị nhân dòng.
-- =========================================================================
-- PostgreSQL không cho CREATE OR REPLACE VIEW đổi tên cột theo vị trí.
-- Xóa riêng view trước khi tạo lại để script có thể cập nhật cấu trúc view.
drop view if exists public.admin_user_stats;

create or replace view public.admin_user_stats
with (security_invoker = true) as
select
    p.id as user_id,
    p.display_name,
    p.role,
    coalesce(q_stats.total_quizzes, 0) as total_quizzes,
    coalesce(q_stats.best_score, 0) as best_score,
    coalesce(a_stats.total_attempts, 0) as total_attempts,
    coalesce(a_stats.success_rate_percent, 0) as success_rate_percent,
    coalesce(ss_stats.total_study_seconds, 0) as total_study_seconds,
    ss_stats.last_active
from public.profiles p
left join (
    select user_id, count(id) as total_quizzes, max(score) as best_score
    from public.quiz_results
    group by user_id
) q_stats on p.id = q_stats.user_id
left join (
    select
        user_id,
        count(id) as total_attempts,
        sum(case when is_correct then 1 else 0 end)::float
            / nullif(count(id), 0) * 100 as success_rate_percent
    from public.attempts
    group by user_id
) a_stats on p.id = a_stats.user_id
left join (
    select
        user_id,
        sum(duration_seconds) as total_study_seconds,
        max(last_heartbeat) as last_active
    from public.study_sessions
    group by user_id
) ss_stats on p.id = ss_stats.user_id;

revoke all on public.admin_user_stats from anon;
grant select on public.admin_user_stats to authenticated;

-- =========================================================================
-- GÁN QUYỀN ADMIN (chạy riêng trong SQL Editor, thay UUID thật)
-- =========================================================================
-- update public.profiles
-- set role = 'admin'
-- where id = '<thay-uuid-nguoi-dung-vao-day>';