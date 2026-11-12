# Sửa upload và tìm lại dữ liệu — 0.5.1

- Khi chưa chọn đủ dự án/năm/tháng, input file từng bị disabled mà vùng chọn không giải thích. Vùng chọn nay hiện yêu cầu còn thiếu, thông báo tại chỗ khi bấm, hỗ trợ bàn phím và đồng bộ cả sự kiện input/change.
- Đọc file không đồng nghĩa đã lưu. Mapping/preview được đánh dấu rõ chưa lưu, sau xác nhận mới thông báo số cán bộ, dự án và kỳ đã lưu.
- Bộ lọc dự án cũ có thể che nhân sự của dự án vừa import. Sau save, reset bộ lọc/tìm kiếm và chọn đúng kỳ vừa lưu.
- Trước đây khởi động luôn chọn 11/2026 dù dữ liệu nằm ở kỳ khác. Nay chọn kỳ của import đang hiệu lực được lưu gần nhất; không dùng lịch sử hủy hoặc ghi đè kỳ upload do người dùng chọn.
- Tra cứu/lịch sử hiển thị số file, bản ghi thực có và các kỳ đã lưu; có nút xem dữ liệu mới nhất, không xóa hoặc sửa dữ liệu nguồn.
- Tìm kiếm dùng chuỗi gốc thay vì chuỗi HTML-escaped, để tên có dấu & được tìm đúng.
- Thêm version URL cho entry và module import đã sửa để hạn chế cache phiên bản cũ trên Pages. Có thể cần Command+Shift+R trên Chrome macOS sau khi Pages cập nhật.

Kiểm thử: `tests/browser/upload-lookup.cjs` dùng Chrome/Chromium headless với hộp chọn file thật, sự kiện change-only, phục hồi sau file không hợp lệ, một kỳ cũ/dự án C và file BIDC 39 cán bộ giả lập ở kỳ khác. Xác nhận tìm thấy sau save, reload, đổi kỳ và bỏ bộ lọc cũ; kiểm tra tìm kiếm `& Giả`. `npm test` gồm 33 unit, browser regression, 27 case toàn diện và 14 case hai năm đều PASS.

Không đổi schema, không clear IndexedDB, không đưa file/dữ liệu nhân sự thật vào repository. Không thể kiểm tra trực tiếp dữ liệu trình duyệt hoặc workbook thực tế của người dùng chỉ từ ảnh; các kết quả trên là tái hiện bằng fixture giả lập.
