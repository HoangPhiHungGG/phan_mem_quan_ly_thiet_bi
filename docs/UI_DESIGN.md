# Thiết kế màn hình dự kiến

## 1. Phạm vi và nguyên tắc

Đây là đặc tả UX/UI để duyệt, chưa triển khai route hoặc component. Giao diện giữ ngôn ngữ tiếng Việt, nền sáng, navy/xanh dương và layout hiện tại.

- Desktop ưu tiên bảng và thao tác hàng loạt; mobile ưu tiên danh sách card và một hành động chính.
- UI chỉ hiển thị action từ `permissions.allowedActions`, nhưng backend vẫn là nguồn quyết định quyền.
- Không dùng KPI/dữ liệu giả. Loading, empty, error và permission-denied là các trạng thái bắt buộc.
- Mọi thời gian hiển thị `Asia/Ho_Chi_Minh`, tooltip/chi tiết có timestamp đầy đủ; dữ liệu API vẫn UTC.
- Không dùng màu làm tín hiệu duy nhất; trạng thái luôn có nhãn/icon.
- Form cảnh báo thay đổi chưa lưu, chống double-submit và gửi idempotency key cho command.

## 2. Khung ứng dụng

### Desktop

- Sidebar giữ các nhóm: Tổng quan; Tài sản; Kho; Quy trình; Báo cáo; Quản trị.
- Header: breadcrumb, tìm kiếm nhanh, trạng thái API, thông báo, menu người dùng.
- Nội dung tối đa phù hợp màn hình rộng; bảng có sticky header và horizontal scroll khi cần.

### Mobile

- Sidebar thành drawer đã có nút mở/đóng.
- Header rút gọn, breadcrumb tối đa hai cấp.
- Bộ lọc mở trong bottom sheet/drawer; chip hiển thị filter đang áp dụng.
- Bảng chuyển thành card theo hàng hoặc cho phép cuộn ngang nếu cần so sánh cột.
- Thanh action chính sticky ở đáy; vùng bấm tối thiểu 44 px.

## 3. Trạng thái chuẩn của màn hình

Mọi trang danh sách/chi tiết phải có:

| Trạng thái              | Biểu hiện                                           | Hành động                          |
| ----------------------- | --------------------------------------------------- | ---------------------------------- |
| Initial loading         | Skeleton đúng hình dạng, không nhấp nháy toàn trang | Không                              |
| Background refresh      | Giữ dữ liệu cũ, spinner nhỏ                         | Cho phép xem; khóa action xung đột |
| Empty first-use         | Giải thích chưa có dữ liệu                          | Nút tạo nếu có quyền               |
| Empty filtered          | “Không tìm thấy kết quả”                            | Xóa bộ lọc                         |
| Recoverable error       | Thông báo tiếng Việt + requestId                    | Thử lại                            |
| Offline/API unavailable | Banner và trạng thái kết nối                        | Thử lại; không giả thành công      |
| Permission denied       | 403 có hướng dẫn liên hệ quản trị                   | Quay lại                           |
| Not found               | 404 không tiết lộ tài nguyên ngoài scope            | Quay lại danh sách                 |
| Conflict                | Dialog dữ liệu đã thay đổi                          | Tải bản mới, không tự ghi đè       |
| Submit pending          | Nút loading/disabled                                | Chặn double-click                  |
| Success                 | Toast + cập nhật cache/đi đến chi tiết              | Không lặp command                  |

## 4. Điều hướng MVP

