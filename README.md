# OT Management System — quản lý dữ liệu OT lâu dài

Website tiếng Việt bằng HTML, CSS, JavaScript thuần, SheetJS cục bộ và IndexedDB. Quản lý danh mục dự án, nhân sự, dữ liệu tháng/năm và lịch sử phiên bản. Không cần backend, API Key hoặc build; không dùng localStorage làm cơ sở dữ liệu.

## Chạy

```sh
npm start
# Hoặc chỉ cần Python 3:
python3 -m http.server 4173 --bind 0.0.0.0
```

Dùng trình duyệt mở website được phục vụ ở cổng 4173. Không mở bằng `file://`: ứng dụng dùng ES Modules, Worker và Web Crypto (cần HTTPS hoặc localhost).

## Quy trình sử dụng thật

1. Website mặc định mở **Dữ liệu đã nhập**, đọc IndexedDB và giữ nguyên khi tải lại. Kho mới rỗng, không tự seed demo.
2. Tạo dự án với mã, tên, mô tả và trạng thái ở **Dự án** hoặc ngay trong **Upload OT**. Mã/tên trùng bị từ chối. Dự án có lịch sử chỉ đổi sang ngừng hoạt động; vẫn xem được báo cáo cũ.
3. Mỗi upload phải chọn rõ **dự án đang hoạt động + năm + tháng**, sau đó mới chọn Excel. Tháng/năm từ file chỉ là gợi ý, không ghi đè lựa chọn.
4. Với mẫu chấm công hằng tháng, web tự nhận diện mã cán bộ, họ tên, đơn vị, ngày và tổng giờ; bỏ phần ghi chú/chữ ký sau dòng tổng. Kiểm tra các cột đã nhận diện rồi bấm **Kiểm tra & xem trước**. Chỉ mở **Điều chỉnh cột / mẫu Excel khác** khi cần; cấu hình lưu riêng theo dự án.
5. Xem preview, đọc lỗi/cảnh báo và xác nhận kỳ trước khi ghi. Kỳ trùng chỉ cho **thay thế toàn bộ hoặc hủy**, không cộng chồng. Dữ liệu cũ và snapshot trước/sau được giữ.
6. Dashboard lọc năm, một tháng/cả năm và dự án/tất cả dự án. Có 6 chỉ số, biểu đồ tháng/dự án và danh sách cảnh báo.
7. **Báo cáo tháng**: NT, NN, OT từng dự án, tổng toàn dự án, hạn mức còn lại và trạng thái.
8. **Báo cáo năm**: ma trận 12 tháng, tổng từng cán bộ/dự án, biến động OT, hạn mức năm và số lượt vượt 40h của từng tháng. Excel năm có 6 sheet; CSV cũng theo bộ lọc.
9. Tra cứu cán bộ và mở chi tiết để xem dữ liệu nguồn qua nhiều năm, kể cả phiên bản đã thay thế. Tên/đơn vị lúc import không bị sửa ngược khi chỉnh hồ sơ hiện tại.
10. Sao lưu/khôi phục JSON toàn bộ và kiểm tra tính toàn vẹn ở **Sao lưu**. Khôi phục tải bản sao hiện tại trước khi thay toàn bộ kho trong một transaction.

## Quy tắc tính OT

- NT = ngày thường; NN = ngày nghỉ và L. Có dữ liệu ngày thì tính từ ngày, cột tổng Excel chỉ đối chiếu; không cộng NT + NN + tổng lần nữa.
- Mã cán bộ giữ dạng chuỗi, bảo toàn số 0 đầu. Một mã có thể tham gia nhiều dự án. Cùng mã khác tên/cùng tên khác mã được cảnh báo, không tự gộp.
- Tính bằng phút nguyên: 40h/tháng/người và 200h/năm/người. Vượt chỉ cảnh báo, không chặn upload.
- **Lọc một dự án chỉ lọc số giờ hiển thị và nhóm cán bộ; hạn mức vẫn cộng toàn bộ dự án.** Khi xem năm, kiểm tra 40h riêng cho từng tháng. Các năm không cộng vào nhau để so hạn mức năm.
- Trùng ngày giữa dự án chỉ cảnh báo, không xóa hay tự loại khỏi tổng. Dữ liệu tổng hợp không đủ để kiểm tra ngày được ghi rõ.
- Lỗi định dạng, thiếu mã/tên hoặc giờ âm phải sửa trước khi lưu. Giờ hiển thị tối đa 2 số thập phân, số liệu gốc dùng phút nguyên.

## Cấu trúc

```text
index.html
assets/css/style.css, layout.css
assets/js/app.js                 # Khởi động, điều hướng và nghiệp vụ giao diện
assets/js/database.js            # API công khai của IndexedDB
assets/js/excel-importer.js      # API đọc/nhận diện/preview Excel
assets/js/ot-calculator.js       # API tính hạn mức
assets/js/dashboard.js           # Dashboard và báo cáo nhiều năm
src/db/                          # Schema 3, migration, transaction, JSON/audit
src/domain/                      # Tính OT, chuẩn hóa tên, báo cáo chung
src/views/                       # Giao diện dashboard/tháng/năm
src/import/, src/workers/         # Mapping và đọc SheetJS trong Worker
src/reports/                     # Xuất XLSX
src/data.js                      # Bộ sinh demo tạm, không seed vào kho chính
vendor/sheetjs/                  # Thư viện và giấy phép; không gọi CDN lúc sử dụng
tests/                           # Fixture giả lập, unit và Chromium
docs/                            # Thiết kế, kế hoạch và kết quả kiểm thử
.nojekyll, .gitignore
```

