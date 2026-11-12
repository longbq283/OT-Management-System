# IndexedDB và logic quản lý OT (v0.3)

## Schema và nâng cấp

Database `ot-management`, schema **2**. Không xóa/reset database để nâng cấp. Tất cả dữ liệu nhân sự trong kiểm thử là giả lập; không seed demo vào kho chính.

| Bảng nghiệp vụ | Khóa | Nội dung / index |
|---|---|---|
| `Employees` | `employeeId` dạng chuỗi | Tên, đơn vị, `projectIds`, thời điểm tạo/sửa. Index `unit`, `projectIds` (multiEntry). |
| `Projects` | `id` dạng chuỗi | Mã, tên, mô tả, người phụ trách, trạng thái, màu, thời điểm tạo/sửa. |
| `OTRecords` | JSON `[importId, employeeId]` | Một dòng cán bộ trong một phiên bản; phút NT/NN/L/tổng/chưa phân loại, các ngày, nguồn và dòng Excel, trạng thái active/archived. Index theo cán bộ/kỳ, dự án/kỳ, importId và trạng thái/kỳ. |
| `Imports` | UUID `id` | Metadata file, hash nội dung, dự án/kỳ, hình thức, cảnh báo, mapping sử dụng, trạng thái. Không nhúng danh sách cán bộ nữa. |
| `ImportHistory` | UUID `id` | CREATE/SUPPLEMENT/REPLACE/CANCEL; snapshot trước/sau gồm ID phiên bản, số cán bộ, tổng phút và bản ghi gốc. Index importId, periodKey, at. |
| `AuditLogs` | UUID `id` | Thao tác, đối tượng, thời điểm, actor cục bộ và chi tiết trước/sau hoặc liên kết sự kiện import. Index at, action. |

Các bảng nội bộ được sao lưu cùng dữ liệu:

- `periods`: `[projectId, year, month]`, revision và các `activeIds`.
- `mappingProfiles`: cấu hình mapping theo dự án, index projectId.
- `Metadata`: revision toàn database, dùng phát hiện thay đổi sau khi xem trước.

Nâng cấp schema 1: tách `imports.records` thành `OTRecords`; tạo Employees/Projects từ dữ liệu đã có; suy ra active/archived từ `periods`; giữ các phiên bản, mã cán bộ và mapping; thêm audit nâng cấp. Dữ liệu cũ chưa có snapshot trước thay thế sẽ được ghi rõ trong sự kiện `MIGRATE_V1`, không bịa lại lịch sử đã mất.

## Định danh và quan hệ

Mã cán bộ bắt buộc là **chuỗi**: NFC, trim, viết hoa; không ép số sang chuỗi. `000123` và `123` là hai mã khác nhau. Số 0 đã mất trong file Excel dạng số không thể tự khôi phục; importer hiển thị cảnh báo.

Một mã có một hồ sơ Employees. Cán bộ có thể có nhiều dự án; `projectIds` được dựng từ các bản ghi đang có hiệu lực, trên mọi năm. Khi thay thế, cập nhật lại quan hệ nhưng giữ hồ sơ cán bộ và dữ liệu phiên bản cũ. Sửa tên/đơn vị hồ sơ không sửa ngược dữ liệu nguồn trong lịch sử import.

## Sáu chỉ tiêu

Tất cả phép cộng/so sánh dùng **phút nguyên**, chỉ chia 60 khi hiển thị (tối đa 2 chữ số thập phân; thẻ chi tiết có tooltip số phút chính xác):

```text
Tổng OT tháng = tổng totalMinutes của cùng mã, năm, tháng, mọi dự án active
Tổng OT năm   = tổng totalMinutes của cùng mã, cùng năm, mọi tháng/dự án active
Còn lại tháng = max(0, 2.400 - tổng tháng)
Còn lại năm   = max(0, 12.000 - tổng năm)
Vượt tháng    = max(0, tổng tháng - 2.400)
Vượt năm      = max(0, tổng năm - 12.000)
```

Đúng 40 giờ/tháng hoặc 200 giờ/năm không được coi là vượt. Phiên bản archived và dữ liệu của năm khác không tham gia phép tính. Tổng năm chỉ phản ánh các kỳ đã nhập, không chứng minh dữ liệu năm đầy đủ.

Kết quả được dùng chung ở danh sách nhân sự, tra cứu, hộp chi tiết (6 chỉ tiêu), cảnh báo, báo cáo và CSV. Truy vấn `getEmployeeOTSummary` dùng index cán bộ/năm để đọc cả năm rồi tính cả 6 chỉ tiêu bằng cùng hàm nghiệp vụ.

### Ví dụ kiểm thử giả lập

| Tình huống cho mã `000123`, tháng 10/2026 | Tháng | Năm | Còn tháng | Còn năm | Vượt tháng | Vượt năm |
|---|---:|---:|---:|---:|---:|---:|
| BIDC 25h + LVB 18h, tháng 1 thêm 160h | 43h | 203h | 0h | 0h | 3h | 3h |
| Thay toàn bộ BIDC tháng 10 thành 10h | 28h | 188h | 12h | 12h | 0h | 0h |
| Đúng ngưỡng: tháng 40h, năm 200h | 40h | 200h | 0h | 0h | 0h | 0h |
| Chưa có dữ liệu | 0h | 0h | 40h | 200h | 0h | 0h |