| Menu        | Route dự kiến       | Màn hình                               |
| ----------- | ------------------- | -------------------------------------- |
| Tổng quan   | `/`                 | Health thật và tác vụ của tôi          |
| Thiết bị    | `/thiet-bi`         | Danh sách thiết bị                     |
| Thiết bị    | `/thiet-bi/[id]`    | Chi tiết/timeline/tài liệu             |
| Linh kiện   | `/linh-kien`        | Mã hàng theo số lượng/serialized       |
| Kho         | `/kho`              | Kho và tồn kho                         |
| Kho         | `/kho/[id]/ton-kho` | Balance/reservation/ledger             |
| Cấp phát    | `/cap-phat`         | Danh sách chứng từ cấp phát            |
| Mượn/trả    | `/muon-tra`         | Danh sách khoản mượn/hạn trả           |
| Điều chuyển | `/dieu-chuyen`      | Danh sách điều chuyển                  |
| Thu hồi     | `/thu-hoi`          | Danh sách thu hồi                      |
| Quản trị    | `/quan-tri/*`       | Người dùng, vai trò, bộ phận, danh mục |

Nhập kho nằm trong Kho (`/kho/nhap-kho`) ở MVP. Mua sắm, sửa chữa, kiểm kê, thanh lý và báo cáo nâng cao giữ placeholder đến giai đoạn mở rộng.

## 5. Đăng nhập và phiên

### Đăng nhập

Trường:

- Email/tên đăng nhập.
- Mật khẩu nếu dùng local auth.
- “Đăng nhập với Microsoft/Google” nếu chốt SSO.

Nút: `Đăng nhập`; trạng thái loading; lỗi chung không tiết lộ tài khoản tồn tại. Không lưu token trong localStorage nếu dùng refresh cookie. Phiên hết hạn mở dialog, giữ draft cục bộ an toàn và chuyển đăng nhập lại.

## 6. Trang danh sách thiết bị

### Thanh công cụ

- Tìm theo mã tài sản, serial, tên model.
- Filter: loại hàng, trạng thái sử dụng, tình trạng, kho, vị trí, bộ phận, người giữ, có/không serial.
- Sort: mới cập nhật, mã tài sản, tên, hạn bảo hành.
- Nút theo quyền: `Thêm thiết bị`, `Nhập kho`, `Xuất dữ liệu`.
- Hiển thị số filter đang áp dụng; URL lưu query để chia sẻ/back-forward.

### Bảng desktop

| Cột             | Ghi chú                              |
| --------------- | ------------------------------------ |
| Mã tài sản      | Link chi tiết, không truncate mất mã |
| Tên/model       | Tên hàng, hãng/model                 |
| Serial          | `—` nếu không có                     |
| Trạng thái      | Badge usage status                   |
| Tình trạng      | Badge riêng, không gộp trạng thái    |
| Vị trí hiện tại | Kho/vị trí hoặc bộ phận/người giữ    |
| Cập nhật        | Theo giờ Việt Nam                    |
| Thao tác        | Menu chỉ chứa action được phép       |

Selection hàng loạt chỉ bật cho action thực sự hỗ trợ atomically/bulk. Cursor pagination có `Tải thêm` hoặc next/previous, không hiển thị tổng giả nếu backend chưa tính.

### Card mobile

Ưu tiên mã, tên, hai badge trạng thái/tình trạng và vị trí/người giữ. Chạm card mở chi tiết; menu ba chấm cho action phụ.

## 7. Trang chi tiết thiết bị

### Header

- Mã tài sản, tên/model, serial.
- Badge trạng thái sử dụng và tình trạng kỹ thuật tách riêng.
- Vị trí/người giữ hiện tại.
- Nút theo quyền/trạng thái: `Cấp phát`, `Cho mượn`, `Điều chuyển`, `Thu hồi`, `Báo hỏng`, `Chỉnh sửa thông tin`.
- Action không hợp lệ không chỉ disable im lặng; tooltip giải thích hoặc ẩn nếu do quyền.

### Các tab

#### Tổng quan

- Mã tài sản, SKU/model, loại, hãng, serial.
- Ngày mua/nhập, bảo hành, giá mua nếu có quyền.
- Kho/vị trí, người giữ, bộ phận.
- Thông số kỹ thuật dạng key-value có giới hạn.
- Linh kiện cha/con nếu áp dụng.

