# Module Import Excel

## Sử dụng

1. Mở **Upload chấm công**, chọn dự án và nhập mới/bổ sung/thay thế toàn bộ kỳ.
2. Chọn file `.xlsx` hoặc `.xls`. File được đọc bằng SheetJS CE 0.20.3 trong Web Worker, không upload lên máy chủ.
3. Chọn sheet, kiểm tra dòng tiêu đề, phạm vi dữ liệu, đơn vị và ánh xạ cột. Có thể đổi mọi cột, sửa/thêm/bỏ cột ngày và phân loại NT/NN/L.
4. Xác nhận tháng và năm. Năm thiếu sẽ để trống; tháng/năm mâu thuẫn giữa các nguồn cũng phải chọn lại. Không mặc định năm hiện tại.
5. Xem trước: giờ tính lại, tổng Excel, chênh lệch, lỗi theo dòng và ngày OT chi tiết. Dòng tổng không được coi là cán bộ.
6. Sửa lỗi trước khi lưu. Cảnh báo không chặn lưu nhưng phải xác nhận đã đọc. Xác nhận kỳ; nếu thay thế phải xác nhận thay toàn bộ kỳ.
7. Lưu thành công sẽ chuyển sang lịch sử trong **Dữ liệu đã nhập**. Dashboard/nhân sự/tra cứu/báo cáo lấy phiên bản đang có hiệu lực. Sau khi tải lại trang, chọn **Dữ liệu đã nhập** ở thanh trên để đọc lại IndexedDB.

## Mẫu BIDC đầu tiên

Đã kiểm thử bằng workbook **giả lập theo mô tả**, chưa có file nhân sự thật:

| Vị trí | Nội dung |
|---|---|
| Sheet1, A1 | Tiêu đề dự án |
| A3 | Tiêu đề chứa tháng 10, có thể thiếu năm |
| Dòng 6 | Tiêu đề cột và ngày 1–31 |
| Dòng 7 | NT/NN/L tương ứng cột ngày |
| A/B/C | Họ tên / Mã cán bộ / Đơn vị |
| D:AH | Ngày 1–31 |
| AI/AJ/AK | Giờ NT / Giờ NN / Tổng giờ để đối chiếu |
| Dòng 8–46 | 39 cán bộ |
| Dòng 47 | Tổng cộng, bỏ qua |

Không dùng tọa độ trên làm luật chung. Bộ nhận diện tìm dòng tiêu đề trong 60 dòng đầu, so khớp nhãn chuẩn hóa tiếng Việt/Anh, phát hiện ngày và phân loại. Dòng/cột có thể được chỉnh thủ công nếu mẫu không nhận diện được. Header và phân loại có ô gộp được tra về ô neo; không tự nhân bản ô gộp vào các dòng nhân sự.

## Tính toán

- Dữ liệu lưu bằng phút nguyên; làm tròn đến phút và cảnh báo khi cần.
- Khi có cột ngày: NT = tổng ngày NT; NN = tổng ngày NN và L; tổng = NT + NN tính từ ngày. L giữ riêng `lMinutes` để đối chiếu.
- Cột NT/NN/tổng của Excel là giá trị đối chiếu, không cộng thêm. Lệch bất kỳ giá trị nào đều hiện cảnh báo và cần xác nhận.
- Có thể chọn rõ nguồn **tổng hợp**. Nếu đủ NT và NN, tổng hiệu lực là NT + NN. Nếu chỉ có tổng, giữ tổng trong `unclassifiedMinutes`, không tự suy đoán NT/NN. Dashboard hiển thị phần chưa phân loại riêng.
- Giờ thập phân hỗ trợ số và chuỗi dấu chấm/phẩy; thời lượng `HH:mm` hỗ trợ trên 24 giờ ở cột tổng. Chọn **Thời lượng Excel** khi ô số là phần của ngày (`0,5 = 12h`), bộ nhận diện có gợi ý theo format ô. Một mapping dùng chung đơn vị ô số; file trộn đơn vị giữa các cột cần chuẩn hóa hoặc tách trước khi nhập.
- SheetJS không tính công thức. Ô công thức có giá trị cache được đọc. Thiếu cache ở ô ngày hoặc nguồn tổng hợp là lỗi; thiếu cache chỉ ở cột đối chiếu là cảnh báo. Không thực thi macro, hyperlink hoặc nội dung HTML từ ô.
- Ngày không tồn tại có giờ khác 0, giờ âm, >24h/ngày, ô lỗi, thiếu mã/tên, trùng mã trong cùng file, cột/ngày trùng hoặc thiếu phân loại ngày có giờ là lỗi cần sửa.
- Mã cán bộ chuẩn hóa NFC, trim, viết hoa. Mã số được cảnh báo nguy cơ mất số 0 đầu; dùng chuỗi/định dạng số có số 0 đầu trong Excel.

