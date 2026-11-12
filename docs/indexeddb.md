# IndexedDB — schema 3

Xem [kiến trúc và kế hoạch theo giai đoạn](long-term-plan.md) và [kết quả hai năm](qa-long-term.md).

| Store | Khóa | Vai trò |
|---|---|---|
| Projects | id | Danh mục riêng, kiểm tra trùng mã/tên trong transaction; chỉ soft deactivate |
| Employees | employeeId (chuỗi) | Hồ sơ hiện tại; không ghi đè dữ liệu nguồn lịch sử |
| Imports | id | Dự án/năm/tháng người dùng chọn, hash, mapping, trạng thái phiên bản |
| OTRecords | [importId,employeeId] | Snapshot tên/đơn vị và phút NT/NN/L/tổng theo tháng |
| OTDetails | [recordId,date] | Chi tiết ngày, index recordId / employeeDate / importId, trạng thái active/archived |
| ImportHistory | id | Snapshot trước/sau, hủy và lịch sử phiên bản |
| AuditLogs | id | Nhật ký thao tác cục bộ |
| periods | [projectId,year,month] | Revision và activeIds của kỳ |
| mappingProfiles | id | Mapping theo dự án |
| Metadata | key | Revision toàn database, tránh ghi sau preview cũ |

OTDetails và OTRecords.days phải khớp hoàn toàn; giữ snapshot ngày để bản ghi có thể truy vết độc lập, kiểm tra toàn vẹn phát hiện bất đồng giữa hai store.

Mỗi import/replace ghi đồng thời master, Imports, OTRecords, OTDetails, periods, history và audit. Thay thế archive toàn bộ phiên bản cũ của kỳ; không xóa lịch sử. Kỳ mới không tạo dự án ngầm. Không nhận bổ sung cộng chồng trong phiên bản quản lý kỳ này; các phiên bản bổ sung từ dữ liệu cũ vẫn được giữ và được thay thế cùng kỳ.

Migration v1/v2 → v3 thêm OTDetails, index còn thiếu và nameKey, giữ mã có số 0 đầu, trạng thái và phiên bản. Nếu dự án trùng tên đã tồn tại ở dữ liệu cũ, không tự merge/xóa; kiểm tra toàn vẹn sẽ báo lỗi để người dùng đổi tên.

Backup v3 có đủ 10 bảng; kiểm tra checksum SHA-256, cấu trúc, khóa, quan hệ, trạng thái, membership, phút/ngày và snapshot. Backup v1/v2 được chuyển đổi trước khi restore; không bịa snapshot đã thiếu ở v1. Restore thay toàn bộ trong một transaction, tải bản sao hiện tại trước khi ghi, tăng revision hiện tại và thêm audit. Thất bại hoàn tác cả clear lẫn put.

Các phép tính dùng phút nguyên. `buildOTReport` xác định nhóm cán bộ/phút theo bộ lọc nhưng dùng toàn bộ dự án trong năm để tính hạn mức, kiểm tra 40h cho từng tháng và 200h cho đúng năm đó. Năm trước chỉ dùng cho lịch sử, không cộng vào hạn mức năm đang xem.

Truy vấn `getOTReport`, `getEmployeeOTSummary`, `getEmployeeOTHistory` được công khai qua `assets/js/database.js`. Nhật ký không chống sửa đổi bởi chủ trình duyệt; không thay thế audit server.
