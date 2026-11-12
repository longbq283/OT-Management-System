# Quy tắc quản lý OT lâu dài

- Dự án là danh mục độc lập; mã/tên không trùng; dự án có lịch sử chỉ được ngừng hoạt động, không xóa cứng.
- Mỗi upload chọn rõ dự án đang hoạt động, năm, tháng rồi file. File chỉ gợi ý kỳ; lựa chọn người dùng và xác nhận preview là chính thức.
- Khóa kỳ `[projectId,year,month]`. Kỳ trùng chỉ thay thế hoặc hủy, không cộng chồng. Giữ snapshot trước/sau và phiên bản đã archive.
- NT: ngày thường. NN: ngày nghỉ và L. Có chi tiết ngày thì tính từ ngày; tổng Excel chỉ đối chiếu. Tổng hợp NT/NN/tổng vẫn hỗ trợ.
- Mã cán bộ duy nhất dạng chuỗi, bảo toàn số 0 đầu. Cùng mã khác tên và cùng tên khác mã chỉ cảnh báo, không gộp. Tên/đơn vị nguồn được giữ theo từng phiên bản.
- 40h/tháng/người, kiểm tra riêng từng tháng; 200h/năm/người, chỉ cộng trong đúng năm. Cộng tất cả dự án kể cả dự án đã ngừng hoạt động có dữ liệu hiệu lực.
- Lọc dự án thay đổi số giờ/nhóm cán bộ hiển thị, không thay đổi tổng dùng kiểm tra hạn mức của cán bộ đó.
- Vượt 40/200 và trùng ngày liên dự án chỉ cảnh báo; không chặn hoặc tự xóa. Dữ liệu thiếu ngày được báo chưa kiểm tra đầy đủ.
- Gần hạn mức: 32–40h/tháng hoặc 160–200h/năm; không coi đúng 40/200 là vượt.
- Còn lại = max(0,hạn mức−tổng); vượt = max(0,tổng−hạn mức). Tính bằng phút nguyên, hiển thị giờ tối đa 2 số thập phân.
- Năm/tháng chưa nhập không chứng minh cán bộ có 0h thực tế. Tổng chỉ phản ánh dữ liệu đã lưu.
- Snapshot nhân sự và ledger giữ dữ liệu qua nhiều năm. Demo không seed vào IndexedDB.

Xem [database](indexeddb.md), [import](excel-import.md) và [kế hoạch nâng cấp](long-term-plan.md).
