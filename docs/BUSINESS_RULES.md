# Quy tắc nghiệp vụ

## 1. Mục đích và phạm vi

Tài liệu này mô tả nghiệp vụ đề xuất cho PMQLTB trước khi thiết kế dữ liệu. Đây là đặc tả để thảo luận, chưa phải cấu hình đã được duyệt và chưa kéo theo việc triển khai module.

### Phạm vi MVP đề xuất

1. Đăng nhập và quản lý người dùng/vai trò cơ bản.
2. Danh mục dùng chung: bộ phận, kho, vị trí, nhóm hàng, hãng, đơn vị tính.
3. Hồ sơ thiết bị có định danh riêng và linh kiện/vật tư quản lý theo số lượng.
4. Nhập kho và điều chỉnh tăng sau khi được phép.
5. Tồn kho thực tế, giữ chỗ và khả dụng.
6. Cấp phát thiết bị, linh kiện và vật tư tiêu hao.
7. Mượn và trả.
8. Điều chuyển giữa kho, bộ phận và người sử dụng.
9. Thu hồi.
10. Nhật ký vòng đời và lịch sử thay đổi không thể sửa tùy ý.

### Chức năng mở rộng

- Đề nghị và đơn mua sắm, nhà cung cấp, báo giá.
- Sửa chữa, bảo hành và chi phí sửa chữa.
- Kế hoạch/biên bản kiểm kê và xử lý chênh lệch.
- Đề nghị/biên bản thanh lý.
- Dashboard, báo cáo nâng cao, cảnh báo và thông báo.

## 2. Khái niệm cốt lõi

- **Thiết bị định danh:** tài sản quản lý từng chiếc, có mã thiết bị duy nhất; có thể có serial, người giữ, bộ phận, vị trí và lịch sử riêng.
- **Linh kiện:** hàng có thể quản lý theo chiếc hoặc theo số lượng/lô. Linh kiện có serial phải được xử lý như thiết bị định danh.
- **Vật tư tiêu hao:** hàng quản lý theo số lượng; khi cấp phát thì ghi nhận xuất dùng, không tạo nghĩa vụ thu hồi/trả từng đơn vị.
- **Kho:** phạm vi tồn độc lập. Một vị trí vật lý có thể thuộc một kho.
- **Chứng từ:** bản ghi nghiệp vụ có mã duy nhất, dòng hàng, người tham gia, trạng thái và nhật ký.
- **Đơn vị yêu cầu:** bộ phận đứng tên nhu cầu; có thể khác bộ phận của người tạo.
- **Người giữ:** cá nhân chịu trách nhiệm trực tiếp với thiết bị.
- **Bộ phận sở hữu/sử dụng:** đơn vị chịu trách nhiệm quản lý hoặc sử dụng thiết bị.

## 3. Hai chiều trạng thái của thiết bị

Trạng thái sử dụng và tình trạng kỹ thuật là hai thuộc tính độc lập, không gộp thành một trường.

### 3.1. Trạng thái sử dụng

| Trạng thái  | Ý nghĩa                        | Có tính tồn kho         | Có thể cấp/mượn           |
| ----------- | ------------------------------ | ----------------------- | ------------------------- |
| `AVAILABLE` | Sẵn sàng trong kho             | Có                      | Có                        |
| `RESERVED`  | Đã giữ cho chứng từ được duyệt | Có                      | Chỉ cho chứng từ đang giữ |
| `IN_USE`    | Đã cấp phát, đang sử dụng      | Không                   | Không                     |
| `ON_LOAN`   | Đang được mượn, phải trả       | Không                   | Không                     |
| `IN_REPAIR` | Đang sửa chữa/bảo hành         | Không; hoặc kho cách ly | Không                     |
| `DISPOSED`  | Đã thanh lý, kết thúc vòng đời | Không                   | Không                     |

Có thể cần thêm `IN_TRANSIT`, `PENDING_INSPECTION`, `LOST` sau khi xác nhận nghiệp vụ. Trong MVP, điều chuyển phải hoàn thành nguyên tử hoặc dùng trạng thái chứng từ để biểu diễn đang giao nhận, tránh thêm trạng thái thiết bị quá sớm.