#### Timeline

- Cursor pagination, mới nhất trước.
- Mỗi event: icon/loại, thời gian, người thao tác, từ → đến, tình trạng trước/sau, link chứng từ.
- Filter theo loại sự kiện và khoảng ngày.
- Không tải toàn bộ lịch sử một lần và không đọc từ mảng trong device.

#### Chứng từ liên quan

Bảng: số chứng từ, loại, trạng thái, vai trò của thiết bị trong chứng từ, ngày, người giao/nhận. Link mở drawer hoặc trang chi tiết.

#### Tài liệu

Danh sách tên file, loại, kích thước, người/ngày tải lên, trạng thái scan. Nút tải/xem/xóa theo quyền; upload có progress, giới hạn loại/dung lượng và retry.

#### Sửa chữa

Chỉ hiện khi module mở rộng được bật; danh sách phiếu, lỗi, nhà cung cấp, trạng thái, chi phí theo quyền.

### Mobile

Header xếp dọc, action chính sticky; tab thành horizontal scroll hoặc select. Timeline một cột. Thông số dài dùng accordion.

## 8. Danh mục mã hàng và linh kiện

### Danh sách

Filter SKU/tên, nhóm, tracking mode, consumption type, hãng, active. Cột: SKU, tên, nhóm, đơn vị, serialized/quantity, tài sản/linh kiện/tiêu hao, tổng khả dụng theo scope.

### Form mã hàng

- SKU, tên, loại hàng, đơn vị tính.
- Hãng, model number.
- Kiểu quản lý `SERIALIZED`/`QUANTITY`.
- Loại sử dụng `ASSET`/`COMPONENT`/`CONSUMABLE`.
- Precision/reorder point theo đơn vị.
- Thông số kỹ thuật có key allowlist hoặc schema theo loại.

Sau khi phát sinh giao dịch, các field tracking/đơn vị không được đổi trực tiếp nếu làm sai lịch sử.

## 9. Kho và tồn kho

### Danh sách kho

Card/table có mã, tên, bộ phận, địa chỉ, thủ kho, trạng thái. Nút `Xem tồn`, `Nhập kho`, `Điều chuyển` theo quyền.

### Tồn kho

Filter mã hàng, loại, vị trí, chỉ hàng sắp hết, có giữ chỗ. Bảng:

- SKU/tên.
- Vị trí.
- Tồn thực tế.
- Đang giữ chỗ.
- Khả dụng.
- Mức đặt hàng lại.
- Cập nhật cuối.

Click một dòng mở drawer gồm reservations active và ledger gần nhất. Không có nút sửa balance trực tiếp; chỉ `Tạo phiếu điều chỉnh` nếu có quyền.

### Nhập kho

Wizard đề xuất:

1. Thông tin phiếu: kho, nguồn/nhà cung cấp, ngày, người giao/nhận, lý do.
2. Dòng hàng: chọn SKU, số lượng; với serialized nhập/tải danh sách mã tài sản và serial.
3. Kiểm tra duplicate/reference/precision.
4. Xem lại và gửi duyệt/xác nhận.
5. Giao nhận thực tế và hoàn tất.

Draft autosave có version; lỗi từng dòng hiển thị đúng vị trí. Import file chỉ ở giai đoạn sau nếu chưa có validation preview.

## 10. Khung danh sách chứng từ

Dùng chung cho cấp phát, mượn/trả, điều chuyển, thu hồi:

- Tab: `Của tôi`, `Chờ tôi duyệt`, `Cần xử lý`, `Tất cả trong phạm vi`.
- Filter: số chứng từ, trạng thái, bộ phận, kho, người yêu cầu/nhận, khoảng ngày.
- Bảng: số, loại, bộ phận/người hưởng, kho, tiến độ dòng, trạng thái, người cần hành động, cập nhật.
- Badge overdue cho khoản mượn quá hạn; không dùng số KPI giả.
- Nút `Tạo yêu cầu` theo quyền.

