# Quy tắc OT

- NT: OT ngày thường. NN: OT ngày nghỉ, bao gồm loại L trong mẫu hiện tại. L được giữ riêng để truy vết; không áp dụng hệ số lương.
- Một cán bộ có một mã duy nhất trên mọi dự án. Không gộp bằng họ tên.
- Một cán bộ có thể OT nhiều dự án trong một tháng; tổng tháng/năm cộng mọi dự án có phiên bản đang hiệu lực.
- Hạn mức 40 giờ/tháng, 200 giờ/năm. Chỉ cảnh báo khi lớn hơn ngưỡng. Theo yêu cầu, vượt giờ không chặn upload.
- Không được khai OT ở hai dự án cùng một ngày. Nếu phát hiện thì chỉ cảnh báo theo quy tắc mới, cho phép nhập và không tự xóa; dữ liệu chỉ có tổng tháng không đủ căn cứ xác minh.
- Một file có thể đại diện toàn bộ dự án/kỳ. File bổ sung cùng dự án/tháng/năm chỉ được chứa cán bộ chưa có trong tất cả file đang hiệu lực của kỳ.
- Kỳ đã có dữ liệu không được nhập mới lần nữa; phải bổ sung hoặc thay thế.
- Thay thế toàn bộ kỳ vô hiệu hóa file gốc và các file bổ sung; giữ phiên bản cũ trong lịch sử.
- Có dữ liệu ngày thì ưu tiên tính từ ngày. Cột tổng Excel chỉ để đối chiếu, không được cộng cùng NT + NN lần nữa.
- Chỉ có NT/NN/tổng vẫn được nhập sau khi kiểm tra. Nếu chỉ có tổng thì không suy đoán NT/NN.
- Tháng gợi ý từ tiêu đề/sheet/tên file; luôn xác nhận kỳ trước khi lưu. Năm thiếu bắt buộc chọn.
- Tổng năm chỉ phản ánh các kỳ đã có dữ liệu. Thiếu file không chứng minh cán bộ có 0 giờ OT.
- Mọi dữ liệu lưu theo phút nguyên; tổng/so sánh dùng phút, hiển thị theo giờ.
- Demo tách khỏi dữ liệu thật, không tự đưa fixture vào IndexedDB.

Xem [module Excel](excel-import.md) về luồng nhập và các giới hạn hiện tại.

Xem [schema IndexedDB và 6 chỉ tiêu OT](indexeddb.md) cho logic lưu, lịch sử, audit và khôi phục JSON.