### 3.2. Tình trạng kỹ thuật

| Tình trạng | Ý nghĩa                             |
| ---------- | ----------------------------------- |
| `GOOD`     | Hoạt động tốt                       |
| `DEGRADED` | Hoạt động nhưng có lỗi/hạn chế      |
| `BROKEN`   | Hỏng, không thể sử dụng bình thường |
| `UNKNOWN`  | Chưa kiểm tra hoặc chưa xác định    |

Ví dụ: một thiết bị có thể vừa `IN_USE` vừa `DEGRADED`, hoặc `AVAILABLE` nhưng `BROKEN`. Mặc định chỉ thiết bị `AVAILABLE` và `GOOD`/`DEGRADED` theo chính sách mới được chọn để giao. `DISPOSED` là trạng thái cuối, không được đưa lại vào tồn bằng chỉnh sửa trực tiếp.

## 4. Quy tắc tồn kho

Với hàng quản lý theo số lượng, tại từng kho và mã hàng:

```text
tồn khả dụng = tồn thực tế - số lượng giữ chỗ hợp lệ
```

- **Tồn thực tế:** số lượng đã nhập/nhận trừ số lượng đã xuất/giao, theo chứng từ hoàn tất.
- **Giữ chỗ:** số lượng dành cho yêu cầu đã duyệt nhưng chưa giao; chưa làm giảm tồn thực tế.
- **Tồn khả dụng:** lượng có thể cam kết cho yêu cầu mới; không được âm.
- Chứng từ nháp, chờ duyệt, bị từ chối, đã hủy không tạo giữ chỗ.
- Khi duyệt, hệ thống phải tạo giữ chỗ trong cùng transaction với cập nhật trạng thái chứng từ.
- Khi giao, hệ thống giảm tồn thực tế và giải phóng phần giữ chỗ tương ứng trong cùng transaction.
- Khi hủy/từ chối hoặc hết hiệu lực, phần giữ chỗ chưa giao phải được giải phóng.
- Không cho xuất vượt tồn khả dụng, trừ khi có quyền override được phê duyệt và lưu lý do; đề xuất MVP không hỗ trợ tồn âm.
- Với thiết bị định danh, giữ chỗ áp dụng trực tiếp lên mã thiết bị, không chỉ số lượng tổng.
- Mọi điều chỉnh tồn phải qua chứng từ điều chỉnh, có lý do và audit log; không sửa số dư trực tiếp.

## 5. Quy tắc chứng từ chung

### 5.1. Trường bắt buộc chung

- Mã chứng từ duy nhất, loại chứng từ và ngày tạo.
- Người tạo, bộ phận yêu cầu và phạm vi kho liên quan.
- Ít nhất một dòng hàng hợp lệ.
- Mỗi dòng có mã hàng/thiết bị và số lượng dương; thiết bị định danh có số lượng bằng 1.
- Mục đích/lý do.
- Người giao và người nhận khi có giao nhận thực tế.
- Thời điểm, người thực hiện và ghi chú ở mỗi lần chuyển trạng thái.
- Lý do bắt buộc khi từ chối, hủy, điều chỉnh hoặc giao thiếu.
- Tệp đính kèm/biên bản chỉ bắt buộc theo chính sách từng loại chứng từ.

### 5.2. Trạng thái chung

```text
DRAFT → PENDING_APPROVAL → APPROVED → PARTIALLY_FULFILLED → COMPLETED
                         ↘ REJECTED
DRAFT/PENDING_APPROVAL/APPROVED/PARTIALLY_FULFILLED → CANCELLED (có điều kiện)
```

- `DRAFT`: người tạo được sửa/xóa nháp trong phạm vi quyền.
- `PENDING_APPROVAL`: khóa các trường ảnh hưởng phê duyệt; muốn sửa phải thu hồi về nháp nếu chưa được xử lý.
- `APPROVED`: được phép giữ chỗ và chuẩn bị giao.
- `PARTIALLY_FULFILLED`: đã giao/nhận một phần, còn phần chưa hoàn tất.
- `COMPLETED`: đã hoàn tất toàn bộ phần được chấp thuận; không sửa trực tiếp.
- `REJECTED`: kết thúc, bắt buộc có lý do; muốn làm lại phải tạo bản sao/chứng từ mới.
- `CANCELLED`: kết thúc phần chưa thực hiện; dữ liệu đã giao không bị đảo bằng cách xóa mà phải có chứng từ thu hồi/trả/điều chỉnh.