Schema 3 gồm **Projects, Employees, Imports, OTRecords, OTDetails, ImportHistory** và AuditLogs, periods, mappingProfiles, Metadata. Nâng cấp từ v1/v2 giữ dữ liệu, không reset. Backup v3 chứa đủ 10 bảng; hỗ trợ nhận backup v1/v2/v3. Xem [thiết kế và các giai đoạn](docs/long-term-plan.md).

## Kiểm thử

```sh
npm ci
npx playwright install chromium # Nếu chưa có /usr/bin/chromium
npm test
```

Node 20+, Python 3, Chromium; có thể đặt `BROWSER_EXECUTABLE`. Các server kiểm thử dùng cổng 4175–4179, 4181, 4184–4186 và tự đóng. Browser context tạm, không dùng dữ liệu trình duyệt người dùng.

- `npm run test:unit`: tính giờ, mapping, hạn mức, bộ lọc toàn dự án và xuất Excel.
- `npm run test:browser`: UI, IndexedDB, JSON, migration v1/v2→v3, rollback và đường dẫn con GitHub Pages.
- `npm run test:comprehensive`: 36 file / 3 dự án / 10 cán bộ / 12 tháng; oracle độc lập, 720 chỉ tiêu. [Kết quả](docs/qa-results.md).
- `npm run test:long-term`: 72 file / 24 tháng năm 2025–2026, 336 dòng tháng và 788 ngày; master, xác nhận kỳ, ma trận năm, hạn mức khi lọc, snapshot, inactive, lịch sử cán bộ và restore. [Kết quả](docs/qa-long-term.md).

## GitHub Pages

1. Push/merge mã vào `main` của `longbq283/OT-Management-System`.
2. **Settings → Pages → Build and deployment → Deploy from a branch**.
3. Chọn **main**, **/ (root)** → **Save**.
4. Chờ GitHub hoàn thành Pages và mở địa chỉ được Settings cung cấp.

Giữ cả `assets/`, `src/`, `vendor/`; không chọn riêng `assets`. Đường dẫn tương đối, hash routing, Worker và `.nojekyll` hỗ trợ `/OT-Management-System/`. Việc bật/phát hành Pages là cấu hình riêng, chưa tự thực hiện.

## Dữ liệu và vận hành

- Không có Excel/dữ liệu nhân sự thật trong repository. Fixture và demo đều được tạo từ tên/mã giả lập. Demo chỉ ở bộ nhớ; upload trong chế độ demo không ghi kho thật.
- File được đọc tại trình duyệt, không gửi lên máy chủ/GitHub. Không analytics hoặc font bên ngoài. Nguồn SheetJS/checksum: [vendor README](vendor/sheetjs/README.md).
- `.gitignore` chặn Excel, CSV, backup, `.env`, `local-data/` và output kiểm thử. Kiểm tra nội dung trước khi commit.
- Dữ liệu thuộc trình duyệt và origin. Đổi máy/origin hoặc xóa dữ liệu duyệt web có thể mất dữ liệu; sao lưu JSON định kỳ. Chưa có đồng bộ, tài khoản hoặc phân quyền backend.
- Backup tối đa 20 MB và 100.000 dòng/bảng; checksum phát hiện file hỏng, không xác thực người tạo. Nhật ký cục bộ không phải audit server chống sửa đổi.
- Mẫu chấm công do người dùng cung cấp đã được kiểm tra cục bộ bằng Worker ở bước xem trước; không lưu nhân sự vào kho chính và không đưa file vào Git. Bộ kiểm thử trong repository chỉ dùng dữ liệu giả lập. Chưa kiểm tra giao diện Microsoft Excel desktop; XLSX xuất ra được đọc lại bằng SheetJS.

## Khi không thấy dữ liệu vừa nhập

Chọn file chỉ đọc và xem trước; cần xác nhận lưu ở bước 3. Sau khi lưu, ứng dụng xóa bộ lọc cũ và mở đúng kỳ vừa nhập. Khi tải lại trang, tự chọn kỳ của lần import có hiệu lực gần nhất. Màn hình Tra cứu/Lịch sử cho biết số file/bản ghi thực có trong IndexedDB, có nút **Xem dữ liệu mới nhất** và chọn lại kỳ đã lưu. Bộ lọc vẫn có thể cho kết quả rỗng khi chọn kỳ/dự án không có dữ liệu; không cần xóa dữ liệu trình duyệt.

## Mẫu chấm công hằng tháng

- Hỗ trợ nhãn **Đơn vị (Ban/TT)** và **Tổng số giờ Tháng N**, cả khi đổi tháng. Tự tìm tiêu đề, cột ngày và dòng tổng, không cố định số dòng cán bộ cho mọi file.
- Phần chữ ký sau dòng tổng không phải cán bộ. Nếu có cán bộ tiếp sau dòng tổng bộ phận, vẫn đọc và kiểm tra; thiếu mã/tên không bị bỏ qua âm thầm. Có thể chỉnh phạm vi đọc trong phần tùy chọn.
- Mã cán bộ là khóa khớp qua các tháng; mã có số 0 đầu giữ theo định dạng hiển thị Excel. Mã số không có định dạng số 0 đầu sẽ có cảnh báo để kiểm tra nguồn. Cùng mã khác tên hoặc cùng tên khác mã đều cảnh báo, không tự gộp.
- Hằng tháng chỉ cần chọn dự án, năm, tháng, file → kiểm tra nhận diện → xem trước → xác nhận lưu. Luôn giữ bước xác nhận kỳ và cảnh báo. Tra cứu tự chuyển đúng kỳ vừa lưu.
- Kiểm thử riêng: `node tests/browser/monthly-template.cjs` (fixture giả lập, 2 tháng, 39 mã, có công thức đã tính và chữ ký).