Có thêm kiểm thử một phút vượt ngưỡng, cộng 1.000 bản ghi một phút, khác năm, mã tương tự thiếu số 0 và phiên bản archived.

## Upload và thay thế

- Nhập mới vào kỳ đã có dữ liệu: giao diện cho **Thay thế dữ liệu kỳ này** hoặc **Hủy lượt nhập**. Nội dung giống hệt vẫn có thể thay thế nếu người dùng chọn rõ thao tác này.
- Bổ sung vẫn chỉ được chứa cán bộ chưa có trong tất cả file có hiệu lực của cùng dự án/kỳ.
- Thay thế toàn bộ kỳ: archive phiên bản cũ, thêm phiên bản mới, chuyển activeIds, cập nhật master/membership, lưu snapshot trước/sau và audit trong **cùng transaction**.
- Hủy: lưu sự kiện hủy và audit; không tạo Imports/OTRecords, không thay đổi giờ có hiệu lực.
- Trùng ngày cùng mã ở dự án khác: **chỉ cảnh báo** theo quy tắc mới; cho phép lưu sau xác nhận và giữ cả hai bản ghi trong tổng OT. Không tự khử trùng/xóa. Tab **Trùng ngày** trình bày các xung đột phát hiện được.
- Vượt 40h/tháng hoặc 200h/năm: chỉ cảnh báo, không chặn lưu. Các lỗi định dạng, mã thiếu, số giờ âm hoặc tổng không nhất quán vẫn phải sửa trước khi lưu.
- Dữ liệu tổng hợp không có ngày: cảnh báo không đủ căn cứ kiểm tra trùng ngày.

Importer đọc lại dữ liệu trong transaction và so cả revision kỳ lẫn revision database khi được cung cấp. Nếu dữ liệu đổi sau xem trước, yêu cầu kiểm tra lại. Các API cấp thấp nên truyền `databaseRevision` từ snapshot, giống giao diện import. Các tab cũ cần tải lại/chọn lại “Dữ liệu đã nhập” để cập nhật dashboard.

## Audit và thao tác master

Tạo/sửa dự án, tạo/sửa hồ sơ cán bộ, lưu mapping, import, bổ sung, thay thế, hủy, migration và khôi phục đều được ghi nhận. Lịch sử import có snapshot trước/sau; nhật ký có thể xem tại **Lịch sử import**. Không triển khai tự động xóa phiên bản hoặc xóa trùng ngày.

AuditLogs là dữ liệu cục bộ mà chủ trình duyệt có thể sửa; không phải audit server chống giả mạo.

## Sao lưu và khôi phục JSON

Backup v2 chứa đủ **6 bảng nghiệp vụ và 3 bảng nội bộ**, schemaVersion, exportedAt, checksum SHA-256 của format/schema/tables. Checksum phát hiện thay đổi/hỏng ngoài ý muốn; không phải chữ ký xác thực nguồn.

Quy trình khôi phục:

1. Chọn JSON kho chính, tối đa 20 MB và 100.000 dòng/bảng. Không nhận backup DEMO.
2. Kiểm tra checksum, schema, khóa trùng/không phải chuỗi, liên kết nhân sự/dự án/import/kỳ, active/archived, phút/ngày, membership và snapshot.
3. Hiển thị số dòng từng bảng, yêu cầu xác nhận thay toàn bộ dữ liệu.
4. Tải bản sao hiện tại thành `OT_before_restore_*.json` trước khi ghi.
5. Kiểm tra revision lần nữa; xóa/ghi lại toàn bộ các bảng trong **một transaction**; tăng revision từ dữ liệu hiện tại, thêm audit RESTORE_BACKUP.
6. Nếu bất kỳ bước ghi nào thất bại, rollback cả việc clear và put; giữ nguyên dữ liệu cũ.

Có hỗ trợ chuyển backup kho chính schema 1 sang 2 trước khi kiểm tra và khôi phục. Lịch sử không có từ v1 được ghi rõ là thiếu snapshot. Khôi phục là thay toàn bộ, không gộp hai backup; audit hiện tại nằm trong bản sao trước khôi phục, audit từ bản được chọn được khôi phục cùng dữ liệu và bổ sung sự kiện restore mới.

## Mã nguồn và kiểm thử

- `src/domain/overtime.mjs`: định danh, 6 chỉ tiêu, xung đột ngày, kiểm tra bản ghi.
- `src/db/database.mjs`: schema, index, migration, snapshot và revision.
- `src/db/import-store.mjs`: transaction import/master/mapping/history/audit.
- `src/db/ot-service.mjs`: truy vấn có index và tổng hợp cán bộ.
- `src/db/backup.mjs`: export, kiểm tra, chuyển v1, restore nguyên tử.
- `src/db/data-ui.js`: khôi phục, metric cards và giao diện audit.

`npm test` chạy unit và Chromium bằng dữ liệu giả lập trong browser context tạm. Có kiểm tra tính toán, thay thế/hủy, lưu master, giữ giờ trùng ngày, backup/restore đầy đủ, JSON hỏng/khóa số/liên kết sai, revision cũ, migration database v1, và mô phỏng lỗi quota để chứng minh rollback cả import lẫn restore.