Mỗi lần chuyển trạng thái phải kiểm tra quyền, phiên bản bản ghi và điều kiện nghiệp vụ ở backend, đồng thời ghi audit log.

## 6. Quy trình nghiệp vụ MVP

### 6.1. Nhập kho

**Chứng từ:** phiếu nhập kho.

**Bắt buộc:** kho nhận, nguồn nhập, ngày nhận, người giao, người nhận kho, các dòng hàng; serial/mã thiết bị với tài sản định danh.

**Luồng đề xuất:** IT/thủ kho tạo → người có thẩm quyền xác nhận hoặc duyệt → thủ kho nhận và kiểm đếm → thủ kho hoàn tất.

- Chỉ `COMPLETED` mới tăng tồn thực tế và tạo/kích hoạt hồ sơ thiết bị.
- Serial và mã thiết bị không được trùng.
- Nhận một phần ghi số lượng thực nhận; phần còn lại tiếp tục mở hoặc được đóng với lý do.
- Sai sau hoàn tất phải dùng chứng từ điều chỉnh/đảo nghiệp vụ, không sửa số lượng đã nhập.

### 6.2. Cấp phát thiết bị

**Chứng từ:** yêu cầu/phiếu cấp phát.

**Bắt buộc:** bộ phận yêu cầu, người nhận hoặc vị trí nhận, mục đích, dòng thiết bị/loại thiết bị, kho xuất.

**Luồng:** người sử dụng/IT tạo → người duyệt phê duyệt → IT/thủ kho chọn và giao thiết bị → người nhận xác nhận → người giao hoàn tất.

- Khi duyệt có thể giữ chỗ theo thiết bị cụ thể hoặc theo loại hàng, tùy chính sách được xác nhận.
- Khi giao, thiết bị chuyển từ `AVAILABLE`/`RESERVED` sang `IN_USE`, gắn người giữ/bộ phận/vị trí.
- Thiết bị cấp phát vẫn là tài sản phải theo dõi và có thể thu hồi/điều chuyển.

### 6.3. Cấp phát linh kiện/vật tư tiêu hao

- Dùng chứng từ cấp phát nhưng mỗi dòng phải phân biệt `ASSET`, `COMPONENT` hoặc `CONSUMABLE`.
- Vật tư tiêu hao giảm số lượng kho khi giao, không chuyển sang trạng thái `IN_USE` từng đơn vị và không có hạn trả.
- Linh kiện có serial hoặc cần truy vết riêng đi theo quy tắc thiết bị định danh.
- Linh kiện lắp vào thiết bị phải ghi thiết bị cha và lịch sử lắp/tháo nếu chức năng này nằm trong phạm vi được duyệt.
- Thu hồi vật tư tiêu hao chỉ là nhập trả nếu vật tư còn sử dụng được, không phải quy trình thu hồi tài sản.

### 6.4. Mượn/trả

**Chứng từ:** phiếu mượn và các lần trả.

**Bắt buộc:** người mượn, bộ phận, mục đích, kho/người giao, danh sách thiết bị, ngày mượn và hạn trả.

**Luồng:** người sử dụng/IT tạo → người duyệt phê duyệt → IT/thủ kho giao → người mượn xác nhận → người nhận trả kiểm tra → hoàn tất.

- Khi giao, thiết bị sang `ON_LOAN` và ghi người mượn/hạn trả.
- Cho phép trả một phần; từng dòng có số lượng/thiết bị đã trả và tình trạng khi trả.
- Thiết bị trả tốt về `AVAILABLE`; trả hỏng về `IN_REPAIR` hoặc khu cách ly theo chính sách.
- Không được hoàn tất khi còn thiết bị chưa trả, trừ khi phần còn lại được chuyển thành mất/hỏng/cấp phát bằng chứng từ phù hợp.

### 6.5. Điều chuyển

**Chứng từ:** phiếu điều chuyển.

