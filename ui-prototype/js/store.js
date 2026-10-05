// Quản lý trạng thái toàn cục và lưu tiến độ/điểm quiz qua Supabase.
const store = {
    currentUser: null,
    currentProfile: null,
    studySessionId: null,
    studyStartedAt: null,
    studyHeartbeat: null,

    // ===== Auth state =====
    setUser(user) { this.currentUser = user; },
    setProfile(profile) { this.currentProfile = profile; },
    clear() {
        if (this.studyHeartbeat) clearInterval(this.studyHeartbeat);
        this.currentUser = null;
        this.currentProfile = null;
        this.studySessionId = null;
        this.studyStartedAt = null;
        this.studyHeartbeat = null;
    },

    _requireUser() {
        if (!this.currentUser?.id) {
            throw new Error('Bạn cần đăng nhập để lưu kết quả.');
        }
        return this.currentUser.id;
    },

    async loadQuiz(lessonId) {
        const res = await fetch(`content/usecase/${encodeURIComponent(lessonId)}.quiz.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    },

    async getProgress() {
        const userId = this._requireUser();
        const { data, error } = await supabase
            .from('lesson_progress')
            .select('lesson_id')
            .eq('user_id', userId);
        if (error) throw error;
        return data.map(item => item.lesson_id);
    },

    // Dùng upsert + ignoreDuplicates: an toàn khi có unique constraint
    // lesson_progress_user_lesson_unique (xem supabase/03_constraints.sql).
    async markLessonDone(lessonId) {
        const userId = this._requireUser();
        const { error } = await supabase
            .from('lesson_progress')
            .upsert(
                { user_id: userId, lesson_id: lessonId },
                { onConflict: 'user_id,lesson_id', ignoreDuplicates: true }
            );
        if (error) throw error;
        return this.getProgress();
    },

    async saveQuizResult(lessonId, score, details) {
        const userId = this._requireUser();
        const { data, error } = await supabase
            .from('quiz_results')
            .insert({
                user_id: userId,
                lesson_id: lessonId,
                score,
                details: details || {}
            })
            .select('id, score, details, created_at')
            .single();
        if (error) throw error;
        return data;
    },

    async saveAttempts(lessonId, questions, answers, details) {
        const userId = this._requireUser();
        const rows = questions.map(question => {
            const answer = answers[question.id] || {};
            const selected = answer.selected;
            const isCorrect = question.type === 'mcq'
                ? selected !== undefined && selected === question.answer
                : (details[question.id] || 0) >= question.points;
            const answerValue = question.type === 'mcq'
                ? selected === undefined ? '' : String(selected)
                : answer.essayText || '';

            return {
                user_id: userId,
                question_id: `${lessonId}:${question.id}`,
                is_correct: isCorrect,
                answer: answerValue
            };
        });

        if (rows.length === 0) return [];
        const { data, error } = await supabase
            .from('attempts')
            .insert(rows)
            .select('id, question_id, is_correct, answer, created_at');
        if (error) throw error;
        return data;
    },

    async getQuizResults(lessonId) {
        const userId = this._requireUser();
        const { data, error } = await supabase
            .from('quiz_results')
            .select('score, details, created_at')
            .eq('user_id', userId)
            .eq('lesson_id', lessonId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },

    async getBestScores() {
        const userId = this._requireUser();
        const { data, error } = await supabase
            .from('quiz_results')
            .select('lesson_id, score, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });
        if (error) throw error;

        const out = {};
        for (const item of data) {
            if (!out[item.lesson_id]) {
                out[item.lesson_id] = { best: 0, attempts: 0, last: 0 };
            }
            const summary = out[item.lesson_id];
            summary.attempts += 1;
            summary.best = Math.max(summary.best, Number(item.score) || 0);
            summary.last = Number(item.score) || 0;
        }
        return out;
    },

    async getAdminStats() {
        if (this.currentProfile?.role !== 'admin') {
            throw new Error('Bạn không có quyền xem trang quản lý.');
        }

        const { data, error } = await supabase
            .from('admin_user_stats')
            .select('user_id, display_name, role, total_quizzes, best_score, total_attempts, success_rate_percent, total_study_seconds, last_active')
            .order('last_active', { ascending: false, nullsFirst: false });
        if (error) throw error;
        return data || [];
    },

    async startStudySession() {
        if (!this.currentUser?.id || this.studySessionId) return;
        const startedAt = new Date();
        const { data, error } = await supabase
            .from('study_sessions')
            .insert({
                user_id: this.currentUser.id,
                started_at: startedAt.toISOString(),
                last_heartbeat: startedAt.toISOString(),
                duration_seconds: 0
            })
            .select('id')
            .single();
        if (error) throw error;

        this.studySessionId = data.id;
        this.studyStartedAt = startedAt;
        this.studyHeartbeat = setInterval(() => {
            this.heartbeatStudySession().catch(err => {
                console.error('Không thể cập nhật thời gian học:', err);
            });
        }, 30000);
        await this.heartbeatStudySession();
    },

    async heartbeatStudySession() {
        if (!this.studySessionId || !this.studyStartedAt) return;
        const now = new Date();
        const durationSeconds = Math.max(0, Math.floor((now - this.studyStartedAt) / 1000));
        const { error } = await supabase
            .from('study_sessions')
            .update({
                last_heartbeat: now.toISOString(),
                duration_seconds: durationSeconds
            })
            .eq('id', this.studySessionId)
            .eq('user_id', this.currentUser.id);
        if (error) throw error;
    },

    async endStudySession() {
        if (!this.studySessionId) return;
        try {
            await this.heartbeatStudySession();
        } finally {
            if (this.studyHeartbeat) clearInterval(this.studyHeartbeat);
            this.studySessionId = null;
            this.studyStartedAt = null;
            this.studyHeartbeat = null;
        }
    }
};