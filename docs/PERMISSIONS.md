# Vai trò và phân quyền

## 1. Mô hình đề xuất

Áp dụng kết hợp:

- **RBAC:** quyền cơ sở được gom theo vai trò.
- **Phạm vi dữ liệu:** giới hạn quyền theo bộ phận, kho và quan hệ với đối tượng.
- **Điều kiện nghiệp vụ:** trạng thái chứng từ, người tạo/người nhận và quy tắc chống tự duyệt.

Một người có thể có nhiều vai trò. Quyền hiệu lực là hợp của các quyền được cấp nhưng vẫn bị giới hạn bởi phạm vi và quy tắc cấm bắt buộc. Ví dụ, người vừa là IT vừa là người duyệt vẫn không được tự duyệt khi chính sách chống tự duyệt đang bật.

Quyền phải được kiểm tra tại backend. Ẩn nút ở frontend chỉ phục vụ trải nghiệm, không phải biện pháp bảo mật.

## 2. Vai trò chuẩn

### Quản trị hệ thống (`SYSTEM_ADMIN`)

- Quản lý tài khoản, vai trò, phạm vi, danh mục hệ thống và cấu hình.
- Xem audit log kỹ thuật theo thẩm quyền.
- Không mặc nhiên được duyệt, giao nhận hoặc điều chỉnh chứng từ nghiệp vụ.
- Không được sửa/xóa lịch sử để hợp thức hóa giao dịch.

### IT (`IT_STAFF`)

- Quản lý hồ sơ kỹ thuật thiết bị và linh kiện trong phạm vi được giao.
- Tạo yêu cầu, đề xuất cấp phát/thu hồi/điều chuyển và xác nhận kỹ thuật.
- Chọn thiết bị phù hợp, ghi nhận tình trạng và lịch sử.
- Chỉ thao tác tồn kho nếu đồng thời có quyền kho hoặc được cấp quyền thao tác cụ thể.

### Thủ kho (`WAREHOUSE_KEEPER`)

- Xem và thao tác tồn tại các kho được phân công.
- Nhập, giữ chỗ, xuất, giao, nhận và kiểm đếm theo chứng từ hợp lệ.
- Không duyệt nhu cầu chỉ vì đang quản lý kho.
- Không xem hoặc thao tác kho ngoài phạm vi.

### Người duyệt (`APPROVER`)

- Xem và xử lý chứng từ thuộc bộ phận, kho, loại và hạn mức được phân công.
- Duyệt, từ chối, yêu cầu chỉnh sửa hoặc hủy sau duyệt theo quyền.
- Không tự duyệt khi chính sách áp dụng.
- Không trực tiếp thay đổi tồn nếu không có vai trò/quyền kho tương ứng.

### Người sử dụng (`END_USER`)

- Xem tài sản mình đang giữ, đang mượn hoặc được cấp.
- Xem yêu cầu do mình tạo hoặc mình là người nhận/người bàn giao.
- Tạo các yêu cầu được cho phép cho bản thân/bộ phận của mình.
- Xác nhận giao, nhận, trả và báo hỏng theo quan hệ với chứng từ.
- Không xem tồn chi tiết hoặc tài sản cá nhân của người khác nếu không được cấp thêm quyền.

### Người xem báo cáo (`REPORT_VIEWER`)

- Xem/xuất báo cáo trong phạm vi được cấp.
- Không tạo hoặc chuyển trạng thái chứng từ.
- Trường nhạy cảm như giá, thông tin cá nhân chỉ hiển thị khi có quyền trường dữ liệu tương ứng.

## 3. Cấu trúc một quyền hiệu lực

Một quyết định cho phép nên dựa trên đầy đủ các thành phần:

```text
cho phép = có quyền thao tác
         AND thuộc phạm vi bộ phận
         AND thuộc phạm vi kho
         AND có quan hệ hợp lệ với đối tượng dữ liệu
         AND trạng thái hiện tại cho phép
         AND không vi phạm quy tắc cấm
```

### Thao tác

Các thao tác tối thiểu: `create`, `read`, `update_draft`, `submit`, `approve`, `reject`, `cancel`, `reserve`, `issue`, `receive`, `complete`, `adjust`, `export`, `manage`.

### Phạm vi bộ phận

- `SELF`: chỉ bản thân.
- `OWN_DEPARTMENT`: bộ phận chính của người dùng.
- `DEPARTMENT_TREE`: bộ phận và các đơn vị con được quản lý.
- `SELECTED_DEPARTMENTS`: danh sách cụ thể.
- `ALL_DEPARTMENTS`: toàn hệ thống.

### Phạm vi kho

