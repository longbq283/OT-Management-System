# Kiểm thử mẫu chấm công hằng tháng — v0.5.2

Ngày kiểm tra: 12/11/2026. Các fixture trong repository chỉ chứa tên, mã và giờ giả lập. File người dùng cung cấp được kiểm tra riêng tại bước xem trước, không ghi dữ liệu nhân sự vào kho chính hoặc Git.

Nguyên nhân lỗi: nhãn `Đơn vị (Ban/TT)` và `Tổng số giờ Tháng N` chưa có trong nhận diện; vùng đọc kéo dài qua dòng tổng sang phần ghi chú/chữ ký. Bản sửa nhận diện các nhãn này và tự kết thúc vùng cán bộ tại dòng tổng cuối cùng. Dòng tổng bộ phận không làm mất cán bộ tiếp phía sau; dòng thiếu định danh vẫn báo lỗi.

| Test case | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Trạng thái |
|---|---|---|---|---|
| Nhận diện mẫu tháng | Fixture 39 cán bộ, nhãn có tháng, header dòng 6, loại ngày dòng 7 | Mã B, tên A, đơn vị C, NT AI, NN AJ, tổng AK | Đủ 6 trường, 31 cột ngày | PASS |
| Đổi tháng | Cùng mẫu, tháng 1/10/11/12 | Không cần chọn lại cột | Mỗi tháng nhận diện đủ trường | PASS |
| Bỏ chữ ký | Vùng Excel tới dòng 68; tổng dòng 47; chữ ký dòng 51/58/62 | Chỉ đọc cán bộ và bỏ tổng | 39 cán bộ, 0 dòng lỗi; kết thúc vùng đọc tại 47 | PASS |
| Tổng bộ phận | Cán bộ sau dòng tổng, có dòng thiếu mã | Không bỏ mất người hoặc che lỗi | Đọc đủ 3 dòng cán bộ, chặn dòng thiếu mã | PASS |
| Công thức và tổng | 1h NT, 1h NN, 2h L; công thức tổng có cache | NN gồm L; không cộng thêm cột tổng | NT 1h, NN 3h, tổng 4h/cán bộ | PASS |
| Mã có số 0 đầu | Ô mã dạng số, định dạng Excel `000000` | Lưu/tra cứu theo chuỗi hiển thị | Giữ `000001` và toàn bộ mã giả lập | PASS |
| Mapping đã lưu từ bản cũ | Profile thiếu đơn vị/tổng, dòng kết thúc cũ | Bổ sung trường nhận diện được, xác định lại cuối bảng | Đủ đơn vị/tổng, kết thúc tại 47 | PASS |
| Nhập 2 tháng | 39 mã lặp lại, tháng 10 và 11, một mã đổi tên | Khớp theo mã; cảnh báo tên khác; giữ tên nguồn mỗi kỳ | 39 Employees, 78 OTRecords, 312h; tên nguồn giữ riêng | PASS |
| Nhập trùng kỳ | Upload lại tháng 11 | Không cộng chồng, cho thay thế/hủy | Nút lưu bị khóa; hủy giữ nguyên 78 bản ghi | PASS |
| Tra cứu sau reload | Dữ liệu giả lập đã lưu hai tháng | Hiện kỳ mới nhất và tìm được mã | Mặc định tháng 11; tìm `000001` được một cán bộ | PASS |
| Giao diện nhận diện | Desktop 1440px, điện thoại 390px | Hiển thị cột chính; phần nâng cao thu gọn | Không phải chọn 31 cột ngày, không tràn ngang | PASS |
| Kiểm tra riêng file được cung cấp | Worker đọc trong context trình duyệt tạm; chỉ xem trước | Định danh khớp ô nguồn, không lưu nhân sự | 39 dòng mã/tên/đơn vị khớp nguồn; không có dòng lỗi; 0 OTRecords được lưu | PASS |

Tái lập bằng `npm test`; trường hợp mẫu tháng nằm trong `tests/unit/import.test.mjs` và `tests/browser/monthly-template.cjs`. Script kiểm tra file riêng không được đưa vào repository. Bộ hồi quy gồm 35 unit test, 7 script giao diện/IndexedDB, 27 trường hợp toàn diện và 14 trường hợp quản lý nhiều năm. Kết quả các bộ nhiều tháng/năm: [qa-results.md](qa-results.md), [qa-long-term.md](qa-long-term.md).
