# Work Dashboard — Quản lý Lịch làm việc & Tài chính cá nhân

Miền nghiệp vụ quản lý lịch trực/làm thêm theo tuần và tổng kết thu nhập theo tháng của bác sĩ, kết nối quy trình đăng ký rảnh với phòng khám và đối soát các nguồn thu nhập ngoài giờ.

## Lịch làm việc & Phòng khám

**KFC (Kid & Family Care)**:
Hệ thống phòng khám Tai Mũi Họng nơi bác sĩ làm thêm hiện tại, gồm 4 chi nhánh (`CN1`–`CN4`).
_Avoid_: Phòng khám mới, PK

**FH**:
Hệ thống phòng khám làm thêm cũ (dữ liệu lịch sử năm 2025), đã ngừng làm việc trước khi chuyển sang KFC.
_Avoid_: Phòng khám cũ

**Chi nhánh (`CN1`–`CN4`)**:
Một cơ sở cụ thể thuộc hệ thống KFC có địa chỉ và khung giờ hoạt động riêng theo nhóm ngày (`T2–T6` và `T7–CN`). Riêng `CN4` không hoạt động `Ca 2`.
_Avoid_: Cơ sở, địa điểm khám

**Ca (`Ca 1`, `Ca 2`, `Ca 3`)**:
Một trong ba khung giờ làm việc cố định trong ngày: `Ca 1` là buổi sáng, `Ca 2` là 4 tiếng đầu buổi chiều (`13:00–17:00`), và `Ca 3` là khung chiều tối còn lại.
_Avoid_: Buổi, slot, kíp

**Ô ca (Shift Slot)**:
Đơn vị lập lịch nhỏ nhất tương ứng với một cặp `(Ngày, Ca)`, luôn mang đúng một trong bốn trạng thái nghiệp vụ: `BV`, `Nghỉ`, `Rảnh`, hoặc một `Chi nhánh` KFC đã chốt.
_Avoid_: Ô lịch, cell

**BV (Bệnh viện)**:
Trạng thái của một Ô ca khi bác sĩ có lịch làm việc hoặc trực tại bệnh viện chính, không thể nhận ca làm thêm.
_Avoid_: Bận viện, trực chính

**Nghỉ**:
Trạng thái của một Ô ca khi bác sĩ chủ động nghỉ cá nhân và không nhận ca làm thêm.
_Avoid_: Off, nghỉ phép

**Rảnh**:
Trạng thái của một Ô ca khi bác sĩ đăng ký có thể đi làm thêm với quản lý KFC nhưng chưa được chốt phân công chi nhánh; không được tính công nếu không được xếp ca.
_Avoid_: ĐK, đăng ký, trống, available

**Lịch Xanh/Đỏ**:
Bản tóm tắt lịch rảnh/bận theo lưới tuần gửi cho quản lý KFC vào khoảng Thứ 5–Thứ 6 hàng tuần, trong đó `Rảnh` hiện màu xanh lá còn cả `BV` và `Nghỉ` gộp chung thành màu đỏ.
_Avoid_: Lịch báo bận, lịch đăng ký tuần

## Tài chính & Thu nhập

**Lương ca KFC**:
Khoản thu nhập cố định từ các Ô ca đã chốt chi nhánh KFC thuộc một tháng dương lịch, tính bằng số ca nhân đơn giá ca (`500.000đ` mặc định) và nhân Tỷ lệ thực nhận của tháng đó.
_Avoid_: Tiền ca, lương phòng khám

**Com KFC (Commission thủ thuật)**:
Khoản hoa hồng tính theo số ca thủ thuật thực hiện trong các ca làm thêm KFC (`40.000đ/ca thủ thuật` mặc định), cộng thêm khoản điều chỉnh đối soát cuối tháng nếu có.
_Avoid_: Tiền thủ thuật, hoa hồng khám

**Tỷ lệ thực nhận**:
Phần trăm thực lĩnh áp dụng cho Lương ca KFC của từng tháng dương lịch (mặc định `100%`, có thể điều chỉnh sang `90%` khi bị khấu trừ thuế TNCN).
_Avoid_: Thuế suất, hệ số lương

**AH**:
Nguồn thu nhập từ các bài hoặc đầu việc viết báo khoa học; mỗi task có đơn giá riêng và được ghi nhận vào doanh thu của tháng thực nhận tiền.
_Avoid_: Bệnh viện/Khác, viết bài, nhuận bút chung

**Task AH**:
Một đầu việc viết báo khoa học cụ thể có tên bài, số tiền thỏa thuận, ghi chú và trạng thái vòng đời (`Đang làm`, `Chờ thanh toán`, hoặc `Đã nhận`).
_Avoid_: Dự án AH, bài báo

**Thưởng / Điều chỉnh**:
Các khoản cộng thêm hoặc điều chỉnh ngoài công thức chuẩn trong tháng (ví dụ tiền thưởng từ quản lý hoặc chênh lệch đối soát) kèm ghi chú lý do.
_Avoid_: Phụ cấp, thu nhập khác

**Lương chính thức (BV)**:
Khoản thu nhập hàng tháng từ bệnh viện chính, được lưu tách biệt để có thể bật/tắt khi xem tổng thu nhập mà không làm lẫn thống kê thu nhập ngoài giờ.
_Avoid_: Lương cứng, lương nhà nước

**Kỳ chốt tháng**:
Ranh giới tính thu nhập dựa trên đúng ngày dương lịch của từng Ô ca; một tuần vắt ngang hai tháng sẽ tách công về đúng tháng chứa từng ngày đó.
_Avoid_: Chu kỳ lương tuần
