# OT Workspace — OT Management System

Ứng dụng web tiếng Việt quản lý OT cá nhân bằng HTML, CSS và JavaScript thuần. Import Excel bằng SheetJS, lưu cục bộ trong IndexedDB; triển khai được trên GitHub Pages mà không cần build, backend hoặc API Key.

## Cấu trúc MVP

```text
index.html                      # Trang tĩnh, điểm vào GitHub Pages
assets/
  css/style.css                 # Màu sắc, component, bảng và biểu đồ
  css/layout.css                # Sidebar, bố cục và responsive
  js/app.js                     # Khởi động, điều hướng và các màn hình
  js/database.js                # API công khai cho IndexedDB, CRUD, backup/restore
  js/excel-importer.js           # API công khai đọc Excel, mapping và preview
  js/ot-calculator.js            # API công khai tính OT, hạn mức và trùng ngày
  js/dashboard.js               # Render chỉ số, biểu đồ và bảng trạng thái cán bộ
src/
  db/                           # Schema, migration, transaction, audit và JSON
  domain/                       # Logic tính OT dùng chung
  import/                       # Nhận diện, chuẩn hóa, mapping, dữ liệu giả lập
  workers/                      # Bộ đọc SheetJS ngoài luồng giao diện
  reports/                      # Xuất Excel .xlsx
  data.js                       # Sinh demo trong bộ nhớ; không chứa dữ liệu thật
vendor/sheetjs/                  # Thư viện đóng gói cục bộ và giấy phép
tests/                         # Unit/Chromium, fixture chỉ có dữ liệu giả lập
docs/                          # Quy tắc, thiết kế và kết quả kiểm thử
.nojekyll
.gitignore
README.md
```

Các file `database.js`, `excel-importer.js`, `ot-calculator.js` là đầu mối API ổn định, sử dụng các module chuyên trách trong `src/`. Không nhân bản phép tính hay thay IndexedDB bằng localStorage. Cần giữ cả `assets/`, `src/` và `vendor/` khi triển khai.

## Chạy

```sh
npm start
# Hoặc không cần Node/npm để chạy website:
python3 -m http.server 4173 --bind 0.0.0.0
```

Dùng trình duyệt mở website được phục vụ tại cổng 4173. Không mở trực tiếp `index.html` qua `file://` vì ứng dụng dùng ES Modules và Worker. Web Crypto cần HTTPS hoặc localhost.

## Tính năng

9 màn hình: tổng quan, upload chấm công, quản lý dự án, nhân sự, tra cứu OT, cảnh báo, lịch sử import, báo cáo và sao lưu. Báo cáo xuất Excel `.xlsx` gồm 3 sheet: tổng hợp OT, chi tiết dự án và ngày OT; vẫn giữ tùy chọn CSV.

**Import Excel thật** hỗ trợ `.xlsx/.xls`, nhận diện header/cột ngày/tên cột tương đương, ánh xạ thủ công, xác nhận kỳ, NT/NN/L, đối chiếu tổng và lưu mapping theo dự án. Có xem trước, kiểm tra bổ sung trùng cán bộ; trùng ngày liên dự án chỉ cảnh báo, không tự xóa; vượt 40h/tháng hoặc 200h/năm chỉ cảnh báo. Phiên bản thay thế không bị cộng trùng.

Xem [hướng dẫn và thiết kế module Excel](docs/excel-import.md), [quy tắc nghiệp vụ](docs/business-rules.md) và [schema IndexedDB / 6 chỉ tiêu OT](docs/indexeddb.md).

## Dữ liệu demo và dữ liệu đã nhập

- Mặc định mở **Dữ liệu demo**. Nhân sự mẫu có mã `DEMOxxx`, chỉ nằm trong bộ nhớ và đặt lại khi tải trang.
- Menu **Upload chấm công** mở bộ import thật. Chỉ sau khi kiểm tra và xác nhận mới ghi dữ liệu cán bộ vào IndexedDB.
- Nút **Thử file BIDC giả lập** tạo file trong bộ nhớ, chỉ cho xem trước; không được ghi mẫu này vào kho chính.
- Lưu import xong sẽ mở **Dữ liệu đã nhập**. Có thể chuyển giữa hai không gian bằng bộ chọn ở thanh trên. Sau khi tải lại trang, chọn **Dữ liệu đã nhập** để đọc dữ liệu đã lưu.
- Dữ liệu đã nhập được dùng cho dashboard, nhân sự, tra cứu, cảnh báo, lịch sử và xuất CSV. Lịch sử giữ các phiên bản cũ nhưng tổng chỉ tính phiên bản có hiệu lực.
- Mapping lưu riêng theo dự án; có thể lưu mẫu trước khi lưu cán bộ.
- Sao lưu JSON kho chính gồm toàn bộ 6 bảng nghiệp vụ, kỳ, mapping và metadata. Có kiểm tra/xem trước và khôi phục nguyên tử; tải bản sao hiện tại trước khi khôi phục. Hỗ trợ backup v1/v2. Tạo/sửa dự án và sửa hồ sơ cán bộ trong chế độ dữ liệu đã nhập được lưu bền và ghi audit; demo vẫn chỉ ở bộ nhớ.
- Không có dữ liệu nhân sự thật trong repository. Không tự seed bất kỳ dữ liệu demo nào vào IndexedDB.

