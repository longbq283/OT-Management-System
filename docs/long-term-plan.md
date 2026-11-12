# Nâng cấp hệ thống OT lâu dài

## Kiến trúc

Ứng dụng tĩnh HTML/CSS/ES Modules, SheetJS cục bộ và IndexedDB. Tách danh mục master, phiên bản import, bản ghi tháng, chi tiết ngày và truy vấn báo cáo. Mặc định mở dữ liệu thật; demo là chế độ tùy chọn, không seed vào database.

## Schema 3

- Projects: mã bất biến, tên chuẩn hóa để kiểm tra trùng, mô tả, trạng thái. Không có API xóa cứng; dự án ngừng hoạt động vẫn được báo cáo.
- Employees: mã chuỗi duy nhất, hồ sơ hiện tại, liên kết dự án.
- Imports: file metadata, dự án/năm/tháng do người dùng chọn, phiên bản, mapping và cảnh báo.
- OTRecords: snapshot nhân sự tại thời điểm nhập, phút NT/NN/L/tổng, trạng thái active/archived.
- OTDetails: một ngày OT của một OTRecord, khóa `[recordId,date]`, index recordId/employeeDate/importId. Được ghi/archive nguyên tử cùng bản ghi và kiểm tra khớp snapshot `OTRecords.days`.
- ImportHistory: snapshot trước/sau thay thế, hủy và lịch sử nâng cấp.
- Giữ AuditLogs, periods, mappingProfiles, Metadata để truy vết, activeIds và phát hiện sửa đồng thời.

Migration v1/v2 → v3 giữ mọi phiên bản, bổ sung OTDetails mà không reset dữ liệu. Backup v3 chứa đủ 10 bảng; nhận v1/v2 sau kiểm tra checksum và chuyển đổi. Tính toàn vẹn kiểm tra khóa, liên kết, trạng thái, chi tiết ngày, tổng phút và snapshot.

## Các giai đoạn

1. **Kiến trúc/database:** schema 3; danh mục dự án chống trùng tên/mã; dự án phải tồn tại và hoạt động trước khi import; migration, backup và kiểm tra toàn vẹn.
2. **Giao diện:** kho thật mặc định; bộ lọc năm/tháng hoặc cả năm/dự án; dashboard có chỉ số, 2 biểu đồ và cảnh báo; màn hình tháng/năm và lịch sử cán bộ.
3. **Import:** bắt buộc người dùng chọn dự án + tháng + năm trước khi đọc file; file chỉ gợi ý, không ghi đè lựa chọn; mapping và preview; thay thế/hủy có snapshot.
4. **Tính toán/báo cáo:** `buildOTReport` tách dữ liệu theo bộ lọc khỏi hạn mức toàn dự án. Kiểm tra 40h độc lập từng tháng khi xem cả năm, 200h chỉ trong từng năm; ma trận 12 tháng và Excel.
5. **Kiểm thử:** dữ liệu nhiều năm, dự án, thay thế, master trùng, gợi ý mâu thuẫn, hạn mức toàn dự án khi lọc, migration, JSON và XLSX.
6. **GitHub Pages:** kiểm tra subpath, CSP, Worker, asset cục bộ; cập nhật README; commit mã và bằng chứng kiểm thử. Bật Pages là thao tác cấu hình riêng.

Không dùng API key, backend, localStorage hoặc file Excel/danh sách nhân sự thật trong repository.

## Kết quả thực hiện

| Giai đoạn | Trạng thái | Bằng chứng |
|---|---|---|
| 1. Kiến trúc và database | Hoàn thành | Schema 3, OTDetails, migration v1/v2, kiểm tra mã/tên và trạng thái dự án, JSON tương thích cũ. `schema-v3.cjs` và `database.cjs` PASS. |
| 2. Giao diện | Hoàn thành | Kho thật mặc định; dự án lưu bền; dashboard 6 chỉ số, bộ lọc năm/tháng/dự án, 2 biểu đồ, bảng cảnh báo. |
| 3. Import | Hoàn thành | Chọn kỳ trước file; file năm 2026 được lưu đúng năm 2025 người dùng chọn; mapping/preview/xác nhận, thay thế/hủy. |
| 4. Tính toán và báo cáo | Hoàn thành | Bộ tổng hợp dùng chung; ma trận 12 tháng, hạn mức toàn dự án, số lượt vượt tháng, lịch sử nhân sự và Excel năm 6 sheet. |
| 5. Kiểm thử | Hoàn thành | 33 unit tests, 27 case hồi quy, 14 case hai năm, browser/migration/rollback đều PASS. Xem qa-long-term.md và qa-results.md. |
| 6. Chuẩn bị Pages | Hoàn thành phần chuẩn bị | Test subpath PASS; `.nojekyll`, asset và SheetJS cục bộ, README hướng dẫn. Chưa bật/phát hành Pages thay người dùng. |

Bộ kiểm thử hai năm dùng 3 dự án, 10 mã giả lập, 72 file, 336 bản ghi tháng và 788 chi tiết ngày. Thay thế một kỳ năm 2026 giảm tổng năm đó 1.937 → 1.922h, năm 2025 giữ 1.937h. Khi lọc dự án C, cán bộ có 96h tại C nhưng 240h toàn dự án vẫn được báo vượt năm 40h. Không có file nhân sự thật trong mã nguồn.
