# OT Management System — quản lý dữ liệu OT lâu dài

Website tiếng Việt bằng HTML, CSS, JavaScript thuần, SheetJS cục bộ. Từ **v0.7.0**, bản GitHub Pages đọc dữ liệu JSON công khai dùng chung trên GitHub; IndexedDB giữ cache từng thiết bị. Quản lý dự án, nhân sự, tháng/năm và lịch sử phiên bản. Không cần máy chủ riêng hoặc build; người xem không cần tài khoản/token. Quản trị viên dùng token GitHub trong bộ nhớ tab để ghi dữ liệu; không dùng localStorage.

## Chạy

```sh
npm start
# Hoặc chỉ cần Python 3:
python3 -m http.server 4173 --bind 0.0.0.0
```

Dùng trình duyệt mở website được phục vụ ở cổng 4173. Không mở bằng `file://`: ứng dụng dùng ES Modules, Worker và Web Crypto (cần HTTPS hoặc localhost).

## Dùng cùng dữ liệu trên nhiều thiết bị

Nguồn dùng chung: [`data/shared-ot.json`](data/shared-ot.json), branch `main` của `longbq283/OT-Management-System`. File khởi đầu chỉ là thông báo chưa khởi tạo, không có nhân sự/demo. Bản triển khai HTTPS tự bật dữ liệu chung. Localhost giữ chế độ cục bộ để phát triển; thêm `?shared=1#/dashboard` khi muốn kiểm tra tích hợp.

**Lần đầu, thực hiện tại máy đang có dữ liệu OT:**

1. Mở website sau khi GitHub Pages cập nhật bản v0.7.1 trở lên. Dữ liệu IndexedDB cũ được giữ, có thông báo chưa đưa lên GitHub.
2. Tạo [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new): chọn đúng chủ sở hữu `longbq283`, chọn riêng repository `OT-Management-System`, quyền **Repository permissions → Contents: Read and write**. Chọn thời hạn phù hợp; nếu tài khoản/tổ chức yêu cầu phê duyệt thì hoàn thành trên GitHub.
3. Mở **Dữ liệu GitHub → Quản trị**, nhập token ngay trong website và bấm **Kết nối quyền ghi**. Không gửi token vào chat, file cấu hình hay commit.
4. Kiểm tra số cán bộ/import, đánh dấu xác nhận dùng dữ liệu thiết bị làm bản chung, bấm **Sao lưu & gửi dữ liệu máy này lên GitHub**. Website tải bản sao JSON của dữ liệu hiện tại trước khi gửi. Đợi thông báo GitHub đã nhận.
5. Máy tính/điện thoại khác mở cùng link sẽ tải dữ liệu chung; không cần nhập token để xem. Nút **Tải dữ liệu chung** lấy bản mới khi trang đã mở sẵn.

Sau khi khởi tạo, upload, thay thế, xóa, sửa dự án/nhân sự, lưu mapping và restore từ tab quản trị đều ghi bản JSON mới vào GitHub. Token chỉ ở bộ nhớ tab, mất khi tải lại/đóng tab hoặc bấm ngắt kết nối. Mỗi phiên quản trị cần kết nối lại token; người xem chỉ đọc, xuất báo cáo và sao lưu.

Nếu thiết bị đã có một kho cục bộ khác với bản chung, ứng dụng giữ kho đó và yêu cầu chọn gửi dữ liệu thiết bị hoặc sao lưu rồi dùng bản chung; không tự gộp hay tự xóa. Dữ liệu chờ xác nhận sau lỗi mạng cũng được giữ qua reload. Khi hai thiết bị cùng sửa, revision/SHA ngăn ghi đè; tải bản mới trước khi thực hiện lại.

## Quy trình sử dụng thật

1. Website triển khai mặc định đọc **Dữ liệu GitHub**, kiểm tra toàn vẹn rồi cập nhật cache IndexedDB. Không tự seed demo; localhost vẫn dùng kho cục bộ.
2. Tạo dự án với mã, tên, mô tả và trạng thái ở **Dự án** hoặc ngay trong **Upload OT**. Mã/tên trùng bị từ chối. Dự án có lịch sử chỉ đổi sang ngừng hoạt động; vẫn xem được báo cáo cũ.
3. Mỗi upload phải chọn rõ **dự án đang hoạt động + năm từ 2026 + tháng**, sau đó mới chọn Excel. Tháng/năm từ file chỉ là gợi ý, không ghi đè lựa chọn.
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
src/sync/                        # GitHub API, version/SHA, quản trị và cache
data/shared-ot.json              # Nguồn dữ liệu công khai dùng chung
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

Node 20+, Python 3, Chromium; có thể đặt `BROWSER_EXECUTABLE`. Các server kiểm thử dùng cổng 4175–4179, 4181, 4184–4187, 4189–4190 và tự đóng. Browser context tạm, không dùng dữ liệu trình duyệt người dùng.

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

