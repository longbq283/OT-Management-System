# Kết quả kiểm thử toàn diện OT Management System

Thời điểm chạy: 2026-11-12 18:45:57 (Asia/Bangkok).

Kết quả: **27 PASS / 0 FAIL**. Chromium headless, browser context tạm; không sử dụng hoặc sửa dữ liệu trình duyệt người dùng.

Fixture: 3 dự án BIDC/LVB/Dự án C; 10 mã giả lập `000001`–`000010`; 12 tháng năm 2026; 36 workbook, 168 dòng cán bộ. Oracle được dựng trực tiếp từ đặc tả dữ liệu trong `tests/fixtures/full-year.cjs`, không dùng hàm tính OT/nhận diện của ứng dụng.

| Test case | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Trạng thái |
|---|---|---|---|---|
| TC01 — Bộ dữ liệu giả lập | 3 dự án, 10 cán bộ, 12 tháng | 36 file, 168 bản ghi; tổng năm 1.937h | 36 file; 168 bản ghi; 10 mã; 12 tháng; 116.220 phút = 1.937h | **PASS** |
| TC02 — Import Excel qua giao diện | 3 file tháng 1: BIDC, LVB đổi cột, C nhãn mới | Import thật 14 cán bộ-dự án, mapping C lưu theo dự án | 3 file đọc trong Worker, lưu 14 OTRecords; mapping C đã lưu | **PASS** |
| TC03 — Import đủ 12 tháng và tái sử dụng mapping | 33 file tháng 2–12, 3 cấu trúc | 36 imports active, 168 dòng; C tái dùng mapping 11 lần | 36 imports active; 168 OTRecords; 11/11 mẫu C tiếp theo nhận diện đúng | **PASS** |
| TC04 — NT, NN, L và tổng theo từng dòng | 168 dòng chi tiết, có ngày NT/NN/L | Khớp oracle mọi dòng; NT 1.210,2h; NN 726,8h (L 246h) | 168/168 dòng khớp; NT 72.612 phút; NN 43.608 phút, gồm L 14.760 phút | **PASS** |
| TC05 — Không nhập dòng tổng và giữ mã chuỗi | 36 dòng tổng; mã 000001–000010 | 10 Employees, 3 Projects; không có cán bộ tổng cộng/DEMO | 10 mã chuỗi giữ số 0 đầu; 3 dự án; 36 dòng tổng bị bỏ qua | **PASS** |
| TC06 — Cộng nhiều dự án, nhiều tháng và 6 chỉ tiêu | 10 mã × 12 tháng × 6 phép tính | 720 giá trị khớp oracle độc lập; 000001 = 43h/tháng, 516h/năm | 720/720 giá trị khớp; 000001: 2.580 phút/tháng, 30.960 phút/năm | **PASS** |
| TC07 — Cảnh báo hạn mức và đúng ngưỡng | 000001 vượt tháng; 000001/2/5/9 vượt năm; 000006 đúng 40h và 200h | 12 cán bộ-tháng vượt 40h, 4 cán bộ vượt năm; đúng ngưỡng không cảnh báo | 12 lượt vượt tháng; 4 mã vượt năm; 000006 không vượt; tất cả đã nhập thành công | **PASS** |
| TC08 — Trùng ngày liên dự án không bị xóa | 000007 khai ngày 04 ở LVB và C mỗi tháng | 12 xung đột; giữ đủ 24 bản ghi dự án, 10h/tháng | 12/12 xung đột đúng; giữ 24 bản ghi; 000007 = 120h/năm | **PASS** |
| TC09 — Không cộng thêm cột tổng và đối chiếu sai lệch | File BIDC tháng 10 sửa tổng Excel của 000001 thành 999h | Tính từ ngày vẫn 25h; cảnh báo sai lệch, không thành 1.024h | 25h từ ngày; cảnh báo 999h ≠ 25h; tổng không bị cộng hai lần | **PASS** |
| TC10 — Năm thiếu và nguồn tháng mâu thuẫn | BIDC bỏ năm ở A3; file T11 nhưng tiêu đề tháng 10 | Thiếu năm chặn lưu; mâu thuẫn tháng yêu cầu chọn lại | Thiếu năm: canSave=false; hai tháng 10/11: conflict=true, tháng chưa chọn | **PASS** |
| TC11 — Chặn lỗi dữ liệu, không ghi một phần | Giờ âm, thiếu mã, trùng mã, loại ngày lạ, ngày 31/02 | 5/5 file lỗi không được lưu; kho chính giữ 168 bản ghi | 5/5 file lỗi có canSave=false; 168 bản ghi gốc không đổi | **PASS** |
| TC12 — Hỗ trợ mẫu chỉ có tổng hợp | BIDC tháng 10 bỏ toàn bộ cột ngày, giữ NT/NN/tổng | 5 cán bộ đọc được; NT+NN đúng, cảnh báo chưa kiểm tra ngày | 5/5 dòng tổng hợp đúng; không cộng NT + NN + tổng | **PASS** |
| TC13 — Xuất Excel tháng và đọc lại | Tháng 10, tất cả dự án | 10 mã chuỗi, 14 dòng dự án; tổng 148,25h; NT/NN và 6 chỉ tiêu đúng | 10 cán bộ; 14 dòng; 148.25h; mã dạng text, số dạng numeric | **PASS** |
| TC14 — Xuất Excel năm và đọc lại | 12 tháng, 3 dự án, dữ liệu trùng ngày | 10 cán bộ; 168 dòng dự án; tổng 1.937h; giữ ngày trùng | 10 cán bộ; 168 dòng; 1937h; 394 dòng ngày | **PASS** |
| TC15 — Xuất Excel theo cảnh báo | Báo cáo vượt 40h tháng 10 | Chỉ 000001, 43h tháng/516h năm; 2 dòng dự án | 1 cán bộ 000001; tháng 43h, năm 516h; 2 dòng dự án | **PASS** |
| TC16 — Thay thế file và snapshot trước/sau | BIDC tháng 10: 000001 từ 25h xuống 10h | 000001: 28h tháng, 501h năm; toàn năm 1.922h; giữ bản cũ | Tháng 28h; năm 501h; tổng 1.922h; snapshot 67,5h → 52,5h; 5 dòng archived | **PASS** |
| TC17 — Chống cộng trùng khi đổi tên/thứ tự và bổ sung | File thay thế hiện tại đảo thứ tự dòng; mode initial/supplement | Từ chối cả hai; Imports/OTRecords/tổng giờ không đổi | 2/2 thao tác bị từ chối; không ghi thêm và không tăng tổng | **PASS** |
| TC18 — Thay lại file giống hệt không cộng trùng | Chọn replace rõ ràng với cùng nội dung đang hiệu lực | Tạo lịch sử mới, tổng vẫn 1.922h, chỉ 36 import active | 36 active; 2 phiên bản archived; tổng 1.922h không tăng | **PASS** |
| TC19 — Hai thao tác đồng thời từ cùng preview | 2 replace cùng revision cho BIDC tháng 10 | Chỉ một commit; thao tác còn lại báo dữ liệu đã thay đổi | 1 commit, 1 từ chối revision cũ; tổng không đổi | **PASS** |
| TC20 — Hủy và rollback khi lỗi quota | Hủy lượt nhập; mô phỏng lỗi add OTRecords trong replace | Không đổi OT khi hủy; toàn bộ 10 bảng rollback khi lỗi ghi | Hủy không thay OT; lỗi quota hoàn tác 9/10 bảng và revision | **PASS** |
| TC21 — Tổng hợp sau thay thế loại phiên bản cũ | 10 cán bộ × 12 tháng sau 3 phiên bản replace | 720 giá trị vẫn khớp oracle; 168 active, 15 archived | 720/720 giá trị đúng; 168 active, 15 archived, 36 kỳ active | **PASS** |
| TC22 — Xuất Excel sau thay thế | Báo cáo năm, chỉ dữ liệu hiệu lực | 168 dòng, tổng 1.922h; không xuất 15 dòng archived | 168 dòng hiệu lực, tổng 1.922h; phiên bản cũ không được xuất | **PASS** |
| TC23 — Sao lưu toàn bộ và khôi phục ở trình duyệt mới | Backup schema 3 gồm 10 bảng, lịch sử và mapping | Bảng nghiệp vụ giữ nguyên; thêm 1 audit restore, 720 chỉ tiêu đúng | 8 bảng dữ liệu/mapping giữ nguyên; audit +1, revision tăng; 720/720 giá trị khớp | **PASS** |
| TC24 — Backup hỏng không phá dữ liệu | JSON bị sửa tổng OT nhưng giữ checksum cũ | Từ chối restore; toàn bộ 10 bảng không đổi | Báo lỗi checksum; 9/10 bảng giữ nguyên | **PASS** |
| TC25 — Lưu bền sau reload và cách ly demo | Reload website, chọn Dữ liệu đã nhập | 10 cán bộ giả lập của fixture; không thêm DEMO; tổng vẫn 1.922h | 10 mã fixture, 0 mã DEMO; 1.922h sau reload | **PASS** |
| TC26 — Giao diện và lỗi trình duyệt | Báo cáo, tra cứu, cảnh báo; 390px và 1440px | Không lỗi JavaScript/CSP và không tràn ngang toàn trang | 10/10 tổ hợp màn hình/kích thước đạt; 0 lỗi trình duyệt | **PASS** |
| TC27 — Xuất Excel giữ đúng bộ lọc tại thời điểm bấm | Làm chậm tải thư viện 200ms; bấm xuất tháng 10 rồi đổi sang tháng 9 | File vẫn là tháng 10, tổng 133,25h sau thay thế | File tháng 10 đúng 133,25h dù giao diện đã chuyển tháng 9 | **PASS** |

## Giới hạn của kết quả

- Đây là kiểm thử bằng dữ liệu giả lập; chưa đối chiếu workbook nhân sự thật.
- Excel xuất được ghi và đọc lại bằng SheetJS; không có Microsoft Excel desktop trong môi trường để xác minh giao diện in/hiển thị của Office.
- Lỗi quota được mô phỏng ở API IndexedDB để xác minh rollback, không làm đầy đĩa thật.
- Kết quả này không phải bằng chứng đã phát hành website lên GitHub Pages.
