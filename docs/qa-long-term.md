# Kiểm thử quản lý OT lâu dài

Dữ liệu: 3 dự án, 10 cán bộ giả lập, 24 tháng (2025–2026), 72 file, 336 dòng tháng.

Kết quả: 14 PASS / 0 FAIL.

| Test case | Mong đợi | Thực tế | Trạng thái |
|---|---|---|---|
| Kho thật mặc định và danh mục riêng | 0 nhân sự ban đầu; tạo 3 dự án; trùng tên/mã bị từ chối | 3 dự án; không có nhân sự seed; hai kiểu trùng đều bị từ chối | PASS |
| Upload chọn kỳ, nhận diện không ghi đè | Chọn 2026, file ghi 2025; lưu đúng 2026 sau xác nhận | 3 file qua UI; năm 2026 được giữ nguyên, mapping C lưu riêng | PASS |
| Lưu dữ liệu thật cho 24 tháng | 72 imports, 336 OTRecords, 788 OTDetails; 10 nhân sự, 3 dự án | 72 imports / 336 dòng tháng / 788 ngày; dữ liệu 2025 và 2026 tách biệt | PASS |
| Báo cáo nhiều năm không cộng chéo | Mỗi năm tổng 1.937h; mã 000001 là 516h/năm | 2025: 1.937h; 2026: 1.937h; 2024: 0h; không cộng thành 3.874h trong một năm | PASS |
| Bộ lọc dự án giữ hạn mức toàn dự án | 000001 BIDC 25h, toàn dự án 43h; 000005 C 96h/năm nhưng toàn dự án 240h | BIDC vẫn cảnh báo vượt tháng 3h; C vẫn cảnh báo vượt năm 40h | PASS |
| Ma trận 12 tháng và ngưỡng độc lập | 12 lượt vượt tháng/năm; 000006 đúng 40h và 200h không vượt | 12/12 tháng có đúng 1 lượt vượt; 4 cán bộ vượt năm; đúng ngưỡng không cảnh báo | PASS |
| Snapshot danh tính và cảnh báo mã/tên | Tên/đơn vị thay đổi theo năm; cùng tên khác mã không gộp | 10 mã giữ nguyên; snapshot hai năm khác nhau; hai loại xung đột tên đều có cảnh báo | PASS |
| Dự án ngừng hoạt động giữ lịch sử | Ngừng LVB: không chọn upload mới, vẫn báo cáo được 2 năm | LVB bị loại khỏi upload nhưng dữ liệu 2025/2026 và danh mục vẫn còn | PASS |
| Giao diện dashboard và báo cáo năm | Lọc cả năm/dự án, hiển thị 12 tháng và hạn mức toàn dự án | Dashboard 6 chỉ số; báo cáo năm có ma trận 12 tháng và chi tiết từng dự án | PASS |
| Xuất Excel năm theo dự án | C/2026: 6 sheet; mã 000005 OT lọc 96h, tổng năm 240h, vượt 40h | XLSX 6 sheet đọc lại đúng: 12 × 8h, 96h lọc, 240h toàn dự án, 40h vượt | PASS |
| Thay thế một kỳ không ảnh hưởng năm khác | 2026/BIDC/tháng10: 25h → 10h; 2025 giữ nguyên | 2026 giảm còn 1.922h; 2025 vẫn 1.937h; snapshot và ngày cũ được archive | PASS |
| Lịch sử nhân sự qua nhiều năm | 000001: hiển thị tên/đơn vị nguồn 2025/2026 và bản đã thay thế | Ledger đủ hai năm, hai đơn vị nguồn và phiên bản archived | PASS |
| Backup/restore toàn vẹn 10 bảng | JSON v3 sau thay thế, khôi phục trong browser context mới · Bảo toàn OTDetails, snapshot, inactive; tổng từng năm giữ đúng | 10 bảng hợp lệ; ngày/lịch sử/inactive giữ nguyên; 2025=1.937h, 2026=1.922h | PASS |
| Kiểm tra toàn vẹn và lưu bền | Reload, kiểm tra OTDetails/khóa/tổng; màn hình tháng/năm 390px · Kho thật giữ 10 nhân sự, không thêm DEMO; không lỗi trình duyệt | 10 nhân sự, 0 DEMO; toàn vẹn hợp lệ; 4 màn hình mobile không tràn ngang/lỗi JS | PASS |

Toàn bộ file được tạo từ fixture; không có dữ liệu nhân sự thật. Khôi phục được kiểm tra trong browser context độc lập.
