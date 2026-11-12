# Các vấn đề phát hiện và sửa khi kiểm thử toàn diện

Toàn bộ dữ liệu dưới đây là giả lập. Bảng kết quả cuối được sinh tự động ở [qa-results.md](qa-results.md) từ lượt chạy mới nhất.

| ID | Phát hiện trước khi sửa | Bằng chứng | Sửa và kiểm tra lại |
|---|---|---|---|
| QA-01 | Báo cáo chỉ có CSV, chưa có xuất `.xlsx` theo yêu cầu. | Không có action/module xuất Excel; màn hình chỉ có “Xuất báo cáo CSV”. | Thêm xuất XLSX với 3 sheet, mã kiểu text, giờ kiểu number, NT/NN/tổng và 6 chỉ tiêu. TC13–15/22 ghi file thực rồi đọc lại đối chiếu oracle. |
| QA-02 | Xuất Excel có thể dùng kỳ khác kỳ đã chọn khi bấm nếu người dùng đổi bộ lọc trong lúc tải thư viện. | TC27 tái hiện: bấm tháng 10, đổi tháng 9 khi tải chậm 200ms; thực tế tải `OT_monthly_9_2026.xlsx`, test FAIL. | Chụp snapshot dữ liệu, chế độ, tháng, năm, loại báo cáo trước mọi await; TC27 yêu cầu đúng tháng 10 và tổng 133,25h sau thay thế. |
| QA-03 | Bộ xuất mới chưa kiểm tra kỳ không hợp lệ nếu danh sách cán bộ rỗng. | Unit test với `employees=[]`, `month=13` ghi nhận thiếu exception, test FAIL. | Kiểm tra năm 2000–2100, tháng 1–12 trước khi duyệt nhân sự; unit test bao phủ cả tháng 13 và năm NaN. |

## Nội dung đã xác minh

- Oracle được dựng từ đặc tả dữ liệu đầu vào, không gọi hàm nghiệp vụ của hệ thống để tính kết quả mong đợi.
- 36 workbook thực sự được đọc bằng SheetJS trong Worker; 3 file đầu đi qua giao diện import, các file sau đi qua cùng reader/recognizer/preview/transaction API để kiểm tra logic ở quy mô đủ năm.
- 168 dòng nhân sự-dự án và 720 giá trị của 6 chỉ tiêu được đối chiếu trực tiếp với oracle, trước và sau thay thế/khôi phục.
- Excel được ghi thành `.xlsx`, bắt download từ nút trên giao diện, đọc lại binary và kiểm tra kiểu ô, số liệu, dữ liệu chi tiết/ngày. Không dùng file CSV đổi đuôi.
- Đã kiểm tra mã có số 0 đầu, NN gồm L, đúng ngưỡng 40/200h, một phút OT, dữ liệu tổng hợp, lỗi đầu vào, trùng ngày giữ nguyên, xung đột ghi đồng thời, version archived, checksum JSON và rollback khi mô phỏng quota.
- Demo không được đưa vào kho chính. Browser contexts kiểm thử là tạm, không dùng dữ liệu người dùng.

Không có phát hành GitHub Pages trong lượt kiểm thử này. Các giới hạn Office desktop, dữ liệu thật và mô phỏng quota được ghi trong bảng kết quả.