File nhân sự được xử lý tại trình duyệt, không gửi lên máy chủ. Không analytics hoặc font/CDN bên ngoài. SheetJS được lưu tại `vendor/sheetjs`; nguồn phân phối và checksum có trong [README thư viện](vendor/sheetjs/README.md).

## Kiểm thử

Cần Node.js 20+, Python 3 và Chromium:

```sh
npm ci
npx playwright install chromium # Nếu máy chưa có /usr/bin/chromium
npm test
```

Có thể đặt `BROWSER_EXECUTABLE` tới Chrome/Chromium có sẵn. HTTP server kiểm thử dùng cổng 4175/4176/4177/4178/4179 và tự đóng. Dữ liệu Excel được tạo từ fixture JavaScript giả lập trong bộ nhớ; ảnh kiểm tra nằm trong thư mục tạm.

- `npm run test:comprehensive`: 3 dự án × 10 cán bộ × 12 tháng; đọc 36 workbook trong Worker, đối chiếu 720 chỉ tiêu với oracle độc lập, thay thế, restore JSON và ghi/đọc lại Excel. Sinh [bảng kết quả thực tế](docs/qa-results.md).
- `npm run test:unit`: nhận diện mẫu, thời gian, mapping, OT và quy tắc import.
- `npm run test:browser`: 9 màn hình tại 1440/768/390/360px, giao diện demo, luồng Excel/IndexedDB thật, migration v1→v2, 6 chỉ tiêu, history/audit, backup/restore, rollback khi lỗi ghi và chạy tại đường dẫn con như GitHub Pages trong browser context tạm.

## Triển khai GitHub Pages

1. Push/merge mã nguồn vào nhánh `main` của `longbq283/OT-Management-System`.
2. Mở repository → **Settings → Pages**.
3. Tại **Build and deployment**, chọn **Deploy from a branch**.
4. Chọn nhánh **main**, thư mục **/ (root)**, rồi **Save**.
5. Chờ GitHub hoàn tất tác vụ Pages và mở địa chỉ website mà trang Settings hiển thị.

Không cần build, backend, API Key hoặc cấu hình biến bí mật. Không chọn riêng thư mục `assets`: website cần toàn bộ cấu trúc trên. Đường dẫn tương đối, hash routing, Worker và thư viện vendor hỗ trợ đường dẫn `/OT-Management-System/`; `.nojekyll` đã có sẵn. Khi triển khai phiên bản mới, tải lại trang để nạp JavaScript mới. Chưa tự động bật hoặc phát hành GitHub Pages trong thay đổi này.

## Phạm vi MVP và phần chưa có

- Dashboard: số cán bộ/dự án, tổng OT tháng, cảnh báo tháng/năm, biểu đồ và bảng trạng thái cán bộ; 8 menu chính và lịch sử import.
- Nhập Excel, quản lý dữ liệu IndexedDB, tính 6 chỉ tiêu, lịch sử thay thế, cảnh báo, báo cáo Excel/CSV và sao lưu/khôi phục JSON đã có.
- Không có tài khoản, phân quyền, backend hoặc đồng bộ nhiều thiết bị; dữ liệu thuộc origin và trình duyệt hiện tại.
- Mẫu BIDC và các mẫu khác được kiểm thử bằng workbook giả lập; chưa đối chiếu file nhân sự thực tế hay Microsoft Excel desktop.

Không commit file chấm công, CSV hoặc backup nhân sự. `.gitignore` loại các file này cùng `local-data/`; vẫn cần kiểm tra nội dung trước khi commit. Mã nguồn chỉ có bộ sinh dữ liệu giả lập cho demo/kiểm thử, không chứa danh sách cán bộ thật hoặc file Excel. IndexedDB không thay thế backup: xóa dữ liệu duyệt web, đổi máy hoặc đổi origin có thể làm mất quyền truy cập dữ liệu cục bộ.
