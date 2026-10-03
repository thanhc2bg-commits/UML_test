-- Kích hoạt extension để sinh UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Bảng profiles lưu thông tin người dùng
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    role TEXT CHECK (role IN ('admin', 'student')) DEFAULT 'student'
);

-- Hàm kiểm tra admin (SECURITY DEFINER để bỏ qua RLS khi kiểm tra bảng profiles)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

-- Bảng attempts (lưu lịch sử trả lời câu hỏi)
CREATE TABLE public.attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    question_id TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    answer TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Bảng study_sessions (lưu thời gian ôn tập)
CREATE TABLE public.study_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    last_heartbeat TIMESTAMPTZ DEFAULT now() NOT NULL,
    duration_seconds INTEGER DEFAULT 0 NOT NULL
);

-- Trigger tự động tạo profile khi có user mới đăng ký trong auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, role)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name', 'student');
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger ngăn học sinh tự đổi role của chính mình qua API
CREATE OR REPLACE FUNCTION public.prevent_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.role <> OLD.role THEN
        -- Bỏ qua kiểm tra nếu chạy trực tiếp từ SQL Editor (không thông qua API, auth.uid() sẽ NULL)
        IF auth.uid() IS NULL THEN
            RETURN NEW;
        END IF;

        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Chỉ admin mới được phép thay đổi quyền (role).';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_student_role_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE PROCEDURE public.prevent_role_update();

-- =========================================================================
-- BẬT ROW LEVEL SECURITY (RLS)
-- =========================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- POLICIES CHO BẢNG PROFILES
-- -------------------------------------------------------------------------
CREATE POLICY "Student xem profile của chính mình"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Admin xem tất cả profiles"
    ON public.profiles FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Student tự cập nhật profile của mình"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- -------------------------------------------------------------------------
-- POLICIES CHO BẢNG ATTEMPTS
-- -------------------------------------------------------------------------
CREATE POLICY "Student xem attempts của mình"
    ON public.attempts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Admin xem tất cả attempts"
    ON public.attempts FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Student thêm attempts của mình"
    ON public.attempts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- (Đã xóa Policy UPDATE của attempts theo yêu cầu)

-- -------------------------------------------------------------------------
-- POLICIES CHO BẢNG STUDY_SESSIONS
-- -------------------------------------------------------------------------
CREATE POLICY "Student xem study_sessions của mình"
    ON public.study_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Admin xem tất cả study_sessions"
    ON public.study_sessions FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Student thêm study_sessions của mình"
    ON public.study_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Student cập nhật study_sessions của mình"
    ON public.study_sessions FOR UPDATE
    USING (auth.uid() = user_id);

-- =========================================================================
-- VIEW TỔNG HỢP CHO ADMIN
-- =========================================================================
-- View với security_invoker = true để áp dụng RLS của các bảng gốc.
-- Tách subquery để tránh bị nhân dòng.
CREATE OR REPLACE VIEW public.admin_user_stats WITH (security_invoker = true) AS
SELECT 
    p.id AS user_id,
    p.display_name,
    p.role,
    COALESCE(a_stats.total_attempts, 0) AS total_attempts,
    COALESCE(a_stats.success_rate_percent, 0) AS success_rate_percent,
    COALESCE(ss_stats.total_study_seconds, 0) AS total_study_seconds,
    ss_stats.last_active
FROM 
    public.profiles p
LEFT JOIN (
    SELECT 
        user_id, 
        COUNT(id) AS total_attempts,
        SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(id), 0) * 100 AS success_rate_percent
    FROM public.attempts
    GROUP BY user_id
) a_stats ON p.id = a_stats.user_id
LEFT JOIN (
    SELECT 
        user_id,
        SUM(duration_seconds) AS total_study_seconds,
        MAX(last_heartbeat) AS last_active
    FROM public.study_sessions
    GROUP BY user_id
) ss_stats ON p.id = ss_stats.user_id;

-- REVOKE quyền từ anon, chỉ cấp cho authenticated
REVOKE ALL ON public.admin_user_stats FROM anon;
GRANT SELECT ON public.admin_user_stats TO authenticated;

-- =========================================================================
-- CÂU LỆNH MẪU ĐỂ GÁN QUYỀN ADMIN (CHẠY TRONG SQL EDITOR)
-- =========================================================================
/*
UPDATE public.profiles 
SET role = 'admin' 
WHERE id = '<thay-uuid-cua-nguoi-dung-vao-day>';
*/
