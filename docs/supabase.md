# OT Workspace trên Supabase

Trang tài khoản và nghiệp vụ là `kiem-tra-tai-khoan.html`. GitHub Pages tự mở trang này từ trang chủ. Khi phát triển trên localhost, mở đường dẫn tài khoản trực tiếp. Bản cục bộ vẫn có ở `?legacy=1#/backup`, dùng IndexedDB để đọc, xuất và khôi phục bản sao cũ. Đồng bộ GitHub cũ chỉ được kích hoạt bằng tham số `shared=1` trên localhost để phục vụ các bài kiểm thử mô phỏng.

## Triển khai database

1. Sao lưu database trên Supabase trước khi cập nhật. Chạy `supabase/inspect.sql` trong SQL Editor và đối chiếu bốn bảng hiện có, ACL, RLS, ràng buộc và các hàm đăng ký. Migration được viết theo các tên cột đã cung cấp, khóa dự án và hồ sơ kiểu UUID, khóa kỳ gồm dự án/năm/tháng, cột phiên bản là số nguyên có giá trị mặc định 0. Kiểm tra cả các policy hạn chế hiện có nếu database có thêm policy riêng.
2. Chạy `supabase/migrations/202611250001_ot_workspace.sql` một lần bằng chủ sở hữu các bảng. Migration chạy trong transaction, kiểm tra cấu trúc trước khi thêm quyền đọc, bảng phiên bản OT, nhật ký và các RPC ghi. Nếu lỗi cấu trúc, trùng mã hoặc trùng khóa, điều tra dữ liệu và schema trước khi chạy lại. Migration giữ các dòng hiện tại.
3. Chạy `supabase/migrations/202611260001_project_admins.sql` sau migration nền để bật quản trị theo dự án. Nếu đã chạy migration nền trước đây, chỉ chạy migration quản trị dự án.
4. Trong **Authentication → Email Templates → Confirm signup**, dùng `{{ .Token }}` trong nội dung để gửi mã OTP đăng ký. Giữ xác nhận email bật, kiểm tra cấu hình SMTP và Site URL. Nếu dùng mẫu Việt hóa, ví dụ nội dung là “Mã xác nhận đăng ký OT Workspace của bạn là {{ .Token }}.” Trang xác nhận bằng `type: signup`.
5. Người dự kiến quản trị tự đăng ký bằng địa chỉ BIDV của mình rồi xác nhận OTP thật. Hồ sơ vẫn ở trạng thái chờ duyệt. Sau đó điền đúng email và mã cán bộ 8 số vào `supabase/first-admin.sql` và chạy trong SQL Editor. Script kiểm tra email đã xác nhận và từ chối chạy nếu đã có admin hoạt động. Sau khi cấp quyền, đăng xuất và đăng nhập lại.
6. Admin tạo dự án, duyệt tài khoản và phân công. Khi kỳ chưa cấu hình, người dùng không thể nhập. Mở kỳ theo dự án, năm và tháng. Để xác minh thực tế, dùng tài khoản kiểm thử được phép nhận email và một dự án thử với dữ liệu giả lập. Kiểm tra nhận OTP, đăng nhập, trạng thái chờ duyệt, ghi trong kỳ mở và từ chối trong kỳ khóa.

Trang dùng khóa publishable công khai. Mật khẩu và OTP chỉ gửi trực tiếp đến Supabase. Access token được giữ trong bộ nhớ của tab. Tải lại trang hoặc hết hạn phiên cần đăng nhập lại. Đăng xuất xóa ngay giao diện và dữ liệu của tài khoản khỏi tab.

## Đăng ký báo HTTP 500

HTTP 500 khi bấm **Đăng ký** là phản hồi lỗi của máy chủ cho `POST /auth/v1/signup`. Trong Supabase Dashboard, mở **Logs → Auth**, tìm yêu cầu theo thời điểm thử hoặc mã yêu cầu nếu giao diện hiển thị.

- Nếu log ghi `Database error saving new user`, mở **Logs → Postgres** cùng thời điểm để tìm lỗi gốc. Kiểm tra trigger trên `auth.users`, hàm `public.ot_handle_auth_user()` và ràng buộc của `public.ot_profiles`. Ứng dụng gửi `full_name` và `employee_code` đã đủ tám chữ số.
- Nếu log báo Auth Hook thất bại, kiểm tra cấu hình **Before User Created**, hàm `public.ot_require_bidv_email(jsonb)` và quyền thực thi của `supabase_auth_admin`.
- Nếu log ghi `Error sending confirmation email`, kiểm tra cấu hình SMTP, địa chỉ người gửi và nội dung mẫu **Confirm signup**. Khi tài khoản đã được tạo nhưng email chưa đến, dùng **Đã đăng ký? Nhập mã OTP → Gửi lại mã OTP** ngay trong khung Đăng ký.

Dùng thông báo lỗi gốc hoặc mã yêu cầu đã che thông tin riêng tư khi trao đổi. Giữ mật khẩu, OTP và thông tin xác thực SMTP trong giao diện thiết lập tương ứng.

## Quyền và nghiệp vụ

