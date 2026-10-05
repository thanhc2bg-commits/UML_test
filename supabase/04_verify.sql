-- =========================================================================
-- 04_verify.sql — Kiểm tra sau khi cấu hình
-- Tài liệu tham chiếu: SUPABASE_SETUP.md mục 2, 9, 15
--
-- CÁCH DÙNG:
-- - Các truy vấn "kiểm tra" chạy ngay trong SQL Editor sau khi đã chạy
--   01_schema.sql, 02_rls_policies.sql, 03_constraints.sql.
-- - Các truy vấn "sau khi nộp bài" cần chạy trong SQL Editor với một user
--   đã đăng nhập, hoặc thay <user-id> bằng UUID của user test.
-- =========================================================================

-- -------------------------------------------------------------------------
-- A. Phải thấy đủ 5 bảng
-- -------------------------------------------------------------------------
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles',
    'quiz_results',
    'attempts',
    'lesson_progress',
    'study_sessions'
  )
order by table_name;

-- -------------------------------------------------------------------------
-- B. Cấu trúc chính của quiz_results / attempts / lesson_progress
-- -------------------------------------------------------------------------
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('quiz_results', 'attempts', 'lesson_progress')
order by table_name, ordinal_position;

-- -------------------------------------------------------------------------
-- C. RLS phải bật cho cả 5 bảng (relrowsecurity = true)
-- -------------------------------------------------------------------------
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles', 'quiz_results', 'attempts', 'lesson_progress', 'study_sessions'
  )
order by c.relname;

-- -------------------------------------------------------------------------
-- D. Danh sách policy đang tồn tại
-- -------------------------------------------------------------------------
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- -------------------------------------------------------------------------
-- E. Constraint chống trùng tiến độ (phải có 1 dòng)
-- -------------------------------------------------------------------------
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.lesson_progress'::regclass;

-- =========================================================================
-- SAU KHI NỘP BÀI (cần đăng nhập để auth.uid() khác NULL)
-- Chạy: http://127.0.0.1:5500/ui-prototype/index.html
--       -> #/quiz/uc-m1-b1 -> chọn đáp án -> Nộp bài
-- =========================================================================

select *
from public.quiz_results
where user_id = auth.uid()
order by created_at desc
limit 10;

select *
from public.attempts
where user_id = auth.uid()
order by created_at desc
limit 30;

select *
from public.lesson_progress
where user_id = auth.uid()
order by created_at desc;

-- Thống kê nhanh theo bài học
select
    lesson_id,
    count(*) as so_lan,
    max(score) as diem_cao_nhat,
    max(created_at) as lan_cuoi
from public.quiz_results
where user_id = auth.uid()
group by lesson_id
order by lesson_id;