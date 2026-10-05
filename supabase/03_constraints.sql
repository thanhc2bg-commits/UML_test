-- =========================================================================
-- 03_constraints.sql — Ràng buộc chống lưu trùng tiến độ bài học
-- Tài liệu tham chiếu: SUPABASE_SETUP.md mục 8
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán toàn bộ file này > Run
-- Chạy SAU 01_schema.sql. File IDEMPOTENT: có thể chạy lại nhiều lần.
--
-- LÝ DO: code đã kiểm tra trước khi insert, nhưng hai request chạy cùng
-- lúc vẫn có thể ghi trùng. Ràng buộc ở database là lớp bảo vệ cuối.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) Dọn dữ liệu trùng trước khi thêm constraint
-- Giữ dòng có created_at nhỏ nhất (dòng được ghi đớm nhất).
-- -------------------------------------------------------------------------
delete from public.lesson_progress a
using public.lesson_progress b
where a.user_id = b.user_id
  and a.lesson_id = b.lesson_id
  and (a.created_at, a.id) > (b.created_at, b.id);

-- -------------------------------------------------------------------------
-- 2) Thêm unique constraint (user_id, lesson_id) nếu chưa có.
-- Một số database đã có constraint tự sinh tên
-- lesson_progress_user_id_lesson_id_key; kiểm tra theo các cột thay vì
-- chỉ kiểm tra tên để tránh tạo constraint trùng.
-- -------------------------------------------------------------------------
-- Nếu bản chạy trước đã tạo constraint có tên riêng của project, bỏ tên
-- riêng đó trước; constraint có sẵn theo cùng cặp cột sẽ được giữ lại.
alter table public.lesson_progress
    drop constraint if exists lesson_progress_user_lesson_unique;

do $$
begin
    if exists (
        select 1
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'lesson_progress'
          and c.contype = 'u'
          and c.conkey = array[
              (select attnum
               from pg_attribute
               where attrelid = t.oid and attname = 'user_id'),
              (select attnum
               from pg_attribute
               where attrelid = t.oid and attname = 'lesson_id')
          ]::smallint[]
    ) then
        raise notice 'Unique constraint cho (user_id, lesson_id) đã tồn tại, bỏ qua.';
    else
        alter table public.lesson_progress
            add constraint lesson_progress_user_lesson_unique
            unique (user_id, lesson_id);
        raise notice 'Đã thêm constraint lesson_progress_user_lesson_unique.';
    end if;
end
$$;

-- -------------------------------------------------------------------------
-- 3) Kiểm tra kết quả: truy vấn này phải trả về 0 dòng
-- -------------------------------------------------------------------------
select user_id, lesson_id, count(*) as total
from public.lesson_progress
group by user_id, lesson_id
having count(*) > 1;