Mobile hiển thị card có số chứng từ, trạng thái, đối tượng, tiến độ và action chính.

## 11. Form chứng từ và luồng thao tác

### Bước chung

1. Chọn loại/mục đích và đơn vị/người hưởng.
2. Chọn kho nguồn/đích theo quy trình.
3. Thêm dòng; UI chỉ hiển thị hàng phù hợp scope nhưng backend kiểm tra lại.
4. Xem tồn khả dụng ở thời điểm hiện tại, ghi rõ chưa phải cam kết đến khi giữ chỗ.
5. Lưu nháp hoặc gửi duyệt.

Form hiển thị lỗi field và lỗi nghiệp vụ ở đầu form. Khi `VERSION_CONFLICT`, mở dialog so sánh và tải lại; không merge tự động chứng từ.

### Trang chi tiết chứng từ

- Header: số, loại, trạng thái, version, người tạo và thời điểm.
- Stepper: tạo → duyệt → chuẩn bị → giao/nhận → hoàn tất.
- Thông tin người/bộ phận/kho nguồn-đích/mục đích/hạn trả.
- Bảng dòng: yêu cầu, duyệt, giữ, đã giao, còn lại, tình trạng.
- Panel approvals: cấp, người được giao, quyết định, thời gian, nhận xét.
- Các đợt giao nhận riêng, tệp và audit tóm tắt.
- Footer action dựa trên `allowedActions` và state machine.

## 12. Duyệt, từ chối, hủy và điều chỉnh

### Duyệt

Người duyệt xem snapshot nhu cầu, tồn khả dụng, lịch sử duyệt và cảnh báo tự duyệt. Có thể duyệt toàn bộ hoặc số lượng từng dòng nếu chính sách cho phép. Nút `Duyệt` mở confirm, bắt buộc comment theo cấu hình.

### Từ chối

Dialog bắt buộc chọn reason code và nhập lý do. Sau thành công chuyển `REJECTED`, không optimistic giả nếu command chưa trả về.

### Hủy

Dialog giải thích phần giữ chỗ sẽ được giải phóng. Nếu đã giao một phần, UI không cho “xóa”; hiển thị phần có thể hủy và link tạo thu hồi/trả cho phần đã giao.

### Điều chỉnh

Từ chứng từ hoàn tất, action `Tạo điều chỉnh` tạo draft mới có link bản gốc và delta; original read-only. Người dùng không sửa trực tiếp lịch sử.

## 13. Giao nhận một phần

Drawer/page `Tạo đợt giao`:

- Mỗi dòng hiển thị đã duyệt, đã giao, còn lại, đang giữ.
- Nhập lượng giao lần này; serialized chọn device cụ thể.
- Người giao, người nhận, ngày giờ, tình trạng, ghi chú/tệp ký nhận.
- Validation tổng lần này không vượt remaining và device còn reserved cho chứng từ.
- Sau giao: chứng từ `PARTIALLY_FULFILLED` hoặc `COMPLETED`.
- Có action `Đóng phần còn lại` riêng, bắt buộc quyền và lý do.

Xác nhận nhận có ba lựa chọn theo policy: nhận đủ, nhận một phần, có tranh chấp. Tranh chấp không tự cập nhật thành hoàn tất.

## 14. Mượn/trả

### Tạo phiếu mượn

Trường thêm: người mượn, ngày mượn, hạn trả, mục đích, địa điểm sử dụng. Cảnh báo nếu người mượn có phiếu quá hạn theo chính sách.

### Trả

- Chọn từng thiết bị chưa trả.
- Ghi tình trạng khi trả, phụ kiện đi kèm và ghi chú.
- Thiết bị tốt đề xuất về kho/vị trí; hỏng đề xuất khu cách ly/sửa chữa.
- Cho trả một phần; trang chi tiết hiển thị tiến độ và số ngày quá hạn.