- File dữ liệu chung JSON **công khai theo lựa chọn của chủ hệ thống**, không mã hóa. Tất cả dữ liệu đã gửi lên GitHub và các phiên bản Git đều có thể đọc được. File khởi tạo/fixture/demo trong mã chỉ dùng dữ liệu trống hoặc giả lập. Demo không ghi vào kho chung.
- Excel gốc chỉ đọc trong trình duyệt, không gửi file nhị phân lên GitHub. Sau xác nhận, dữ liệu đã phân tích được ghi vào JSON chung. Không analytics hoặc font bên ngoài. Nguồn SheetJS/checksum: [vendor README](vendor/sheetjs/README.md).
- `.gitignore` chặn Excel, CSV, backup, `.env`, `local-data/` và output kiểm thử. Kiểm tra nội dung trước khi commit.
- Dữ liệu đã được GitHub xác nhận nằm ở repository, dùng được từ nhiều thiết bị. Cache, dữ liệu cũ chưa chia sẻ hoặc bản chờ xác nhận vẫn thuộc trình duyệt/origin; xuất sao lưu trước khi xóa dữ liệu trình duyệt. Xem trạng thái ở đầu trang để biết nguồn dữ liệu.
- Backup tối đa 20 MB và 100.000 dòng/bảng; checksum phát hiện file hỏng, không xác thực người tạo. Nhật ký cục bộ không phải audit server chống sửa đổi.
- Mẫu chấm công do người dùng cung cấp đã được kiểm tra cục bộ bằng Worker ở bước xem trước; không lưu nhân sự vào kho chính và không đưa file vào Git. Bộ kiểm thử trong repository chỉ dùng dữ liệu giả lập. Chưa kiểm tra giao diện Microsoft Excel desktop; XLSX xuất ra được đọc lại bằng SheetJS.

## Khi không thấy dữ liệu vừa nhập

Chọn file chỉ đọc và xem trước; cần xác nhận lưu ở bước 3. Trên bản GitHub Pages, cần kết nối token ghi; lưu chỉ báo thành công khi GitHub xác nhận. Sau khi lưu, ứng dụng xóa bộ lọc cũ và mở đúng kỳ vừa nhập. Khi tải lại trang, tự chọn kỳ của lần import có hiệu lực gần nhất. Màn hình Tra cứu/Lịch sử cho biết số file/bản ghi thực có trong IndexedDB, có nút **Xem dữ liệu mới nhất** và chọn lại kỳ đã lưu. Bộ lọc vẫn có thể cho kết quả rỗng khi chọn kỳ/dự án không có dữ liệu; không cần xóa dữ liệu trình duyệt.

## Mẫu chấm công hằng tháng

- Hỗ trợ nhãn **Đơn vị (Ban/TT)** và **Tổng số giờ Tháng N**, cả khi đổi tháng. Tự tìm tiêu đề, cột ngày và dòng tổng, không cố định số dòng cán bộ cho mọi file.
- Phần chữ ký sau dòng tổng không phải cán bộ. Nếu có cán bộ tiếp sau dòng tổng bộ phận, vẫn đọc và kiểm tra; thiếu mã/tên không bị bỏ qua âm thầm. Có thể chỉnh phạm vi đọc trong phần tùy chọn.
- Mã cán bộ là khóa khớp qua các tháng; mã có số 0 đầu giữ theo định dạng hiển thị Excel. Mã số không có định dạng số 0 đầu sẽ có cảnh báo để kiểm tra nguồn. Cùng mã khác tên hoặc cùng tên khác mã đều cảnh báo, không tự gộp.
- Hằng tháng chỉ cần chọn dự án, năm, tháng, file → kiểm tra nhận diện → xem trước → xác nhận lưu. Luôn giữ bước xác nhận kỳ và cảnh báo. Tra cứu tự chuyển đúng kỳ vừa lưu.
- Kiểm thử riêng: `node tests/browser/monthly-template.cjs` (fixture giả lập, 2 tháng, 39 mã, có công thức đã tính và chữ ký).

## Sửa file sai, xóa dữ liệu import và tìm kiếm báo cáo

- Mở **Lịch sử import → Xóa file** tại file đang có hiệu lực. Hộp thoại nêu rõ file, dự án, kỳ, số cán bộ và giờ bị loại; phải đánh dấu xác nhận mới xóa. Hủy không thay đổi dữ liệu.
- Xóa loại OT của đúng file khỏi dashboard, tra cứu, cảnh báo và báo cáo. Bản ghi chuyển sang lưu lịch sử; giữ snapshot trước/sau, ngày OT, nhật ký xóa và hồ sơ cán bộ/dự án. Các kỳ/dự án khác không bị xóa, phiên bản cũ không tự được kích hoạt lại. Có thể upload lại kỳ đã xóa ở chế độ nhập mới, hoặc dùng chức năng thay thế kỳ khi file vẫn đang có hiệu lực.
- Thao tác ghi trong một transaction, kiểm tra phiên bản dữ liệu giữa các tab; lỗi ghi sẽ hoàn tác. Backup/restore v3 giữ được trạng thái xóa và lịch sử, không cần xóa/nâng lại kho IndexedDB.
- Năm upload chọn trong danh sách **2026–2100** ở cả bước chọn file và kiểm tra nhận diện. Dữ liệu cũ trước 2026 vẫn được giữ, xem báo cáo và khôi phục từ backup.
- **Tổng quan, Báo cáo tháng, Báo cáo năm, Vượt giờ tháng và Cảnh báo** có ô tìm mã, tên hoặc đơn vị, hỗ trợ gõ tiếng Việt không dấu. Tìm kiếm cập nhật bảng, biểu đồ, số liệu tổng hợp và cảnh báo; hạn mức của cán bộ khớp vẫn tính trên toàn bộ dự án.
- CSV và mọi sheet Excel xuất từ Báo cáo giữ đúng bộ lọc và tìm kiếm tại lúc bấm xuất. Nút **Xóa tìm kiếm** trả về toàn bộ cán bộ của kỳ/dự án đang chọn.

