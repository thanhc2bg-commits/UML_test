// --- Trạng thái ứng dụng ---
let currentUser = null;
let currentProfile = null;

// --- Các element DOM ---
const views = {
    login: document.getElementById('view-login'),
    home: document.getElementById('view-home'),
    admin: document.getElementById('view-admin'),
};
const navbar = document.getElementById('navbar');
const userNameEl = document.getElementById('user-name');
const loginErrorEl = document.getElementById('login-error');
const formLogin = document.getElementById('form-login');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');

// --- Khởi tạo ứng dụng ---
function initApp() {
    // Lắng nghe thay đổi trạng thái đăng nhập
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentProfile = null;
            window.location.hash = '#/login';
            handleRoute();
        } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            if (session) {
                currentUser = session.user;
                fetchProfileAndRoute();
            } else {
                handleRoute();
            }
        }
    });

    // Lắng nghe sự kiện đổi URL (hash)
    window.addEventListener('hashchange', handleRoute);
}

// --- Xử lý Đăng nhập ---
formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorEl.style.display = 'none';
    btnLogin.disabled = true;
    btnLogin.textContent = 'Đang đăng nhập...';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        
        if (error) {
            // Xử lý thông báo lỗi tiếng Việt
            if (error.message.includes('Failed to fetch') || error.message.includes('Network Error')) {
                throw new Error('Mất mạng hoặc không thể kết nối đến máy chủ.');
            } else if (error.message.includes('Invalid login credentials')) {
                throw new Error('Email hoặc mật khẩu không đúng.');
            } else {
                throw new Error(error.message);
            }
        }
    } catch (err) {
        loginErrorEl.textContent = err.message;
        loginErrorEl.style.display = 'block';
    } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = 'Đăng nhập';
    }
});

// --- Xử lý Đăng xuất ---
btnLogout.addEventListener('click', async () => {
    await supabase.auth.signOut();
});

// --- Lấy thông tin Profile và điều hướng ---
async function fetchProfileAndRoute() {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (error) throw error;
        currentProfile = data;

        // Cập nhật tên hiển thị trên Navbar
        userNameEl.textContent = currentProfile.display_name || currentUser.email;

        // Nếu mới đăng nhập ở trang login, tự động chuyển hướng theo role
        const currentHash = window.location.hash;
        if (currentHash === '' || currentHash === '#/' || currentHash === '#/login') {
            window.location.hash = currentProfile.role === 'admin' ? '#/admin' : '#/home';
        } else {
            // Ép render lại view hiện tại
            handleRoute();
        }
    } catch (err) {
        console.error('Lỗi khi lấy thông tin profile:', err);
    }
}

// --- Router ---
function handleRoute() {
    const hash = window.location.hash || '#/login';
    
    // Ẩn tất cả view và navbar
    Object.values(views).forEach(v => v.style.display = 'none');
    navbar.style.display = 'none';

    // Xử lý route chưa đăng nhập
    if (!currentUser) {
        if (hash !== '#/login') {
            window.location.hash = '#/login';
            return;
        }
        views.login.style.display = 'block';
        return;
    }

    // Đã đăng nhập nhưng profile đang tải thì chờ
    if (!currentProfile) return;

    // Hiển thị navbar cho user đã đăng nhập
    navbar.style.display = 'flex';

    // Xử lý route đã đăng nhập
    if (hash === '#/admin') {
        if (currentProfile.role !== 'admin') {
            // Học sinh cố tình vào trang admin -> đẩy về home
            window.location.hash = '#/home';
            return;
        }
        views.admin.style.display = 'block';
    } else if (hash === '#/home') {
        if (currentProfile.role === 'admin') {
            // Admin thì đẩy về trang admin
            window.location.hash = '#/admin';
            return;
        }
        views.home.style.display = 'block';
    } else {
        // Vào trang không hợp lệ -> đẩy về trang tương ứng với role
        window.location.hash = currentProfile.role === 'admin' ? '#/admin' : '#/home';
    }
}

// Khởi động
initApp();