- `NONE`: không có quyền kho.
- `ASSIGNED_WAREHOUSES`: một hoặc nhiều kho được phân công.
- `ALL_WAREHOUSES`: tất cả kho.

### Quan hệ với đối tượng

- Là người tạo.
- Là người yêu cầu/người nhận/người giao/người giữ.
- Là quản lý của bộ phận liên quan.
- Là thủ kho của kho nguồn hoặc kho đích.
- Là người duyệt được phân công.
- Có quyền xem toàn cục hoặc báo cáo.

## 4. Người dùng được xem gì

### Thiết bị

Người sử dụng mặc định được xem:

- Thiết bị mình đang giữ hoặc đang mượn.
- Thiết bị được giao cho mình nhưng đang chờ xác nhận.
- Thông tin cần thiết của thiết bị liên quan đến yêu cầu của mình.
- Lịch sử hành động của chính mình trên thiết bị, nếu chính sách cho phép.

Không mặc định được xem:

- Thiết bị của người khác.
- Tồn chi tiết mọi kho.
- Giá mua, khấu hao, ghi chú nội bộ, audit log quản trị.

IT được xem thiết bị thuộc bộ phận/phạm vi được giao. Thủ kho được xem hàng tại kho được giao và thông tin tối thiểu cần cho giao nhận. Người duyệt được xem dữ liệu cần thiết của chứng từ mình xử lý. Người xem báo cáo chỉ xem dữ liệu trong phạm vi báo cáo được cấp.

### Chứng từ

- Người tạo: xem chứng từ mình tạo và trạng thái xử lý.
- Người giao/nhận: xem chứng từ cần mình hành động và phần dữ liệu liên quan.
- Người duyệt: xem chứng từ nằm trong hàng đợi duyệt/phạm vi của mình.
- IT/thủ kho: xem chứng từ cần chuẩn bị hoặc giao nhận trong phạm vi.
- Quản trị hệ thống: chỉ xem nội dung nghiệp vụ nếu được cấp quyền nghiệp vụ hoặc audit phù hợp.

## 5. Người dùng được tạo yêu cầu gì

| Loại yêu cầu                    | Người sử dụng                | IT               | Thủ kho                   | Người duyệt    |
| ------------------------------- | ---------------------------- | ---------------- | ------------------------- | -------------- |
| Cấp phát cho bản thân           | Có                           | Có               | Theo quyền                | Theo quyền     |
| Cấp phát cho bộ phận/người khác | Khi được ủy quyền            | Có trong phạm vi | Không mặc định            | Theo quyền     |
| Mượn cho bản thân               | Có                           | Có               | Theo quyền                | Theo quyền     |
| Trả thiết bị đang mượn          | Có                           | Có               | Có thể khởi tạo tiếp nhận | Không mặc định |
| Điều chuyển trực tiếp           | Không mặc định               | Có trong phạm vi | Có giữa kho được giao     | Theo quyền     |
| Thu hồi                         | Yêu cầu trả tài sản của mình | Có               | Có trong kho được giao    | Theo quyền     |
| Nhập/điều chỉnh tồn             | Không                        | Khi có quyền kho | Có                        | Không mặc định |
| Báo hỏng                        | Thiết bị mình giữ            | Có               | Khi tiếp nhận             | Không mặc định |

Việc “có thể tạo” không đồng nghĩa với “có thể duyệt”, “có thể giao” hoặc “có thể hoàn tất”.

## 6. Ma trận quyền mức cao

Ký hiệu: `✓` mặc định; `P` chỉ trong phạm vi được cấp; `—` không mặc định; `*` cần quyền riêng/điều kiện.

| Năng lực                  | Quản trị |  IT | Thủ kho | Duyệt | Sử dụng | Xem báo cáo |
| ------------------------- | -------: | --: | ------: | ----: | ------: | ----------: |
| Quản lý tài khoản/vai trò |        ✓ |   — |       — |     — |       — |           — |
| Quản lý danh mục          |        ✓ |   P |       P |     — |       — |           — |
| Xem hồ sơ thiết bị        |        * |   P |       P |     P | Quan hệ |           P |
| Sửa hồ sơ kỹ thuật        |        — |   P |      P* |     — |       — |           — |
| Xem tồn kho               |        * |   P |       P |    P* |       — |           P |
| Tạo yêu cầu cá nhân       |        * |   ✓ |       ✓ |     ✓ |       ✓ |           — |
| Tạo thay người/bộ phận    |        * |   P |      P* |    P* |       * |           — |
| Trình duyệt               |        * |   P |       P |     P | Quan hệ |           — |
| Duyệt/từ chối             |        — |   * |       — |     P |       — |           — |
| Giữ chỗ/chọn hàng         |        — |  P* |       P |     — |       — |           — |
| Giao/xuất kho             |        — |  P* |       P |     — |       — |           — |
| Xác nhận nhận/trả         |        — |   P |       P |     — | Quan hệ |           — |
| Hoàn tất chứng từ         |        — |  P* |       P |     — |       — |           — |
| Điều chỉnh tồn            |        — |   * |      P* |     * |       — |           — |
| Xem audit log             |       P* |  P* |       — |     — |       — |           — |
| Xem/xuất báo cáo          |        * |   P |       P |     P |       — |           P |