Kiểm thử mới: `node tests/browser/delete-search.cjs`; chỉ sử dụng dữ liệu giả lập. Xem [bảng kết quả](docs/qa-delete-search.md).

## Vận hành dữ liệu GitHub

- Lưu JSON qua GitHub Contents API với SHA hiện tại, không đặt token trong website. API GitHub kiểm tra quyền ghi; giấu nút trên giao diện chỉ hỗ trợ trải nghiệm, không thay thế quyền GitHub.
- Đọc công khai không token có hạn mức GitHub API; nếu API bị lỗi/hết hạn mức, website thử JSON do GitHub Pages phục vụ. Bản dự phòng có thể chậm theo lần deploy; có cache sạch thì không tự thay bằng bản dự phòng khác revision. Lỗi đọc không làm mất cache.
- GitHub là kho file có phiên bản, không phải cơ sở dữ liệu giao dịch cho nhiều người ghi liên tục. Mỗi thay đổi xuất toàn bộ snapshot; giới hạn ứng dụng 20 MB/file, 100.000 dòng/bảng. Nội dung trên 1 MB đọc bằng endpoint blob bất biến theo SHA.
- Xóa import loại khỏi giờ OT, vẫn giữ lịch sử nghiệp vụ/Git theo thiết kế. Khôi phục backup cũng phải được GitHub xác nhận mới thành bản dùng chung.
- Khi PUT mất phản hồi, ứng dụng đọc lại revision/checksum để nhận diện commit đã thành công. Nếu không thể xác nhận, giữ bản chờ trên thiết bị, chặn sửa tiếp và cho sao lưu/gửi lại hoặc tải bản chung; không tự ghi đè hoặc báo thành công.
- Cache dùng khóa Metadata `device:shared` (không có token). Trạng thái thiết bị không xuất vào JSON chia sẻ; restore giữ phần này riêng. Không đổi schema IndexedDB hoặc xóa dữ liệu cũ để nâng cấp.
- Kiểm thử `tests/browser/shared-github.cjs` dùng GitHub API mô phỏng với nhiều browser context độc lập; không tạo commit thật trong test. Kết quả: [qa-shared-github.md](docs/qa-shared-github.md).

## Thêm dự án và khôi phục kết nối (v0.7.1)

- Bấm **Thêm dự án**. Nếu chưa có token, ứng dụng mở bước kết nối, sau đó tự quay lại biểu mẫu thêm dự án; kho chung trống không cần gửi một bản JSON rỗng trước. Nếu máy có dữ liệu chưa chia sẻ/xung đột, vẫn phải sao lưu và chọn nguồn dữ liệu, sau đó biểu mẫu được mở lại.
- Mã dự án tối đa 32 ký tự, dùng chữ không dấu/số/gạch ngang/gạch dưới, tự viết hoa khi lưu. Tên, mã thiếu hoặc trùng được báo ngay trong biểu mẫu. Tên trùng kiểm tra theo chữ hoa/thường và khoảng trắng.
- Lỗi lưu hiển thị **bên trong hộp thoại**; thông tin đã nhập không bị mất. Với lỗi token hoặc xung đột, nút **Kết nối / kiểm tra GitHub và tiếp tục** giữ lại cả mã, tên, người phụ trách, mô tả khi quay lại.
- Lỗi 401 và 403 thiếu quyền yêu cầu kết nối lại token đúng repository, Contents: Read and write. Giới hạn API 403/429 giữ token hợp lệ; chờ theo thông báo rồi thử lại. 422 định dạng không bị báo nhầm là xung đột SHA; nhánh bảo vệ ghi trực tiếp cũng có thông báo riêng.
- Trong lúc lưu, nút lưu/hủy tạm khóa để tránh gửi lặp. Tạo dự án từ màn hình upload vẫn chọn dự án vừa tạo, giữ tháng/năm đã chọn.
- Kiểm thử mới: `node tests/browser/project-recovery.cjs`; fixture kho trống và API GitHub mô phỏng, không thay đổi file dữ liệu chung thật. Xem [qa-project-recovery.md](docs/qa-project-recovery.md).
