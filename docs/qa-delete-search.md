# Kiểm thử xóa import, năm upload và tìm kiếm báo cáo — v0.6.0

Ngày chạy: 12/11/2026. Chỉ sử dụng dữ liệu giả lập, browser context tạm và IndexedDB độc lập; không thao tác kho dữ liệu của người dùng.

`npm test`: PASS toàn bộ — 38 unit test, 8 script giao diện/IndexedDB, 27 trường hợp toàn diện và 14 trường hợp quản lý nhiều năm.

| Test case | Dữ liệu đầu vào | Mong đợi | Thực tế | Trạng thái |
|---|---|---|---|---|
| Năm upload | Kho có dữ liệu lịch sử năm 2025 | Upload mới chọn từ 2026; báo cáo vẫn xem năm cũ | Danh sách 2026–2100, ban đầu chưa chọn; báo cáo/restore giữ 2025 | PASS |
| Gợi ý năm không ghi đè | Chọn 2026, file ghi 2025 | Giữ kỳ đã xác nhận, cảnh báo khác kỳ | 3 file UI lưu đúng 2026, mapping riêng theo dự án | PASS |
| Tìm mã/tên/đơn vị | 3 cán bộ giả lập; gõ `nguyen gia lap`, mã hoặc đơn vị không dấu | Tìm ngay trong báo cáo | Khớp tên Nguyễn Giả Lập, mã và đơn vị; có nút xóa tìm kiếm | PASS |
| Tìm trong mọi báo cáo | Tổng quan, tháng, năm, vượt tháng và Cảnh báo | Bảng/chỉ số/biểu đồ/cảnh báo theo người khớp | Các màn hình cập nhật, ma trận năm chỉ còn người khớp; tìm rỗng trả đủ người | PASS |
| Hạn mức khi tìm/lọc dự án | BIDC 25h + LVB 18h tháng 10; BIDC 1h tháng 11 | Lọc BIDC nhưng hạn mức vẫn toàn dự án | BIDC tháng 25h, toàn dự án 43h, vượt tháng 3h; toàn năm 44h | PASS |
| CSV và Excel theo tìm kiếm | Chọn một mã trong báo cáo năm BIDC | Không lẫn cán bộ khác; giữ hạn mức toàn dự án | CSV và cả 6 sheet Excel đúng phạm vi, tổng toàn năm 44h | PASS |
| Hủy xóa | Chọn file BIDC 27h, bấm Hủy | Không thay đổi số liệu | File vẫn có hiệu lực, có thể mở lại xác nhận | PASS |
| Chưa xác nhận | Bấm xóa khi chưa đánh dấu xác nhận | Không xóa | Hiện yêu cầu xác nhận, dữ liệu giữ nguyên | PASS |
| Tab khác thay đổi | Mở xác nhận rồi sửa danh mục từ tab khác | Chặn quyết định dựa trên dữ liệu cũ | Báo thay đổi dữ liệu, phải mở lại xác nhận | PASS |
| Rollback lỗi ghi | Giả lập QuotaExceededError khi ghi OTDetails | Không thay đổi bảng nào | Checksum toàn bộ kho trước/sau giống nhau | PASS |
| Xóa đúng file | File BIDC 27h; LVB 19h; kỳ BIDC tháng 11 và năm 2025 khác | Chỉ loại 27h khỏi kỳ đã chọn | Tháng 10 còn 19h; tháng 11 còn 1h; 2025 giữ 3h | PASS |
| Lịch sử và liên kết | File đã xóa có OTDetails | Giữ dấu vết, không còn cộng OT | Imports có deletedAt; OTRecords/OTDetails archived; membership cập nhật; lịch sử trước 27h/sau 0h | PASS |
| Reload và xóa lặp | File đã xóa | Không xuất hiện nút xóa lại, không cộng giờ trở lại | Hiện Đã xóa, API từ chối xóa lặp, revision không tăng | PASS |
| Backup/restore sau xóa | Backup có kỳ activeIds rỗng và lịch sử xóa | Khôi phục đầy đủ và hợp lệ | 10 bảng hợp lệ, tổng tháng 19h, trạng thái xóa/snapshot được giữ | PASS |
| Upload lại kỳ đã xóa | File sửa BIDC 12h, chọn Nhập mới | Cho nhập lại, không cộng file sai | Tổng tháng 31h = 19h LVB + 12h BIDC | PASS |
| Xóa bản thay thế | Thay file sửa lần nữa rồi xóa bản đang có hiệu lực | Không tự khôi phục phiên bản cũ | Tổng tháng trở lại 19h; các file BIDC cũ không được cộng lại | PASS |
| Giao diện điện thoại | 390px, tìm kiếm báo cáo | Không tràn ngang toàn trang | Tìm được cán bộ, bảng cuộn trong vùng; không lỗi JavaScript | PASS |

Tái lập: `node tests/browser/delete-search.cjs`, `npm run test:unit`, hoặc `npm test`. Fixtures Excel được sinh trong bộ nhớ; không commit file nhân sự thật. Xóa ở đây là loại khỏi dữ liệu OT có hiệu lực, giữ lịch sử phục vụ đối chiếu; không xóa vĩnh viễn hồ sơ cán bộ hoặc danh mục dự án.