Ma trận này là baseline. Quyền cụ thể phải tách nhỏ theo loại chứng từ thay vì dùng một quyền chung quá rộng.

## 7. Phân quyền theo bước quy trình

| Bước              | Người thực hiện hợp lệ                              | Điều kiện chính                          |
| ----------------- | --------------------------------------------------- | ---------------------------------------- |
| Tạo nháp          | Người sử dụng, IT, thủ kho hoặc người được ủy quyền | Đúng loại yêu cầu và phạm vi             |
| Gửi duyệt         | Người tạo/được ủy quyền                             | Dữ liệu bắt buộc đầy đủ                  |
| Duyệt/từ chối     | Người duyệt được phân công                          | Đúng phạm vi, hạn mức, không tự duyệt    |
| Chọn hàng/giữ chỗ | IT hoặc thủ kho                                     | Chứng từ đã duyệt, hàng khả dụng         |
| Giao/xuất         | Thủ kho hoặc IT có quyền kho                        | Đúng kho, không vượt phần duyệt          |
| Nhận              | Người nhận hoặc người được ủy quyền                 | Đúng đối tượng, ghi nhận thực nhận       |
| Hoàn tất          | Thủ kho/IT được phân công                           | Các dòng đã xử lý hoặc đóng phần còn lại |
| Hủy               | Người tạo trước duyệt; người có quyền sau duyệt     | Chưa giao hoặc xử lý phần đã giao riêng  |
| Điều chỉnh        | Người có quyền riêng và người duyệt phù hợp         | Có tham chiếu, lý do và audit log        |

## 8. Ủy quyền và nhiều vai trò

- Vai trò và phạm vi phải có ngày hiệu lực; tài khoản bị khóa mất quyền ngay nhưng lịch sử vẫn giữ nguyên danh tính.
- Ủy quyền duyệt cần người ủy quyền, người nhận, thời hạn, phạm vi và lý do.
- Không cho chuỗi ủy quyền vô hạn; chống tự duyệt vẫn áp dụng cho người được ủy quyền.
- Khi nhiều vai trò xung đột, quy tắc cấm và phạm vi hẹp bắt buộc được ưu tiên hơn quyền cho phép chung.
- Thay đổi vai trò/quyền phải được audit và không làm thay đổi quyền đã ghi nhận tại thời điểm lịch sử.

## 9. Quyền nhạy cảm cần tách riêng

- Xem giá mua/giá trị tài sản.
- Xem hoặc xuất dữ liệu cá nhân.
- Xuất báo cáo hàng loạt.
- Điều chỉnh tồn.
- Cho phép tồn âm hoặc override giữ chỗ, nếu sau này được bật.
- Duyệt ngoại lệ/tự duyệt khẩn cấp.
- Mở lại chứng từ đã đóng.
- Xem audit log.
- Quản lý vai trò và phạm vi của người khác.

## 10. Giả định phân quyền cần xác nhận

1. Quản trị hệ thống có được xem toàn bộ dữ liệu nghiệp vụ hay chỉ cấu hình/tài khoản?
2. IT có quyền kho mặc định hay phải được gán thêm vai trò thủ kho?
3. Người duyệt được phân công theo bộ phận, kho, loại chứng từ, hạn mức hay kết hợp tất cả?
4. Quản lý bộ phận có phải một vai trò riêng hay là phạm vi của `APPROVER`?
5. Người sử dụng có được tạo yêu cầu thay đồng nghiệp trong cùng bộ phận không?
6. Có hỗ trợ trợ lý/ủy quyền tạm thời và duyệt thay không?
7. Người nhận có thể ủy quyền cho người khác nhận thiết bị không?
8. Ai được xem giá mua, chi phí sửa chữa và giá trị còn lại?
9. Người xem báo cáo được xuất file hay chỉ xem trên màn hình?
10. Audit log nghiệp vụ được IT xem hay chỉ quản trị/kiểm soát nội bộ?
11. Khi một người thuộc nhiều bộ phận, phạm vi mặc định lấy hợp hay chỉ bộ phận chính?
12. Có cần quyền giới hạn theo loại/nhóm thiết bị ngoài bộ phận và kho không?