## Mapping theo dự án

`mappingProfiles` lưu phiên bản schema, signature header, nhãn cột, đơn vị, nguồn tính, cấu hình dòng và cột ngày, alias loại ngày tùy chỉnh. Không lưu tháng/năm vào mapping.

Có thể bấm **Lưu mẫu mapping** trước khi lưu cán bộ; hoặc lưu kèm transaction import. Khi đọc file sau:

- Cùng signature: áp dụng cột đã chọn, xác định lại giới hạn cuối dữ liệu và đọc phân loại ngày hiện tại; không giữ lịch ngày thường/ngày nghỉ của tháng cũ.
- Đổi vị trí cột: nhận diện lại bằng nhãn tương đương và nhãn đã học từ profile của đúng dự án.
- Nhãn mơ hồ hoặc loại ngày chưa xác định: người dùng ánh xạ tay và xác nhận trước khi lưu.
- Không có dòng phân loại: các phân loại thủ công của tháng trước không tự áp dụng cho tháng mới.

## IndexedDB và chống cộng trùng

Schema hiện tại là **2** với Employees, Projects, OTRecords, Imports, ImportHistory và AuditLogs. Các bảng nội bộ giữ activeIds của kỳ, mapping và revision. Xem [thiết kế cơ sở dữ liệu](indexeddb.md).

Nhập mới vào kỳ đã có dữ liệu cho phép chuyển sang thay thế hoặc hủy. Thay thế archive phiên bản cũ và lưu snapshot trước/sau trong một transaction. Bổ sung chỉ nhận cán bộ chưa có trong các file có hiệu lực của kỳ.

**Quy tắc trùng ngày đã thay đổi:** cùng mã cán bộ, cùng ngày, khác dự án chỉ cảnh báo và yêu cầu xác nhận; không chặn nhập, không tự xóa và không loại giờ khỏi tổng. Vượt 40h/tháng, 200h/năm cũng chỉ cảnh báo. Dữ liệu thiếu ngày được đánh dấu chưa kiểm tra đầy đủ.

## Cách ly demo và an toàn dữ liệu

- Demo gốc vẫn ở bộ nhớ. Không có migration hay cơ chế tự seed demo vào IndexedDB.
- Nút **Thử file BIDC giả lập** chỉ cho xem trước; nút lưu bị vô hiệu hóa cho file tạo sẵn này. Có thể dùng mẫu để thử mapping.
- Test tự tạo workbook giả lập trong bộ nhớ và chạy với browser context tạm, không dùng hồ sơ trình duyệt của người dùng. Không commit Excel nhị phân hoặc dữ liệu nhân sự.
- Thư viện được vendor tại `vendor/sheetjs`; xem README tại đó để biết phiên bản, nguồn phân phối và checksum. Website không gọi CDN khi đọc Excel.
- Nội dung ô được escape trước khi hiển thị, export CSV xử lý tiền tố công thức. Không log nội dung workbook ra console.
- Giới hạn: 10 MB, 30 sheet, 10.000 dòng/sheet, 256 cột, 500.000 ô và timeout đọc 30 giây. Chỉ hỗ trợ XLS kiểu OLE và XLSX; XLS rất cũ/SpreadsheetML cần chuyển sang XLSX. Các giới hạn này giảm rủi ro, không thay thế bảo vệ chuyên biệt với file nén độc hại.
- Dữ liệu chỉ lưu tại trình duyệt/origin hiện tại, không có đồng bộ hay xác thực backend. Dùng HTTPS (GitHub Pages) hoặc localhost để có Web Crypto.
- Sao lưu **Dữ liệu đã nhập** xuất toàn bộ import, kỳ và mapping. Khôi phục JSON toàn bộ đã có tại màn hình Sao lưu dữ liệu; xem tài liệu IndexedDB về kiểm tra và rollback.

## Kiểm tra

`npm test` chạy unit tests và hai nhóm kiểm thử Chromium. Bao phủ BIDC, đổi dòng/cột, mẫu tổng hợp, L, năm thiếu, tháng mâu thuẫn, công thức, ngày sai/năm nhuận, profile thủ công, bổ sung, trùng ngày, ngưỡng, transaction, replacement, XSS và bố cục di động.