## 15. Điều chuyển và thu hồi

### Điều chuyển

Form xác định rõ loại nguồn/đích trước, sau đó giới hạn lựa chọn hợp lệ. Với kho → kho: kho nguồn, kho đích, vị trí, người giao/nhận. Với người → người: người giữ cũ/mới, bộ phận và xác nhận hai bên.

Nếu chọn cặp thực chất là cấp phát hoặc thu hồi, UI chuyển sang đúng workflow thay vì tạo chứng từ mơ hồ.

### Thu hồi

Hiển thị người/bộ phận đang giữ, thiết bị, lý do, kho nhận, tình trạng lúc nhận. Thiết bị hỏng không được mặc định đưa vào available; bắt buộc chọn khu cách ly hoặc tạo sửa chữa theo policy.

## 16. Quản trị

### Người dùng

Bảng: mã nhân viên, tên, email, bộ phận chính, vai trò hiệu lực, trạng thái. Chi tiết có assignments với role, department/warehouse scope, hiệu lực và người cấp.

### Vai trò

Không cho nhập permission string tùy ý. Chọn từ catalog nhóm theo module/action, cảnh báo quyền nhạy cảm. Role hệ thống không xóa; clone để tùy biến.

### Bộ phận, kho, vị trí và danh mục

Tree cho bộ phận/vị trí; form code/name/parent/active. Deactivate hiển thị impact và chặn nếu còn quan hệ cần xử lý.

## 17. Chức năng mở rộng

- **Mua sắm:** yêu cầu mua, báo giá/nhà cung cấp, duyệt, liên kết phiếu nhập.
- **Sửa chữa:** kanban/list theo trạng thái, chi phí, bảo hành và timeline thiết bị.
- **Kiểm kê:** tạo phạm vi, freeze snapshot, giao người đếm, nhập/scan, đối chiếu, tạo điều chỉnh.
- **Thanh lý:** danh sách đủ điều kiện, hội đồng duyệt, giá trị và xác nhận hoàn tất.
- **Báo cáo:** filter có scope, export async, trạng thái tạo file; không hiển thị dữ liệu nhạy cảm thiếu quyền.

## 18. Accessibility và chất lượng

- Keyboard navigation, focus visible, label/error liên kết bằng ARIA.
- Contrast đạt WCAG AA; badge không chỉ dựa vào màu.
- Confirm cho action không thể đảo; không confirm cho thao tác thường.
- Toast không phải nơi duy nhất chứa lỗi; lỗi quan trọng vẫn hiện trong trang/dialog.
- Debounce search 300–500 ms và hủy request cũ.
- Giữ filter/sort trong URL; không lưu dữ liệu nhạy cảm trong URL/localStorage.
- Test responsive tối thiểu 360 px, tablet 768 px, desktop 1280 px.

## 19. Điểm cần duyệt trước triển khai UI

1. Nhập kho đặt trong menu Kho hay cần menu riêng?
2. Người duyệt có được sửa số lượng trực tiếp trong màn duyệt không?
3. Có bắt buộc người nhận tự xác nhận và ký/tải biên bản không?
4. Desktop dùng pagination có số trang hay cursor `Tải thêm`?
5. Trên mobile cần hỗ trợ quét barcode/QR trong MVP không?
6. Có hiển thị giá mua trong trang chi tiết thiết bị và cho những vai trò nào?
7. Timeline cho người sử dụng hiển thị toàn bộ lịch sử hay chỉ giai đoạn liên quan?
8. Giao nhận tranh chấp được xử lý bởi IT, thủ kho hay người duyệt?
9. Có cần import Excel ngay MVP hay để sau khi CRUD thủ công ổn định?
10. Bộ nhận diện hiện tại có logo/màu/font chính thức cần áp dụng không?
