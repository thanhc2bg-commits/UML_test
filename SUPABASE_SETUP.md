# Hướng dẫn cấu hình Supabase cho UML Test

Tài liệu này hướng dẫn cách cấu hình Supabase cho dự án `ui-prototype`, bao gồm:

- Bật Row Level Security (RLS).
- Tạo policy cho dữ liệu của người dùng.
- Tránh lưu trùng tiến độ bài học.
- Kiểm tra đăng nhập và lưu kết quả quiz.
- Thêm bài học và file quiz mới.
- Chuẩn bị deploy lên GitHub Pages.

## 0. Cách chạy nhanh (file SQL sẵn có trong repo)

Thay vì chạy từng câu lệnh dưới đây, bạn có thể dán trực tiếp các file trong
thư mục [supabase/](./supabase/) vào **Supabase Dashboard > SQL Editor**,
theo đúng thứ tự sau:

| Bước | File | Nội dung | Tương ứng mục |
|---|---|---|---|
| 1 | [supabase/01_schema.sql](./supabase/01_schema.sql) | Tạo 5 bảng, index, trigger, hàm, view admin | mục 1, 2 |
| 2 | [supabase/02_rls_policies.sql](./supabase/02_rls_policies.sql) | Bật RLS và tạo policy cho 5 bảng | mục 3, 4, 5, 6, 7 |
| 3 | [supabase/03_constraints.sql](./supabase/03_constraints.sql) | Dọn dữ liệu trùng và thêm unique constraint | mục 8 |
| 4 | [supabase/04_verify.sql](./supabase/04_verify.sql) | Truy vấn kiểm tra sau khi cấu hình | mục 2, 9, 15 |

Cả 4 file đều **idempotent**: chạy lại nhiều lần vẫn an toàn, không làm mất
dữ liệu và không báo lỗi trùng tên policy.

Sau bước 3, gán quyền admin cho một user (chạy riêng trong SQL Editor):

```sql
update public.profiles
set role = 'admin'
where id = '<thay-uuid-nguoi-dung-vao-day>';
```

## 1. Kiến trúc dữ liệu hiện tại

Dự án đang sử dụng các bảng sau:

| Bảng | Mục đích |
|---|---|
| `profiles` | Thông tin người dùng và vai trò `student`/`admin` |
| `quiz_results` | Một bản tổng kết cho mỗi lần nộp quiz |
| `attempts` | Chi tiết câu trả lời của từng câu |
| `lesson_progress` | Bài học mà người dùng đã hoàn thành |
| `study_sessions` | Thời gian học của người dùng |

Khi người dùng nộp bài:

```text
quiz_results  -> tổng điểm và điểm từng câu
attempts      -> câu trả lời của từng câu
lesson_progress -> được thêm nếu đạt passScore
```

Sau khi đăng nhập, frontend tạo một dòng trong `study_sessions` và cập nhật
`last_heartbeat` cùng `duration_seconds` mỗi 30 giây. Dashboard admin dùng
những dữ liệu này để hiển thị tổng thời gian học và biểu đồ thời gian theo
từng học viên. Nếu học viên đóng trang trước heartbeat đầu tiên, phiên đó có
thể ghi nhận 0 giây; đây là giới hạn của việc theo dõi thời gian trên
frontend.

## 2. Kiểm tra bảng trong Supabase

Mở Supabase Dashboard:

1. Chọn đúng project.
2. Vào **SQL Editor**.
3. Chạy truy vấn kiểm tra bảng:

```sql
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
```

Bạn phải thấy đủ năm bảng.

Kiểm tra cấu trúc chính:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('quiz_results', 'attempts', 'lesson_progress')
order by table_name, ordinal_position;
```

Các cột quan trọng cần có:

```text
quiz_results:
  user_id, lesson_id, score, details, created_at

attempts:
  user_id, question_id, is_correct, answer, created_at

lesson_progress:
  user_id, lesson_id, created_at