**Bắt buộc:** nguồn, đích, lý do, danh sách thiết bị/hàng, người giao và người nhận.

Nguồn/đích có thể là kho, bộ phận, người dùng hoặc vị trí nhưng phải tuân theo các cặp được phép:

- Kho → kho: chuyển tồn giữa hai kho.
- Kho → bộ phận/người dùng: về bản chất là cấp phát; nên dùng chứng từ cấp phát trong MVP.
- Người dùng → người dùng: đổi người giữ, cần xác nhận của người giao và người nhận; có thể cần duyệt của IT/quản lý.
- Bộ phận → bộ phận: đổi bộ phận chịu trách nhiệm, đồng thời xác định người giữ mới.
- Người dùng/bộ phận → kho: về bản chất là thu hồi/trả; nên dùng chứng từ thu hồi trong MVP.

Thiết bị đang mượn hoặc sửa chữa không được điều chuyển thông thường. Chuyển kho giao nhận một phần chỉ cập nhật các dòng đã nhận; phần đang vận chuyển phải được truy vết bằng trạng thái dòng/chứng từ.

### 6.6. Thu hồi

**Chứng từ:** yêu cầu/phiếu thu hồi.

**Bắt buộc:** người/bộ phận đang giữ, nơi nhận về, lý do, thiết bị, người giao, người nhận và tình trạng lúc nhận.

**Luồng:** IT/người có quyền tạo → duyệt nếu chính sách yêu cầu → người đang giữ bàn giao → IT/thủ kho nhận và kiểm tra → hoàn tất.

- Thiết bị tốt chuyển về `AVAILABLE` tại kho nhận.
- Thiết bị hỏng chuyển `IN_REPAIR` hoặc khu cách ly, không trở thành tồn khả dụng.
- Thu hồi một phần được phép theo từng thiết bị/dòng.

## 7. Giao nhận một phần, từ chối, hủy và điều chỉnh

### Giao/nhận một phần

- Theo dõi số lượng yêu cầu, được duyệt, đã giữ, đã giao, đã nhận và còn lại trên từng dòng.
- Không cho tổng đã giao vượt số được duyệt.
- Mỗi đợt giao nhận có người, thời điểm và ghi chú riêng.
- Chứng từ chỉ `COMPLETED` khi tất cả dòng đã hoàn tất hoặc phần còn lại được đóng có lý do.

### Từ chối

- Chỉ người có quyền duyệt trong đúng phạm vi mới được từ chối.
- Bắt buộc lý do; không làm thay đổi tồn thực tế.
- Nếu đã tạo giữ chỗ thì phải giải phóng trong cùng transaction.

### Hủy

- Người tạo có thể hủy trước khi duyệt; sau duyệt cần người có quyền phù hợp.
- Không được hủy theo cách làm mất lịch sử phần đã giao.
- Hủy phần chưa giao sẽ giải phóng giữ chỗ; phần đã giao phải được xử lý bằng trả/thu hồi/điều chỉnh.

### Điều chỉnh

- Không sửa chứng từ đã hoàn tất.
- Tạo chứng từ điều chỉnh tham chiếu bản gốc, nêu lý do và phần chênh lệch.
- Điều chỉnh làm thay đổi tồn hoặc người giữ cần phê duyệt và transaction.
- Audit log phải lưu giá trị trước/sau, người thực hiện và thời điểm.

## 8. Quy tắc chống tự duyệt

- Chính sách chống tự duyệt được cấu hình theo đơn vị hoặc loại chứng từ.
- Khi bật, người duyệt không được là người tạo, người yêu cầu hoặc người thụ hưởng trực tiếp.
- Có nhiều vai trò không làm mất giới hạn này: một người vừa là IT vừa là người duyệt vẫn không được duyệt chứng từ của chính mình.
- Nếu không còn người duyệt hợp lệ, chuyển cấp duyệt dự phòng; không tự động bỏ qua.
- Quyền quản trị hệ thống không mặc nhiên cho phép tự duyệt nghiệp vụ.
- Ngoại lệ khẩn cấp nếu được cho phép phải có quyền riêng, lý do bắt buộc và audit log nổi bật.