- Hồ sơ chờ duyệt hoặc bị vô hiệu hóa chỉ đọc được hồ sơ của mình. Người dùng hoạt động đọc OT của chính mình trong các dự án được phân công. Quản trị hệ thống quản lý danh mục, duyệt tài khoản, phân công, kỳ nhập và nhật ký. Mục **Cấp quyền quản trị dự án** cho phép cấp hoặc thu hồi quyền theo từng dự án sau khi hồ sơ đã được duyệt. Quản trị dự án xem báo cáo và mở/khóa kỳ trong các dự án được giao. Việc duyệt tài khoản, cấp quyền và nhập thay cả kỳ vẫn thuộc quản trị hệ thống. Các bảng cho tài khoản ứng dụng quyền đọc theo RLS. Thao tác ghi đi qua RPC.
- Người dùng nhập theo ngày hoặc đọc dòng khớp mã cán bộ trong Excel. Admin có thể nhập một lô cho cả dự án/kỳ. Hệ thống kiểm tra quyền sở hữu, phân công, trạng thái dự án/kỳ và hai phiên bản ngay trong transaction.
- Mỗi cán bộ chỉ có một phiên bản hiệu lực cho một dự án/kỳ. Người dùng chỉ thay thế phiên bản của mình. Khi admin chọn thay thế cả kỳ, các bản hiện hành của kỳ được lưu vào lịch sử, gồm cả người vắng mặt trong file mới. Xem trước và xác nhận trước khi lưu.
- NN bao gồm L. Khi có dữ liệu ngày, database tính lại NT/NN từ chi tiết. Các báo cáo tái sử dụng bộ tính hạn mức 40 giờ/tháng và 200 giờ/năm, không chặn vì vượt hạn mức. Lọc dự án chỉ lọc phần hiển thị. Hạn mức và cảnh báo trùng ngày dùng toàn bộ dữ liệu tài khoản có quyền đọc.
- Tài khoản có thể tải JSON dữ liệu mình được phép đọc. Admin có thêm nhật ký, phân công và hồ sơ. JSON này dùng để đối chiếu và lưu trữ; khôi phục đầy đủ một dự án Supabase dùng công cụ backup/restore của Supabase. Bản cục bộ vẫn có chức năng khôi phục JSON IndexedDB.

## Chuyển dữ liệu cũ

1. Xuất JSON từ thiết bị gốc hoặc giữ một bản JSON dữ liệu chung GitHub ở nơi được phép lưu trữ. Giữ nguyên bản sao nguồn chứa lịch sử đầy đủ. Không commit bản sao, file Excel hoặc dữ liệu cán bộ.
2. Tạo dự án ở Supabase với mã khớp mã cũ, duyệt tài khoản đã xác nhận email và phân công đúng dự án. Mở tạm những kỳ cần nhập. Đối chiếu danh tính trước nếu hai mã cũ như `23` và `00000023` cùng tồn tại. Công cụ dừng khi gặp xung đột mã chuẩn hóa, mã bất hợp lệ, dự án chưa khớp hoặc cán bộ thiếu phân công.
3. Vào **Sao lưu dữ liệu → Chuyển dữ liệu cũ**. Chọn JSON backup v1/v2/v3 hoặc JSON wrapper dữ liệu chung. Xem trước số dòng, giờ OT và trạng thái của từng kỳ. Công cụ chỉ chuyển các bản đang hiệu lực vào kỳ trống đang mở. Kỳ đã khớp được nhận diện khi kiểm tra lại. Nếu kỳ có dữ liệu khác, rà soát riêng trước khi thực hiện thao tác thay thế.
4. Xác nhận từng kỳ. Sau khi ghi, ứng dụng đọc phiên bản vừa nhập và đối chiếu từng dòng với nguồn, gồm NT, NN, phần chưa phân loại và chi tiết ngày. Xuất báo cáo tháng/năm để đối chiếu thêm, tải bản sao Supabase và khóa lại các kỳ lịch sử. Giữ lịch sử cũ trong bản JSON nguồn.
5. Dữ liệu từng công khai ở GitHub và lịch sử Git vẫn có thể được đọc. Triển khai đăng nhập không thay đổi quyền truy cập các phiên bản cũ. Chủ repository cần xử lý việc công khai theo quy trình bảo mật dữ liệu của đơn vị.

## Kiểm thử

- `npm test` chạy kiểm thử đơn vị, Chromium, tổng hợp và dài hạn. Kịch bản `tests/browser/supabase.cjs` mô phỏng API Supabase và dùng workbook giả lập. Hai bộ tổng hợp/dài hạn ghi báo cáo QA vào thư mục `docs`, nên có thể chạy toàn bộ trên một bản sao tạm của checkout.
- Fixture trong `supabase/tests` tái tạo schema hiện có theo mô tả. Trên **database PostgreSQL thử nghiệm trống**, chạy theo thứ tự `fixture.sql`, các migration theo thứ tự tên tệp, `permissions.sql` và `project-admins.sql` với `psql -v ON_ERROR_STOP=1`. Bộ test kiểm tra quyền ở SQL thật. Hook Email và API xác thực Supabase cần kiểm tra riêng trên dự án thật.