```

## 3. Bật Row Level Security

Chạy lệnh sau một lần trong Supabase SQL Editor:

```sql
alter table public.profiles enable row level security;
alter table public.quiz_results enable row level security;
alter table public.attempts enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.study_sessions enable row level security;
```

RLS giúp ngăn người dùng đọc hoặc ghi dữ liệu của người khác.

## 4. Tạo policy cho `profiles`

Người dùng cần đọc được profile của chính mình vì [app.js](./ui-prototype/js/app.js) tải profile sau khi đăng nhập.

```sql
create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);
```

Nếu policy đã tồn tại, Supabase sẽ báo trùng tên. Khi đó không tạo lại policy hoặc xóa policy cũ trước:

```sql
drop policy if exists "Users can read their own profile"
on public.profiles;
```

Sau đó chạy lại lệnh `create policy`.

## 5. Tạo policy cho `quiz_results`

Cho phép user đã đăng nhập thêm kết quả của chính mình:

```sql
create policy "Users can insert their own quiz results"
on public.quiz_results
for insert
to authenticated
with check (auth.uid() = user_id);
```

Cho phép user đọc kết quả của chính mình:

```sql
create policy "Users can read their own quiz results"
on public.quiz_results
for select
to authenticated
using (auth.uid() = user_id);
```

Không tạo policy `update` hoặc `delete` cho student nếu chưa có yêu cầu cụ thể. Kết quả quiz nên được giữ lại như lịch sử.

## 6. Tạo policy cho `attempts`

```sql
create policy "Users can insert their own attempts"
on public.attempts
for insert
to authenticated
with check (auth.uid() = user_id);
```

```sql
create policy "Users can read their own attempts"
on public.attempts
for select
to authenticated
using (auth.uid() = user_id);
```

Trong code hiện tại, `question_id` được lưu theo dạng:

```text
uc-m1-b1:q1
```

Không nên chỉ lưu `q1`, vì nhiều bài học có thể cùng sử dụng ID câu hỏi `q1`.

## 7. Tạo policy cho `lesson_progress`

```sql
create policy "Users can insert their own lesson progress"
on public.lesson_progress
for insert
to authenticated
with check (auth.uid() = user_id);
```

```sql
create policy "Users can read their own lesson progress"
on public.lesson_progress
for select
to authenticated
using (auth.uid() = user_id);
```

## 8. Tránh lưu trùng tiến độ

Database cần có ràng buộc để bảo vệ dữ liệu trong trường hợp hai request chạy cùng lúc. File [supabase/03_constraints.sql](./supabase/03_constraints.sql) đã dọn dữ liệu trùng rồi thêm constraint trong một `do $$ ... $$` block nên chạy lại nhiều lần vẫn an toàn.

Trong [store.js](./ui-prototype/js/store.js), `markLessonDone()` dùng `upsert` kèm `ignoreDuplicates: true`, nên không còn phụ thuộc vào việc đọc trước rồi insert:

```js
await supabase
    .from('lesson_progress')
    .upsert(
        { user_id: userId, lesson_id: lessonId },
        { onConflict: 'user_id,lesson_id', ignoreDuplicates: true }
    );