## 9. Toàn vẹn và lịch sử

- Mã thiết bị, serial theo phạm vi đã chọn, mã chứng từ và mã danh mục phải bảo đảm duy nhất.
- Không hard-delete chứng từ đã trình duyệt hoặc đã tác động tồn; chỉ khóa/ngừng sử dụng hoặc đảo bằng chứng từ.
- Mọi chuyển trạng thái thiết bị phải xuất phát từ một chứng từ hoặc thao tác quản trị có lý do.
- Lịch sử tối thiểu gồm thiết bị, hành động, chứng từ nguồn, nguồn/đích, người giữ cũ/mới, trạng thái/tình trạng cũ-mới, người thao tác và thời gian.
- Dùng transaction cho cập nhật chứng từ, tồn, giữ chỗ, thiết bị và audit log có liên quan.
- Dùng optimistic concurrency/version để ngăn hai người duyệt/giao cùng một tài sản.

## 10. Giả định cần xác nhận trước thiết kế dữ liệu

1. Hệ thống phục vụ một công ty hay nhiều pháp nhân/chi nhánh độc lập?
2. Cấu trúc tổ chức có bao nhiêu cấp và một người có thể thuộc nhiều bộ phận không?
3. Một kho thuộc bộ phận, chi nhánh hay dùng chung; thủ kho có thể quản lý nhiều kho không?
4. Có cần vị trí chi tiết trong kho như khu/kệ/ngăn không?
5. Thiết bị nào bắt buộc serial; serial duy nhất toàn hệ thống hay chỉ theo hãng/loại?
6. Linh kiện nào quản lý từng chiếc, theo lô, hạn sử dụng hoặc chỉ tổng số lượng?
7. Có cần theo dõi giá, nguồn vốn, khấu hao, mã tài sản kế toán trong MVP không?
8. Ai được tạo yêu cầu thay người khác hoặc thay bộ phận khác?
9. Cấp duyệt là một cấp hay nhiều cấp; có phụ thuộc giá trị, loại hàng, số lượng hoặc bộ phận không?
10. Đơn vị nào bắt buộc chống tự duyệt và “người thụ hưởng” được xác định theo cá nhân hay bộ phận?
11. Có cho phép người duyệt sửa số lượng/dòng hàng hay chỉ duyệt, từ chối và yêu cầu chỉnh sửa?
12. Giữ chỗ phát sinh ngay khi duyệt hay chỉ khi thủ kho chọn hàng; giữ chỗ có ngày hết hạn không?
13. Có cho phép tồn âm hoặc giao vượt số lượng duyệt trong trường hợp ngoại lệ không?
14. Người nhận có bắt buộc xác nhận điện tử hay thủ kho có thể xác nhận thay; có cần chữ ký/tệp biên bản không?
15. Với giao nhận một phần, ai có quyền đóng phần còn lại và lý do nào được chấp nhận?
16. Cấp phát thiết bị có thời hạn/chu kỳ xác nhận lại hay chỉ mượn mới có hạn trả?
17. Một thiết bị có thể gắn đồng thời cho một người và một bộ phận không; trường nào là trách nhiệm chính?
18. Điều chuyển trực tiếp người dùng → người dùng có được phép hay bắt buộc thu hồi về kho trước?
19. Thiết bị hỏng trả về nằm trong kho thường, kho cách ly hay chuyển thẳng sang quy trình sửa chữa?
20. Có cần quản lý thiết bị mất, thất lạc, tiêu hủy và bồi thường trong MVP không?
21. Người dùng được xem toàn bộ lịch sử thiết bị mình từng giữ hay chỉ dữ liệu hiện tại?
22. Dữ liệu báo cáo có cần ẩn giá mua, thông tin người dùng hoặc trường nhạy cảm theo vai trò không?
23. Thời gian lưu audit log/chứng từ là bao lâu; có yêu cầu xuất Excel/PDF hoặc đánh số theo năm/đơn vị không?
24. Đăng nhập dùng tài khoản nội bộ, Microsoft/Google SSO hay Active Directory?
25. Múi giờ nghiệp vụ duy nhất là `Asia/Ho_Chi_Minh` hay có nhiều múi giờ?
