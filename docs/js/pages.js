// Quản lý render nội dung các trang (Views)

// Escape HTML để tránh XSS khi chèn dữ liệu từ JSON
function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// Fisher–Yates
function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function prepareLessonContent(source) {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const scripts = [...doc.querySelectorAll('script')].map(script => script.textContent || '');

    // Giữ <style> trong content để CSS và animation có cùng vòng đời với bài học.
    // Script vẫn phải tách ra vì script chèn qua innerHTML không được trình duyệt thực thi.
    doc.querySelectorAll('script').forEach(element => element.remove());
    return {
        html: doc.body.innerHTML,
        scripts
    };
}

function runLessonScripts(scripts, container) {
    scripts.forEach(source => {
        if (!source.trim()) return;
        const script = document.createElement('script');
        script.textContent = source;
        container.appendChild(script);
        script.remove();
    });
}

const pages = {
    // ============ LOGIN ============
    async renderLogin() {
        const view = document.getElementById('view-login');
        view.innerHTML = await renderTemplate('login');

        document.getElementById('form-login').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-login');
            const errEl = document.getElementById('login-error');
            errEl.hidden = true;
            btn.disabled = true;
            btn.innerHTML = 'Đang đăng nhập<span class="button-spinner" aria-hidden="true"></span>';

            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            try {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) {
                    if (error.message.includes('Failed to fetch') || error.message.includes('Network Error')) {
                        throw new Error('Mất mạng hoặc không thể kết nối đến máy chủ.');
                    } else if (error.message.includes('Invalid login credentials')) {
                        throw new Error('Email hoặc mật khẩu không đúng.');
                    } else {
                        throw new Error(error.message);
                    }
                }
            } catch (err) {
                errEl.textContent = err.message;
                errEl.hidden = false;
                btn.disabled = false;
                btn.innerHTML = 'Đăng nhập <span aria-hidden="true">→</span>';
            }
        });
    },

    // ============ HOME / ADMIN ============
    async renderHome() {
        const view = document.getElementById('view-home');
        view.innerHTML = await renderTemplate('home');
    },

    async renderAdmin() {
        const view = document.getElementById('view-admin');
        view.innerHTML = await renderTemplate('admin', {
            loading: true,
            stats: {},
            users: []
        });

        try {
            const users = (await store.getAdminStats()).filter(user => user.role === 'student');
            const totalLearners = users.length;
            const totalQuizzes = users.reduce((sum, user) => sum + Number(user.total_quizzes || 0), 0);
            const totalStudySeconds = users.reduce((sum, user) => sum + Number(user.total_study_seconds || 0), 0);
            const maxValue = {
                quizzes: Math.max(1, ...users.map(user => Number(user.total_quizzes || 0))),
                score: 100,
                accuracy: 100,
                study: Math.max(1, ...users.map(user => Number(user.total_study_seconds || 0)))
            };

            const formatDuration = seconds => {
                const minutes = Math.round(Number(seconds || 0) / 60);
                if (minutes < 60) return `${minutes} phút`;
                return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
            };

            const formatDate = value => value
                ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
                : 'Chưa hoạt động';

            const heat = (value, max) => Math.max(0, Math.min(5, Math.ceil((Number(value || 0) / max) * 5)));
            const templateUsers = users.map(user => ({
                ...user,
                displayName: user.display_name || 'Chưa đặt tên',
                quizzes: Number(user.total_quizzes || 0),
                bestScore: Number(user.best_score || 0),
                accuracy: Math.round(Number(user.success_rate_percent || 0)),
                studySeconds: Number(user.total_study_seconds || 0),
                studyLabel: formatDuration(user.total_study_seconds),
                lastActiveLabel: formatDate(user.last_active),
                quizHeat: heat(user.total_quizzes, maxValue.quizzes),
                scoreHeat: heat(user.best_score, maxValue.score),
                accuracyHeat: heat(user.success_rate_percent, maxValue.accuracy),
                studyHeat: heat(user.total_study_seconds, maxValue.study),
                activityWidth: `${Math.max(2, Math.round((Number(user.total_study_seconds || 0) / maxValue.study) * 100))}%`
            }));

            view.innerHTML = await renderTemplate('admin', {
                loading: false,
                stats: {
                    learnerCount: totalLearners,
                    quizCount: totalQuizzes,
                    studyLabel: formatDuration(totalStudySeconds)
                },
                users: templateUsers
            });
        } catch (err) {
            console.error('Lỗi khi tải thống kê admin:', err);
            view.innerHTML = await renderTemplate('admin', {
                loading: false,
                error: `Không thể tải thống kê: ${err.message}`
            });
        }
    },

    // ============ COURSE / LESSON (stub tối thiểu) ============
    async renderCourse(courseId) {
        const view = document.getElementById('view-course');
        view.innerHTML = `<div class="container"><p class="text-muted">Đang tải nội dung khóa học…</p></div>`;
        try {
            const res = await fetch('content/courses.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const normalizedId = courseId === 'uml-co-ban' ? 'usecase' : courseId;
            const course = data.courses.find(item => item.id === normalizedId);
            if (!course) throw new Error('Không tìm thấy khóa học.');
            const lessonCount = course.modules.reduce((total, module) => total + module.lessons.length, 0);
            const templateData = {
                title: course.title,
                description: course.description,
                lessonCount,
                moduleCount: course.modules.length,
                modules: course.modules.map((module, moduleIndex) => ({
                    title: module.title.replace(/^Module \d+: /, ''),
                    number: String(moduleIndex + 1).padStart(2, '0'),
                    lessons: module.lessons.map((lesson, lessonIndex) => ({
                        ...lesson,
                        number: String(lessonIndex + 1).padStart(2, '0'),
                        url: lesson.ready ? `#/lesson/${encodeURIComponent(lesson.id)}` : '#'
                    }))
                }))
            };
            view.innerHTML = await renderTemplate('course', templateData);
        } catch (err) {
            view.innerHTML = `<div class="container"><div class="panel"><p class="error-msg">${escapeHTML(err.message)}</p><a class="btn btn-ghost" href="#/home">← Về trang chủ</a></div></div>`;
        }
    },
    async renderLesson(lessonId) {
        const view = document.getElementById('view-lesson');
        view.innerHTML = `<div class="container"><p class="text-muted">Đang tải bài học…</p></div>`;

        try {
            const res = await fetch('content/courses.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const lesson = data.courses
                .flatMap(course => course.modules)
                .flatMap(module => module.lessons)
                .find(item => item.id === lessonId);
            if (!lesson) throw new Error('Không tìm thấy bài học.');
            if (!lesson.file) throw new Error('Bài học chưa có file nội dung.');

            const contentRes = await fetch(lesson.file);
            if (!contentRes.ok) throw new Error(`Không tải được nội dung bài học (HTTP ${contentRes.status}).`);
            const content = prepareLessonContent(await contentRes.text());

            view.innerHTML = await renderTemplate('lesson', {
                id: lessonId,
               title: lesson.title,
               contentHTML: content.html,
                encodedId: encodeURIComponent(lessonId)
            });
            runLessonScripts(content.scripts, view);
        } catch (err) {
            view.innerHTML = `<div class="container"><div class="panel"><p class="error-msg">${escapeHTML(err.message)}</p><a class="btn btn-ghost" href="#/home">← Về trang chủ</a></div></div>`;
        }
    },

    // ============ QUIZ ============
    // Đọc content/usecase/<lessonId>.quiz.json
    // Cấu trúc: {lessonId, passScore, questions:[{id,type,points,...}]}
    async renderQuiz(lessonId) {
        const view = document.getElementById('view-quiz');
        view.innerHTML = `<div class="container"><div class="quiz anim-enter"><p class="text-muted">Đang tải bài kiểm tra…</p></div></div>`;

        // 1) Nạp quiz JSON
        let quiz;
        try {
            quiz = await store.loadQuiz(lessonId);
        } catch (err) {
            view.innerHTML = `<div class="container"><div class="quiz anim-enter">
                <div class="note">
                    <p class="note__title">Lỗi tải bài kiểm tra</p>
                    <p>Không đọc được <code>content/usecase/${escapeHTML(lessonId)}.quiz.json</code>. ${escapeHTML(err.message)}</p>
                </div>
                <a class="btn btn-ghost" href="#/lesson/${encodeURIComponent(lessonId)}">← Về bài học</a>
            </div></div>`;
            return;
        }

        // 2) Kiểm tra tổng điểm = 100
        const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
        const totalPoints = questions.reduce((s, q) => s + (Number(q.points) || 0), 0);
        if (totalPoints !== 100) {
            view.innerHTML = `<div class="container"><div class="quiz anim-enter">
                <div class="note">
                    <p class="note__title">Lỗi dữ liệu</p>
                    <p>Tổng điểm các câu phải bằng 100. Hiện tại: <strong>${totalPoints}</strong>.</p>
                </div>
                <a class="btn btn-ghost" href="#/lesson/${encodeURIComponent(lessonId)}">← Về bài học</a>
            </div></div>`;
            return;
        }

        const passScore = Number.isFinite(quiz.passScore) ? Number(quiz.passScore) : 70;

        // 3) Điểm cao nhất trước đó (để so sánh kỷ lục)
        const bestMap = await store.getBestScores();
        const rec = bestMap[lessonId] || { best: 0, attempts: 0 };
        let prevBest = rec.best;
        let prevAttempts = rec.attempts;

        // 4) Chuẩn bị câu hỏi: xáo câu trắc nghiệm + xáo đáp án, giữ đúng chỉ số answer
        const prepareQuestions = () => {
            const copy = questions.map(q => {
                if (q.type === 'mcq' && Array.isArray(q.options)) {
                    const idxs = q.options.map((_, i) => i);
                    const shuffledIdx = shuffleArray(idxs);
                    const newOptions = shuffledIdx.map(i => q.options[i]);
                    const newAnswer = shuffledIdx.indexOf(q.answer);
                    return { ...q, options: newOptions, answer: newAnswer };
                }
                return { ...q };
            });
            return shuffleArray(copy);
        };

        // 5) State cục bộ
        const state = {
            questions: prepareQuestions(),
            answers: {},        // qid -> {selected?, essayText?, rubricChecked?: bool[]}
            phase: 'answering', // answering | grading | done
            finalScore: 0,
            finalDetails: {},
            isRecord: false,
            saving: false,
        };

        // 6) Tính điểm hiện tại (dùng cho cả lúc grading và finalize)
        const compute = () => {
            let score = 0;
            const details = {};
            for (const q of state.questions) {
                if (q.type === 'mcq') {
                    const sel = state.answers[q.id]?.selected;
                    const ok = sel !== undefined && sel !== null && sel === q.answer;
                    details[q.id] = ok ? q.points : 0;
                } else {
                    const checked = state.answers[q.id]?.rubricChecked || [];
                    let earned = 0;
                    (q.rubric || []).forEach((r, i) => { if (checked[i]) earned += Number(r.points) || 0; });
                    earned = Math.min(earned, q.points);
                    details[q.id] = earned;
                }
                score += details[q.id];
            }
            return { score, details };
        };

        // 7) Đếm tăng dần cho điểm
        const animateScore = (el, from, to, duration = 600) => {
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                el.textContent = `${to} / 100`;
                return;
            }
            const start = performance.now();
            const step = (now) => {
                const t = Math.min((now - start) / duration, 1);
                const val = Math.round(from + (to - from) * t);
                el.textContent = `${val} / 100`;
                if (t < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        };

        // 8) Render
        const render = async () => {
            const isAnswering = state.phase === 'answering';
            const isGrading = state.phase === 'grading';
            const isDone = state.phase === 'done';

            // --- Điểm hiển thị ---
            const displayScore = isAnswering ? 0 : compute().score;

            // --- Nút hành động ---
            let actions = '';
            if (isAnswering) {
                actions = `<button type="button" class="btn btn-primary" id="btn-submit">Nộp bài</button>`;
            } else {
                actions = `<button type="button" class="btn btn-primary" id="btn-retry">Làm lại</button>`;
            }
            actions += `<a class="btn btn-ghost" href="#/lesson/${encodeURIComponent(lessonId)}">← Về bài học</a>`;

            // --- Kết quả ---
            let resultHTML = '';
            if (isDone) {
                const passed = state.finalScore >= passScore;
                resultHTML = `
                    <div class="quiz__result">
                        <h3>${passed ? '✅ Đạt' : '❌ Chưa đạt'} — ${state.finalScore} / 100</h3>
                        <p>Điểm lần này: <strong>${state.finalScore}</strong></p>
                        <p>Điểm cao nhất: <strong>${prevBest}</strong>
                            ${state.isRecord ? '<span class="record-badge">Kỷ lục mới!</span>' : ''}
                        </p>
                        <p>Số lần đã làm: <strong>${prevAttempts}</strong></p>
                    </div>`;
            }

            const templateQuestions = state.questions.map((q, qi) => {
                const ans = state.answers[q.id] || {};
                return {
                    ...q,
                    number: qi + 1,
                    isMcq: q.type === 'mcq',
                    isAnswering,
                    isDone,
                    explanationVisible: !isAnswering && Boolean(q.explanation),
                    essayText: ans.essayText || '',
                    modelAnswer: q.modelAnswer || '',
                    options: (q.options || []).map((text, index) => ({
                        text,
                        index,
                        selected: ans.selected === index,
                        className: !isAnswering
                            ? `answer is-disabled${ans.selected === undefined ? ' is-unanswered' : ''}${ans.selected === index && index === q.answer ? ' is-correct' : ''}${ans.selected === index && index !== q.answer ? ' is-wrong' : ''}`
                            : 'answer'
                    })),
                    rubric: (q.rubric || []).map((item, index) => ({
                        ...item,
                        index,
                        checked: Boolean((ans.rubricChecked || [])[index])
                    }))
                };
            });

            view.innerHTML = await renderTemplate('quiz', {
                encodedLessonId: encodeURIComponent(lessonId),
                displayScore,
                passScore,
                questions: templateQuestions,
                actionsHTML: actions,
                resultHTML
            });

            attachEvents();

            // Animation đếm điểm chỉ khi vừa finalize
            if (isDone) {
                animateScore(document.getElementById('quiz-live-score'), 0, state.finalScore, 650);
            }
        };

        // 9) Gắn sự kiện
        const attachEvents = () => {
            const form = document.getElementById('quiz-form');

            // Chọn đáp án trắc nghiệm
            form.querySelectorAll('input[type="radio"]').forEach(el => {
                el.addEventListener('change', (e) => {
                    const qid = e.target.name.replace(/^q_/, '');
                    state.answers[qid] = { ...(state.answers[qid] || {}), selected: Number(e.target.value) };
                });
            });

            // Gõ câu tự luận
            form.querySelectorAll('textarea.essay-input').forEach(el => {
                el.addEventListener('input', (e) => {
                    const qid = e.target.dataset.qid;
                    state.answers[qid] = { ...(state.answers[qid] || {}), essayText: e.target.value };
                });
            });

            // Tích rubric → cập nhật điểm live (không re-render)
            form.querySelectorAll('input[type="checkbox"][data-ri]').forEach(el => {
                el.addEventListener('change', (e) => {
                    const qid = e.target.dataset.qid;
                    const ri = Number(e.target.dataset.ri);
                    const cur = state.answers[qid] || {};
                    const checked = (cur.rubricChecked || []).slice();
                    checked[ri] = e.target.checked;
                    state.answers[qid] = { ...cur, rubricChecked: checked };

                    const { score } = compute();
                    const scoreEl = document.getElementById('quiz-live-score');
                    if (scoreEl) scoreEl.textContent = `${score} / 100`;
                });
            });

            const completeAttempt = async (button) => {
                if (state.saving) return;
                state.saving = true;
                button.disabled = true;

                const { score, details } = compute();
                const previousBest = prevBest;

                try {
                    await store.saveQuizResult(lessonId, score, details);
                    await store.saveAttempts(lessonId, state.questions, state.answers, details);
                    if (score >= passScore) {
                        await store.markLessonDone(lessonId);
                    }
                    const map = await store.getBestScores();
                    const r = map[lessonId];
                    prevBest = r ? r.best : score;
                    prevAttempts = r ? r.attempts : (prevAttempts + 1);

                    state.finalScore = score;
                    state.finalDetails = details;
                    state.isRecord = score > previousBest;
                    state.phase = 'done';
                    render();
                } catch (err) {
                    console.error(err);
                    alert('Lỗi lưu kết quả: ' + err.message);
                    button.disabled = false;
                    state.saving = false;
                }
            };

            // Nộp bài sẽ chấm, lưu và hiển thị kết quả ngay.
            const btnSubmit = document.getElementById('btn-submit');
            if (btnSubmit) btnSubmit.addEventListener('click', () => completeAttempt(btnSubmit));

            // Nút Làm lại (không giới hạn, xáo lại câu + đáp án)
            const btnRetry = document.getElementById('btn-retry');
            if (btnRetry) btnRetry.addEventListener('click', () => {
                state.questions = prepareQuestions();
                state.answers = {};
                state.phase = 'answering';
                state.finalScore = 0;
                state.finalDetails = {};
                state.isRecord = false;
                state.saving = false;
                render();
            });
        };

        // 10) Render lần đầu
        render();
    }
};