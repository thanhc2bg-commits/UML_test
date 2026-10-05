// Khởi tạo và Routing
const app = {
    views: {
        login:  document.getElementById('view-login'),
        home:   document.getElementById('view-home'),
        admin:  document.getElementById('view-admin'),
        course: document.getElementById('view-course'),
        lesson: document.getElementById('view-lesson'),
        quiz:   document.getElementById('view-quiz'),
    },
    navbar: document.getElementById('navbar'),
    userNameEl: document.getElementById('user-name'),

    init() {
        document.getElementById('btn-logout').addEventListener('click', async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            button.textContent = 'Đang đăng xuất…';

            try {
                try {
                    await Promise.race([
                        store.endStudySession(),
                        new Promise((_, reject) => {
                            window.setTimeout(() => reject(new Error('Hết thời gian lưu phiên học.')), 3000);
                        })
                    ]);
                } catch (err) {
                    console.error('Không thể lưu thời gian học cuối phiên:', err);
                }
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
                store.clear();
                window.location.hash = '#/login';
                this.route();
            } catch (err) {
                console.error('Lỗi khi đăng xuất:', err);
                button.disabled = false;
                button.innerHTML = 'Đăng xuất <span aria-hidden="true">↗</span>';
                window.alert(`Không thể đăng xuất: ${err.message}`);
            }
        });

        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                store.clear();
                window.location.hash = '#/login';
                this.route();
            } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                if (session) {
                    store.setUser(session.user);
                    this.fetchProfileAndRoute().catch(err => {
                        console.error('Lỗi khởi tạo phiên đăng nhập:', err);
                    });
                } else {
                    this.route();
                }
            }
        });

        window.addEventListener('hashchange', () => this.route());
    },

    async fetchProfileAndRoute() {
        try {
            const { data, error } = await supabase
                .from('profiles').select('*')
                .eq('id', store.currentUser.id).single();
            if (error) throw error;
            store.setProfile(data);
            this.userNameEl.textContent = store.currentProfile.display_name || store.currentUser.email;
            try {
                await store.startStudySession();
            } catch (err) {
                console.error('Không thể bắt đầu phiên học:', err);
            }

            const currentHash = window.location.hash;
            if (!currentHash || currentHash === '#/' || currentHash === '#/login') {
                window.location.hash = store.currentProfile.role === 'admin' ? '#/admin' : '#/home';
            } else {
                this.route();
            }
        } catch (err) {
            console.error('Lỗi khi lấy thông tin profile:', err);
        }
    },

    // Tách hash thành {name, param}
    parseHash(hash) {
        const h = (hash || '').replace(/^#\/?/, '');
        const parts = h.split('/').filter(Boolean);
        return { name: parts[0] || '', param: parts[1] || '' };
    },

    route() {
        const hash = window.location.hash || '#/login';
        const { name, param } = this.parseHash(hash);

        // Ẩn + xóa sạch các view
        Object.values(this.views).forEach(v => {
            v.style.display = 'none';
            v.innerHTML = '';
        });
        this.navbar.style.display = 'none';

        // Chưa đăng nhập
        if (!store.currentUser) {
            if (name !== 'login') { window.location.hash = '#/login'; return; }
            this.views.login.style.display = 'block';
            pages.renderLogin();
            return;
        }

        if (!store.currentProfile) return;

        this.navbar.style.display = 'flex';

        switch (name) {
            case 'admin': {
                if (store.currentProfile.role !== 'admin') { window.location.hash = '#/home'; return; }
                this.views.admin.style.display = 'block';
                pages.renderAdmin();
                break;
            }
            case 'home': {
                if (store.currentProfile.role === 'admin') { window.location.hash = '#/admin'; return; }
                this.views.home.style.display = 'block';
                pages.renderHome();
                break;
            }
            case 'course': {
                if (!param) { window.location.hash = '#/home'; return; }
                this.views.course.style.display = 'block';
                pages.renderCourse(param);
                break;
            }
            case 'lesson': {
                if (!param) { window.location.hash = '#/home'; return; }
                this.views.lesson.style.display = 'block';
                pages.renderLesson(param);
                break;
            }
            case 'quiz': {
                if (!param) { window.location.hash = '#/home'; return; }
                this.views.quiz.style.display = 'block';
                pages.renderQuiz(param);
                break;
            }
            default:
                window.location.hash = store.currentProfile.role === 'admin' ? '#/admin' : '#/home';
        }
    }
};

app.init();