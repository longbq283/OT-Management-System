# Kiểm thử thêm dự án và khôi phục lỗi GitHub — v0.7.1

Ngày kiểm tra: 13/11/2026 (Asia/Bangkok). Chỉ dùng dự án giả lập, IndexedDB tạm và GitHub API mô phỏng. Không tạo dự án thử trong kho GitHub thật, không thay đổi file `data/shared-ot.json` đang dùng.

Các vấn đề đã tái hiện và sửa: thông báo lỗi của form nằm trong toast bên ngoài dialog nên bị lớp nền che; kết nối GitHub không quay lại thao tác thêm đang làm; lỗi token/giới hạn API/422 bị gom chung; lỗi xác thực ở bước đọc trước khi ghi chưa xóa trạng thái token hỏng. Bản sửa có thông báo ngay trong form, giữ bản nháp khi phục hồi, phân biệt lỗi HTTP và khóa gửi lặp.

| Test case | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Trạng thái |
|---|---|---|---|---|
| Dự án đầu tiên | GitHub initialized=true nhưng 0 dự án/cán bộ, Metadata revision=1 | Thêm được dự án ngay sau kết nối | Tự mở form, chỉ một PUT tạo BIDC; không cần publish một bản rỗng | PASS |
| Kết nối từ nút Thêm | Phiên chưa có token | Kết nối rồi tiếp tục đúng thao tác | Tự quay lại form thêm dự án | PASS |
| Mã không hợp lệ | Mã có khoảng trắng, tên hợp lệ | Lỗi hiển thị trong dialog, không ghi | Thông báo tiếng Việt, tô trường mã, giữ dữ liệu nhập; 0 PUT | PASS |
| Chuẩn hóa mã | Nhập `bidc` | Lưu một mã `BIDC` | Đúng mã viết hoa, tên giữ tiếng Việt | PASS |
| Trùng mã và tên | BIDC đã có; tên cùng chữ khác hoa/thường/khoảng trắng | Từ chối trước khi ghi | Báo đúng từng trường; không tăng số commit | PASS |
| Token hết hạn khi lưu | GET trước PUT trả 401 | Xóa token hỏng, không tạo dự án; cho kết nối lại | Lỗi trong form, nối lại token và giữ mã/tên/phụ trách/mô tả để lưu tiếp | PASS |
| Không có quyền ghi | Token đọc được nhưng PUT trả 403 | Không báo lưu thành công, không lưu dự án nửa chừng | Rollback cache, yêu cầu Contents: Read and write, đổi token rồi lưu bản nháp được | PASS |
| Giới hạn API | 403 rate-limit / 429, Retry-After | Giữ token hợp lệ và dữ liệu form | Thông báo thời gian chờ, không gắn cờ xung đột; thử lại thành công | PASS |
| Payload bị từ chối | 422 Validation Failed, trường content | Không báo nhầm xung đột SHA | Phân loại rejected, giữ token/form, không có dự án lỗi trong cache | PASS |
| Nhánh chặn ghi | 403 yêu cầu pull request | Báo đúng quy tắc nhánh | Không báo token hết hạn; giữ token và rollback dự án chưa lưu | PASS |
| SHA thay đổi lúc PUT | Server trả 409 | Không ghi đè; tiếp tục sau tải bản mới | Kiểm tra GitHub và tiếp tục trả lại form đã điền, lưu một lần | PASS |
| Gửi lặp | Giữ PUT chưa phản hồi, phát submit lần hai | Chỉ gửi/lưu một lần | Nút lưu/hủy khóa; một dự án ONCE và một PUT thành công | PASS |
| Thêm từ Upload | Đã chọn 10/2026, tạo UPLOAD-C | Chọn dự án vừa tạo và giữ kỳ | Đúng UPLOAD-C, tháng 10, năm 2026 | PASS |
| Token hết hạn khi refresh | GET trả 401 trong phiên đã kết nối | Có thể quay lại đọc công khai và nối token mới | Bỏ token hỏng, không gắn lỗi mất mạng; refresh tiếp đọc được | PASS |
| Kho cục bộ khác bản chung | Thiết bị có dự án LOCAL chưa chia sẻ | Không tự bỏ dữ liệu; chỉ tiếp tục sau lựa chọn | Tải backup LOCAL trước khi dùng bản chung, sau đó mở đúng form thêm | PASS |
| Mobile và credential | 390px, thông báo mã sai; token giả lập | Nhìn rõ lỗi, không tràn trang; không đưa token vào JSON | Lỗi trong dialog, không lỗi JavaScript, JSON không có token | PASS |

`npm test`: 42 unit test, 10 script giao diện/IndexedDB (gồm `project-recovery.cjs`), 27 trường hợp toàn diện và 14 trường hợp nhiều năm đều PASS. Các luồng import Excel, thay thế, xóa, tính OT, báo cáo, backup/restore, migration và đồng bộ đa thiết bị được kiểm tra lại.

API thật vẫn yêu cầu token có quyền ghi repository. Kiểm thử không dùng token thật hoặc thay đổi quyền GitHub; lỗi quyền/nhánh được thông báo đúng để quản trị viên cấu hình. Nội dung lỗi provider không được đưa nguyên văn vào giao diện nếu có thể chứa credential; chỉ hiển thị phân loại và tên trường đã cho phép.
