/* Cấu hình kết nối Supabase */
const SUPABASE_URL = 'https://cuiysgkuxsznidecbygr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_L585sOkOHlxwVDE8ZvgWfA_9nEfilHy';

// Khởi tạo client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
