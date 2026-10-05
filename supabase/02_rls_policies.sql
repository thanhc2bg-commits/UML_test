-- =========================================================================
-- 02_rls_policies.sql — Row Level Security và policy cho người dùng
-- Tài liệu tham chiếu: SUPABASE_SETUP.md mục 3, 4, 5, 6, 7
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán toàn bộ file này > Run
-- Chạy SAU 01_schema.sql. File IDEMPOTENT nhờ "drop policy if exists".
--
-- LƯU Ý: nếu trình duyệt báo "new row violates row-level security policy"
-- thì policy insert tương ứng đang thiếu hoặc user_id không khớp phiên
-- đăng nhập.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) Bật RLS cho toàn bộ bảng
-- -------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.quiz_results    enable row level security;
alter table public.attempts        enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.study_sessions  enable row level security;

-- =========================================================================
-- 2) POLICIES CHO profiles
-- =========================================================================

-- Người dùng đọc được profile của chính mình
-- (app.js tải profile sau khi đăng nhập để lấy role và display_name)
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
    on public.profiles
    for select
    to authenticated
    using (auth.uid() = id);

-- Người dùng được tự cập nhật profile của chính mình
-- (role được bảo vệ bởi trigger prevent_student_role_update)
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
    on public.profiles
    for update
    to authenticated
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- Admin xem được tất cả profile (dọn policy cũ để tránh trùng tên)
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admin xem tat ca profiles"      on public.profiles;
create policy "Admins can read all profiles"
    on public.profiles
    for select
    to authenticated
    using (public.is_admin());

-- =========================================================================
-- 3) POLICIES CHO quiz_results
-- Không tạo policy update / delete: kết quả quiz được giữ như lịch sử.
-- =========================================================================

drop policy if exists "Users can insert their own quiz results" on public.quiz_results;
create policy "Users can insert their own quiz results"
    on public.quiz_results
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Users can read their own quiz results" on public.quiz_results;
create policy "Users can read their own quiz results"
    on public.quiz_results
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Admins can read all quiz results" on public.quiz_results;
drop policy if exists "Admin xem tat ca quiz_results"     on public.quiz_results;
create policy "Admins can read all quiz results"
    on public.quiz_results
    for select
    to authenticated
    using (public.is_admin());

-- =========================================================================
-- 4) POLICIES CHO attempts
-- question_id lưu theo dạng "uc-m1-b1:q1"
-- =========================================================================

drop policy if exists "Users can insert their own attempts" on public.attempts;
create policy "Users can insert their own attempts"
    on public.attempts
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Users can read their own attempts" on public.attempts;
create policy "Users can read their own attempts"
    on public.attempts
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Admins can read all attempts" on public.attempts;
drop policy if exists "Admin xem tat ca attempts"   on public.attempts;
create policy "Admins can read all attempts"
    on public.attempts
    for select
    to authenticated
    using (public.is_admin());
-- =========================================================================
-- 5) POLICIES CHO lesson_progress
-- =========================================================================

drop policy if exists "Users can insert their own lesson progress" on public.lesson_progress;
create policy "Users can insert their own lesson progress"
    on public.lesson_progress
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Users can read their own lesson progress" on public.lesson_progress;
create policy "Users can read their own lesson progress"
    on public.lesson_progress
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Admins can read all lesson progress" on public.lesson_progress;
drop policy if exists "Admin xem tat ca lesson_progress"     on public.lesson_progress;
create policy "Admins can read all lesson progress"
    on public.lesson_progress
    for select
    to authenticated
    using (public.is_admin());

-- =========================================================================
-- 6) POLICIES CHO study_sessions
-- =========================================================================

drop policy if exists "Users can insert their own study sessions" on public.study_sessions;
create policy "Users can insert their own study sessions"
    on public.study_sessions
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Users can read their own study sessions" on public.study_sessions;
create policy "Users can read their own study sessions"
    on public.study_sessions
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Users can update their own study sessions" on public.study_sessions;
create policy "Users can update their own study sessions"
    on public.study_sessions
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Admins can read all study sessions" on public.study_sessions;
drop policy if exists "Admin xem tat ca study_sessions"     on public.study_sessions;
create policy "Admins can read all study sessions"
    on public.study_sessions
    for select
    to authenticated
    using (public.is_admin());