```

Nếu bạn muốn tự chạy tay:

```sql
alter table public.lesson_progress
add constraint lesson_progress_user_lesson_unique
unique (user_id, lesson_id);
```

Nếu Supabase báo constraint đã tồn tại thì bỏ qua, hoặc chạy lại [supabase/03_constraints.sql](./supabase/03_constraints.sql) vì file này tự kiểm tra trước khi thêm.

Kiểm tra dữ liệu trùng (truy vấn này phải trả về 0 dòng):

```sql
select user_id, lesson_id, count(*) as total
from public.lesson_progress
group by user_id, lesson_id
having count(*) > 1;
```

Nếu có dữ liệu trùng, cần giữ lại một dòng và xóa các dòng dư thừa trước khi thêm constraint. File `03_constraints.sql` đã tự làm bước này bằng `delete ... using ...` và giữ dòng có `created_at` nhỏ nhất.

## 9. Kiểm tra policy

Toàn bộ truy vấn kiểm tra của mục này đã được gom sẵn vào [supabase/04_verify.sql](./supabase/04_verify.sql).

Trong Dashboard vào **Authentication > Users**, tạo hoặc sử dụng một user test.

Sau đó chạy ứng dụng bằng Live Server:

```text
http://127.0.0.1:5500/ui-prototype/index.html
```

Đăng nhập và mở:

```text
#/quiz/uc-m1-b1
```

Thực hiện các bước:

1. Chọn một vài đáp án.
2. Để trống một vài câu.
3. Bấm **Nộp bài**.
4. Kiểm tra điểm hiển thị.
5. Mở Supabase **Table Editor**.
6. Kiểm tra `quiz_results`.
7. Kiểm tra `attempts`.
8. Nếu đạt từ `70` điểm, kiểm tra `lesson_progress`.

Truy vấn kiểm tra:

```sql
select *
from public.quiz_results
where user_id = auth.uid()
order by created_at desc
limit 10;
```

```sql
select *
from public.attempts
where user_id = auth.uid()
order by created_at desc
limit 30;
```

```sql
select *
from public.lesson_progress
where user_id = auth.uid()
order by created_at desc;
```

Nếu trình duyệt báo `new row violates row-level security policy`, policy `insert` tương ứng đang thiếu hoặc `user_id` không khớp phiên đăng nhập.

## 10. Các file liên quan trong frontend

| File | Vai trò |
|---|---|
| [config.js](./ui-prototype/js/config.js) | URL và anon key của Supabase |
| [store.js](./ui-prototype/js/store.js) | Tải quiz và gọi Supabase |
| [pages.js](./ui-prototype/js/pages.js) | Render, chấm và nộp quiz |
| [quiz.hbs](./ui-prototype/templates/quiz.hbs) | Giao diện quiz |
| [courses.json](./ui-prototype/content/courses.json) | Danh sách bài học |
| `content/usecase/*.quiz.json` | Dữ liệu câu hỏi |

## 11. Quy tắc tạo file quiz mới

Tên file phải theo mẫu:

```text
<lessonId>.quiz.json
```

Ví dụ:

```text
uc-m1-b2.quiz.json
```

Mẫu tối thiểu:

```json
{
  "lessonId": "uc-m1-b2",
  "passScore": 70,
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "points": 100,
      "question": "Câu hỏi mẫu?",
      "options": [
        "Đáp án đúng",
        "Đáp án sai"
      ],
      "answer": 0,
      "explanation": "Giải thích đáp án."
    }
  ]
}
```

Quy tắc bắt buộc:

1. JSON hợp lệ, không thêm comment HTML hoặc JavaScript.
2. `lessonId` phải khớp ID trong `courses.json`.
3. Tổng `points` phải bằng `100`.
4. Mỗi câu phải có `id` khác nhau trong cùng quiz.
5. MCQ dùng `"type": "mcq"`.
6. Câu MCQ phải có ít nhất hai `options`.
7. `answer` bắt đầu từ `0`.
8. Câu essay dùng `"type": "essay"`.
9. Tổng điểm các mục `rubric` nên bằng `points` của câu essay.
10. Không đặt đáp án hoặc dữ liệu quiz trong Supabase nếu frontend vẫn đang tải JSON công khai.

Kiểm tra file bằng PowerShell:

```powershell
$quiz = Get-Content .\ui-prototype\content\usecase\uc-m1-b2.quiz.json -Raw | ConvertFrom-Json
$quiz.lessonId
$quiz.questions.Count
($quiz.questions | Measure-Object -Property points -Sum).Sum
```

Kết quả tổng điểm phải là:

```text
100
```

## 12. Thêm bài học mới

Tạo nội dung:

```text
ui-prototype/content/usecase/uc-m1-b2.html
```

Tạo quiz:

```text
ui-prototype/content/usecase/uc-m1-b2.quiz.json
```

Trong [courses.json](./ui-prototype/content/courses.json), cập nhật:

```json
{
  "id": "uc-m1-b2",
  "title": "Actor",
  "slides": "6-8",
  "minutes": 8,
  "ready": true,
  "file": "content/usecase/uc-m1-b2.html",
  "quiz": "content/usecase/uc-m1-b2.quiz.json"
}
```

Đường dẫn kiểm tra:

```text
#/lesson/uc-m1-b2
#/quiz/uc-m1-b2
```

Trạng thái hiện tại: `uc-m1-b2` đã có đủ file nội dung, file quiz và đã được đặt `ready: true` trong `courses.json`.

## 13. Bảo mật khi dùng GitHub Pages

Được phép đưa Supabase URL và publishable/anon key lên frontend:

```js
const SUPABASE_URL = '...';
const SUPABASE_ANON_KEY = '...';
```

Không được đưa các thông tin sau lên GitHub:

```text
service_role key
database password
private API key
secret token
```

Lưu ý: vì quiz JSON được tải ở frontend, người dùng có thể xem đáp án trong DevTools. Cách hiện tại phù hợp với web ôn tập. Nếu cần thi chống gian lận, phải chuyển việc chấm điểm sang backend hoặc Supabase Edge Function.

## 14. Deploy GitHub Pages

Trước khi deploy:

1. Kiểm tra các đường dẫn đều là đường dẫn tương đối.
2. Không mở ứng dụng bằng `file:///`.
3. Kiểm tra bằng Live Server.
4. Push đầy đủ thư mục `ui-prototype`.
5. Vào **Repository Settings > Pages**.
6. Chọn branch cần deploy và thư mục phù hợp.

Các đường dẫn nên giữ dạng:

```js
fetch('content/courses.json')
fetch('templates/quiz.hbs')
fetch(`content/usecase/${lessonId}.quiz.json`)
```

Không nên dùng đường dẫn tuyệt đối bắt đầu bằng `/` nếu ứng dụng nằm trong thư mục con của repository.

## 15. Checklist trước khi hoàn thành

Phần đã kiểm tra tự động trong repo (không cần chạy tay):

- [x] Tổng điểm mọi file quiz bằng 100.
- [x] `lessonId` trong quiz khớp `courses.json`.
- [x] Không có service role key trong source code.
- [x] Mọi đường dẫn `fetch` là đường dẫn tương đối.
- [x] File `uc-m1-b2.html` và `uc-m1-b2.quiz.json` tồn tại, `ready: true`.

Phần cần kiểm tra trên Supabase Dashboard và trình duyệt:

- [ ] Đã chạy `supabase/01_schema.sql` → `02` → `03` → `04`.
- [ ] Truy vấn "kiểm tra bảng" trong `04_verify.sql` trả về đủ 5 bảng.
- [ ] Truy vấn RLS trong `04_verify.sql` trả về `rls_enabled = true` cho cả 5 bảng.
- [ ] Đăng nhập được.
- [ ] `profiles` đọc được profile hiện tại.
- [ ] Route `#/lesson/uc-m1-b1` tải được nội dung.
- [ ] Route `#/quiz/uc-m1-b1` tải đủ câu hỏi.
- [ ] Route `#/lesson/uc-m1-b2` và `#/quiz/uc-m1-b2` hoạt động.
- [ ] Nộp bài hiển thị đúng/sai/chưa chọn.
- [ ] Có một dòng mới trong `quiz_results`.
- [ ] Có các dòng tương ứng trong `attempts`.
- [ ] Bài đạt tạo được dòng trong `lesson_progress`.
- [ ] Nộp lại cùng một bài không tạo dòng trùng trong `lesson_progress`.
- [ ] User không đọc được dữ liệu của user khác.
- [ ] GitHub Pages tải được JSON và template.

## 16. Kiểm tra nhanh file quiz bằng PowerShell

Kiểm tra một file bất kỳ trong `content/usecase/`:

```powershell
$quiz = Get-Content .\ui-prototype\content\usecase\uc-m1-b2.quiz.json -Raw | ConvertFrom-Json
$quiz.lessonId
$quiz.questions.Count
($quiz.questions | Measure-Object -Property points -Sum).Sum
```

Kiểm tra tất cả file quiz cùng lúc:

```powershell
Get-ChildItem .\ui-prototype\content\usecase\*.quiz.json | ForEach-Object {
    $q = Get-Content $_.FullName -Raw | ConvertFrom-Json
    $sum = ($q.questions | Measure-Object -Property points -Sum).Sum
    "$($_.Name): lessonId=$($q.lessonId) count=$($q.questions.Count) total=$sum"
}
```

Kết quả mong đợi: mọi dòng đều có `total=100`.
