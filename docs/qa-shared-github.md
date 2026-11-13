# Kiểm thử dữ liệu công khai dùng chung GitHub — v0.7.0

Ngày kiểm tra: 13/11/2026 (Asia/Bangkok). Dữ liệu giả lập, nhiều browser context độc lập, IndexedDB riêng trên mỗi context. GitHub Contents/Blob API được mô phỏng bằng Playwright route, gồm SHA/revision, token đọc/ghi, lỗi quyền, xung đột và lỗi mạng; không ghi commit thật trong kiểm thử. Quy trình import dùng file XLSX sinh trong bộ nhớ và SheetJS Worker thật.

| Test case | Đầu vào | Mong đợi | Thực tế | Trạng thái |
|---|---|---|---|---|
| Chuyển kho cũ lần đầu | Máy A có BIDC, một cán bộ `000001`, OT 2h; GitHub chưa khởi tạo | Giữ dữ liệu cục bộ, chỉ chia sẻ sau xác nhận | Không tự xóa/publish; xác nhận tải backup trước khi gửi JSON | PASS |
| Xem trên máy khác | Máy B mới hoàn toàn, không token | Tải dữ liệu chung và tính báo cáo đúng | Thấy một cán bộ, đúng mã chuỗi, NT/tổng 2h; chỉ xem | PASS |
| Quyền ghi | Người xem gọi API lưu dự án; token chỉ đọc thử PUT | Không đổi dữ liệu chung | Chặn ghi khi không token; token chỉ đọc bị GitHub từ chối; rollback cache | PASS |
| Bảo toàn token | Kết nối phiên bằng token giả lập | Token chỉ gửi trong Authorization, không lưu/xuất | Không xuất hiện trong JSON, IndexedDB hoặc nội dung commit; reload mất token | PASS |
| Tiếng Việt và JSON lớn | Tên có dấu; metadata GitHub không chứa base64 khi file >1 MB | UTF-8 đúng, tải blob theo SHA bất biến | Tên/mã giữ nguyên; dùng đúng endpoint blob của SHA đã đọc | PASS |
| Hai thiết bị cùng sửa | A gửi dự án mới, B giữ revision cũ | Không ghi đè thay đổi A | B bị chặn trước PUT; tải bản chung rồi làm lại | PASS |
| Xung đột lúc PUT | Server đổi SHA sau GET và trả 409 | Không làm mất bản khác hoặc giữ bản sai trong cache | Rollback phần thay đổi cục bộ, không ghi đè GitHub | PASS |
| PUT đã commit nhưng mất phản hồi | Server nhận dữ liệu rồi đóng kết nối | Xác minh trước khi thử ghi lại | Đọc lại đúng revision/checksum; một commit duy nhất được công nhận | PASS |
| Import từ máy quản trị | B upload XLSX 1,5h vào tháng 11, cùng mã cán bộ | Xuất bản sau xác nhận; máy C mới đọc được | C thấy tháng 11 là 1,5h, năm cộng đúng 3,5h | PASS |
| Thay thế và xóa | Tháng 11: 1,5h → 3h → xóa | Tổng năm 3,5h → 5h → 2h; giữ lịch sử | Đúng tổng và trạng thái archived/deletedAt; bản cũ không tự có hiệu lực lại | PASS |
| Ghi chưa rõ kết quả | PUT mất mạng, không kiểm tra được server | Giữ bản chờ, không báo thành công | Dự án chờ còn sau reload; chặn sửa tiếp, cho gửi lại có xác nhận | PASS |
| API lỗi, đọc dự phòng | API không kết nối được, Pages JSON còn hoạt động | Có thể xem bản dự phòng, không tự hạ cache sạch khác revision | Có cảnh báo nguồn dự phòng; bản cache giữ nguyên khi khác revision | PASS |
| Kho cục bộ khác kho chung | Máy D có dự án LOCALONLY chưa từng chia sẻ | Không tự thay thế dữ liệu | Giữ dự án, chỉ dùng bản chung sau xác nhận và tải backup của LOCALONLY | PASS |
| JSON hỏng | Remote backup sai checksum | Không hỏng cache đang xem | Báo Checksum, vẫn giữ cán bộ/số giờ hợp lệ trên thiết bị | PASS |
| Tab phiên bản cũ cùng ghi | Tab cũ sửa IndexedDB khi PUT của tab quản trị đang chờ | Không coi phần sửa ngoài snapshot là đã đồng bộ, không làm mất thay đổi | Giữ cả hai thay đổi ở trạng thái chờ; gửi lại có xác nhận giữ đủ cả hai trên GitHub | PASS |
| Mobile và đường dẫn con | Chrome 390px, website dưới /OT-Management-System/ | Tài nguyên, API, cache và banner hoạt động | Không tràn ngang toàn trang, không lỗi JavaScript, đúng đường dẫn dữ liệu | PASS |

Lệnh: `npm test`. Bộ kiểm thử gồm 41 unit test, 9 script browser, 27 trường hợp toàn diện và 14 trường hợp nhiều năm. Các unit test mới nằm ở `tests/unit/github-client.test.mjs`; kịch bản nhiều thiết bị ở `tests/browser/shared-github.cjs`.

Giới hạn xác minh: môi trường thực thi trả Forbidden khi gọi GitHub REST API trực tiếp, nên chưa xác nhận PUT thật bằng token của người dùng hoặc thời điểm Pages deploy. Git push mã được thực hiện riêng; file dữ liệu chung ban đầu là manifest rỗng, không seed nhân sự/demo. Dữ liệu thật đang ở trình duyệt người dùng cần thao tác **Quản trị GitHub → Sao lưu & gửi dữ liệu máy này lên GitHub** trên chính máy đó để khởi tạo kho chung. Hướng dẫn token quyền Contents và chuyển dữ liệu nằm trong README.
