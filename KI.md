# Report Editor — Kiến Trúc, Quy Chuẩn Cấu Trúc JSON & Tài Liệu Phát Triển

Tài liệu này chứa toàn bộ các kiến thức cốt lõi, sơ đồ kiến trúc, định dạng dữ liệu và kinh nghiệm thực chiến dùng để xây dựng, phát triển và bảo trì hệ thống **Report Editor** (Trình biên tập báo cáo trực quan dựa trên canvas kết hợp engine pdfMake).

---

## 1. Tổng Quan Hệ Thống

Hệ thống **Report Editor** là một giải pháp thiết kế biểu mẫu báo cáo kéo thả WYSIWYG trực quan (Visual Report Designer) trên trình duyệt, kết hợp với bộ phát sinh PDF mạnh mẽ (PDF Generator) hoạt động hoàn toàn ở phía client/server không phụ thuộc môi trường DOM.

### 1.1 Điểm Nổi Bật của Kiến Trúc Mới
* **Visual Canvas**: Kéo thả, co giãn (resize) linh hoạt các đối tượng trên màn hình lưới tọa độ.
* **Layout Grid & Snapping**: Tự động hút dính phần tử theo lề trang (Margin Snapping) và hút dính mép ngoài khi các phần tử kề nhau (Adjacent Snapping).
* **Live Preview Song Song**: Xem trực tiếp file PDF kết xuất cạnh bên bằng iframe với bộ đệm kép (Double-Buffering) chống chớp nháy màn hình và cơ chế Debounce 450ms tối ưu tài nguyên.
* **JSON Inspector**: Soạn thảo trực tiếp mã JSON và cập nhật Canvas tức thì.
* **Tự do hóa Đồ họa (Unconstrained Shapes)**: Các hình nền (Shape, Rect, Line) được tách khỏi luồng tự động đẩy hàng (auto-push) và được vẽ đè lên nhau hoàn hảo (`isOverlayingShape`).
* **Độc Lập Môi Trường (pdfGenerator.js)**: Module tạo PDF có thể chạy độc lập trong môi trường Vue/React/NodeJS mà không cần DOM canvas.

---

## 2. Cấu Trúc Dự Án Hiện Tại

```
ReportEditor
├── editor-pdfmake.html      # Giao diện chính của Trình biên tập (HTML5)
├── editor-pdfmake.css       # Định dạng giao diện (Dark Mode Catppuccin, Canvas layout, Resizer)
├── editor-pdfmake.js        # Logic điều khiển Canvas, sự kiện chuột/bàn phím, undo/redo, preview
├── pdfGenerator.js          # Module sinh định nghĩa tài liệu pdfMake từ cấu trúc JSON
├── pdfGenerator.bundle.js   # Bundle nén hoàn chỉnh chứa esbuild-bundled pdfMake và font Roboto offline (~4.4MB)
├── ToaThuocV2.json          # File cấu trúc mẫu thiết kế hiện tại (được dịch sang Tiếng Anh)
├── ToaThuoc.json            # Bản sao lưu cấu trúc mẫu thiết kế cũ
├── demo-pdfmake.html        # Ví dụ chạy thử (demo page) tải pdfGenerator và kết xuất thử PDF
└── KI.md                    # Tài liệu hướng dẫn phát triển và nhật ký cập nhật (chính là file này)
```

### Chi Tiết Thành Phần:
1. **[editor-pdfmake.html](file:///d:/Source/ReportEditor/editor-pdfmake.html)**: Cấu trúc vùng Canvas thiết kế bên trái, vùng Live PDF Preview bên phải và Sidebar thuộc tính.
2. **[editor-pdfmake.css](file:///d:/Source/ReportEditor/editor-pdfmake.css)**: Định nghĩa các CSS class, bảng màu tối (dark theme), scrollbar đồng bộ và thanh kéo giãn Preview (Resizer bar).
3. **[editor-pdfmake.js](file:///d:/Source/ReportEditor/editor-pdfmake.js)**:
   - Quản lý trạng thái (`elements`, `selectedIds`, `undoStack`, `pageConfig`).
   - Xử lý phím tắt: Nhấn `ArrowKeys` để di chuyển nhiều phần tử (ngăn dịch chuyển đúp khi chọn Panel cha), nhấn `Backspace`/`Delete` để xóa phần tử (bỏ qua khi đang gõ text properties).
   - Tích hợp modal JSON Inspector chỉnh sửa thô trực tiếp.
4. **[pdfGenerator.bundle.js](file:///d:/Source/ReportEditor/pdfGenerator.bundle.js)**: Đã đóng gói sẵn `pdfmake` (v0.2.10) và font Roboto (hỗ trợ Tiếng Việt), cho phép chạy hoàn toàn offline.

---

## 3. Cấu Trúc Report JSON Schema

Mẫu thiết kế lưu trữ dưới dạng JSON có cấu trúc tối giản gồm mảng phần tử và cấu hình trang.

### 3.1 Cấu Trúc Khung JSON
```json
{
  "elements": [
    {
      "id": 1,
      "x": 20,
      "y": 49,
      "parentId": null,
      "type": "text",
      "text": "Tên đơn vị:",
      "fontSize": 13,
      "bold": false,
      "italic": false,
      "align": "left",
      "color": "#000000",
      "width": 67,
      "wrap": false,
      "showFx": "",
      "useShowFx": false,
      "isColorFx": false,
      "colorFx": ""
    }
  ]
}
```

### 3.2 Các Thuộc Tính Chung của Phần Tử (Common Properties)
* `id` (Number): ID định danh duy nhất của phần tử.
* `x` (Number): Vị trí tuyệt đối X (pixel) so với lề trái vùng in (hoặc so với Panel cha nếu có `parentId`).
* `y` (Number): Vị trí tuyệt đối Y (pixel) so với lề trên (hoặc so với Panel cha nếu có `parentId`).
* `parentId` (Number | null): ID của Panel cha chứa phần tử này. Dùng để kéo di chuyển Panel thì cả nhóm di chuyển theo.
* `type` (String): Loại phần tử (`text`, `var`, `shape`, `line`, `rect`, `table`, `image`, `panel`, `pagebreak`, `emptyline`).
* `showFx` (String): Biểu thức JavaScript điều kiện hiển thị phần tử (ẩn/hiển động).
* `useShowFx` (Boolean): Có kích hoạt biểu thức hiển thị hay không.
* `isColorFx` / `colorFx`: Biểu thức màu sắc động.

### 3.3 Chi Tiết Các Loại Phần Tử (Element Types)

#### A. Text (`type: "text"`)
* `text` (String): Chuỗi văn bản hiển thị tĩnh.
* `fontSize` (Number): Kích thước chữ (px).
* `bold` / `italic` (Boolean): Định dạng in đậm / in nghiêng.
* `align` (String): Căn lề chữ (`"left"`, `"center"`, `"right"`).
* `color` (String): Mã màu Hex (ví dụ: `"#000000"`).
* `width` (Number | String): Độ rộng phần tử (px hoặc phần trăm `"100%"`).
* `wrap` (Boolean): Cho phép tự động ngắt dòng khi tràn độ rộng (`true` - ngắt dòng, `false` - viết trên một dòng duy nhất).
* `isFx` (Boolean): Có dùng biểu thức dynamic không.
* `fxExpr` (String): Biểu thức JavaScript trả về chuỗi text động (ví dụ: `return $data.patient_name.toUpperCase();`).

#### B. Variable (`type: "var"`)
* `varName` (String): Tên trường dữ liệu (ví dụ: `patient_name`, `clinic_phone`) để ánh xạ dữ liệu động từ API.
* Các thuộc tính định dạng tương tự phần tử `text`.
* `prefix` (String): Tiền tố đứng trước giá trị biến (ví dụ: `"SĐT: "`).

#### C. Shape (`type: "shape"`)
* `shapeType` (String): Loại hình học vẽ (`"rect"`, `"line"`, `"ellipse"`, `"polygon"`).
* `width` / `height` (Number): Kích thước hình vẽ.
* `lineWidth` (Number): Độ dày đường viền.
* `color` (String): Màu đường viền.
* `fillColor` (String): Màu tô đặc bên trong (nếu trống sẽ trong suốt).
* `radius` (Number): Độ bo góc (chỉ dùng cho `shapeType: "rect"`).
* `points` (String): Chuỗi tọa độ đỉnh đa giác (ví dụ: `"0,50 50,0 100,50"`).
* `close` (Boolean): Tự đóng kín đa giác.
* `sides` (Number): Số lượng góc/cạnh khi chọn vẽ đa giác đều (ví dụ: tam giác = 3, ngũ giác = 5).

#### D. Table (`type: "table"`)
* `cols` / `rows` (Number): Số cột và số dòng tiêu chuẩn.
* `headers` (Array): Mảng các nhãn tiêu đề cột.
* `dataVar` (String): Tên mảng dữ liệu lặp động (ví dụ: `"medications"`).
* `fieldMappings` (String): Các cột tương ứng dữ liệu, phân tách bằng dấu phẩy hoặc `||` (ví dụ: `no, name, quantity`).
* **Cấu hình chi tiết cột (Gom trong popup Columns Editor modal)**:
  - `widths` (String): Độ rộng các cột phân tách bằng dấu phẩy (ví dụ: `"*,150,*"`).
  - `headerBolds` (String): Trạng thái in đậm tiêu đề mỗi cột (`"true,false,true"`).
  - `headerAligns` (String): Căn lề tiêu đề mỗi cột (`"center,left,right"`).
  - `bodyAligns` (String): Căn lề nội dung cột tương ứng (`"left,center,right"`).
  - `colFills` (String): Màu nền riêng từng cột (`"#eee,,#fff"`).
  - `colColors` (String): Màu chữ riêng từng cột (`"#ff0000,,#0000ff"`).
* `showBorder` (Boolean): Có hiển thị viền lưới bảng không.
* `borderWidth` / `borderColor` (Number/String): Độ dày và màu viền bảng.
* `oddRowFill` / `evenRowFill` (String): Màu nền xen kẽ hàng lẻ và hàng chẵn.

#### E. Panel (`type: "panel"`)
* `width` / `height` (Number): Kích thước của khung bao Panel.
* `bgColor` / `borderColor` / `borderWidth`: Màu nền, màu viền, độ dày viền của Panel.
* Panel chứa các phần tử con qua việc gán `parentId` của các phần tử con trỏ về ID của Panel.

#### F. Page Break & Empty Line (`type: "pagebreak"`, `"emptyline"`)
* `pagebreak`: Tạo chỉ thị ngắt trang cứng tại tọa độ Y.
* `emptyline`: Tạo khoảng trống tĩnh với độ cao `height`.

---

## 4. Logic Canvas, Kéo Thả & Snapping (editor-pdfmake.js)

### 4.1 Hệ Thống Quan Hệ Cha - Con (Parent-Child Bindings)
* Khi kéo một phần tử và thả vào bên trong phạm vi của một **Panel**, hệ thống tự động gán `parentId` của phần tử đó là ID của Panel.
* Trên Sidebar Outline, phần tử con sẽ được thụt đầu dòng nằm ngay dưới Panel cha.
* Khi di chuyển Panel cha, toàn bộ phần tử con sẽ di chuyển theo một khoảng cách tương ứng ($\Delta x$, $\Delta y$).
* Để tránh lỗi di chuyển đúp (Double-Move) khi dùng phím ArrowKeys, hệ thống chỉ di chuyển Panel cha và bỏ qua việc cập nhật tọa độ độc lập của phần tử con nếu phần tử con cũng nằm trong danh sách chọn.

### 4.2 Multi-page Canvas & Hút lề trang
* Canvas tự động tính toán tổng số trang dựa trên tọa độ lớn nhất của các phần tử và tự động kéo dài chiều cao nền giấy. Vẽ đường đứt nét biểu thị ngắt trang kèm nhãn `"Page 2"`, `"Page 3"`...
* **Margin Snapping**: Tự động hút dính phần tử khi kéo sát các lề giấy (`marginLeft`, `marginRight`...) và các đường ngắt trang. Xuất hiện đường gióng đỏ hỗ trợ thị giác.
* **Adjacent Snapping**: Tự động hút sát mép ngoài của hai phần tử kề nhau (cạnh phải chạm cạnh trái, cạnh dưới chạm cạnh trên) hỗ trợ việc xếp nối đuôi thẳng hàng khít sát mà không cần căn tọa độ bằng tay.

---

## 5. Logic Tạo Bố Cục và Render PDF (pdfGenerator.js)

`pdfGenerator.js` chịu trách nhiệm chuyển đổi mảng các phần tử phẳng trên Canvas thành tài liệu lồng cấu trúc hàng/cột của **pdfMake**. Các thuật toán cốt lõi bao gồm:

### 5.1 Thuật Toán Gom Dòng Ngang (Horizontal Row Grouping)
Để xuất ra PDF chuẩn, hệ thống quét các phần tử và gom nhóm chúng thành các dòng dựa trên tọa độ Y:
* Hai phần tử được xem là nằm trên cùng một dòng nếu chênh lệch Y nhỏ hơn hoặc bằng 5px (Threshold).
* **Tối Ưu 50% Overlap Ratio**: Hệ thống chỉ gộp nhóm ngang nếu hai phần tử giao thoa ngang thực sự (ví dụ: các nhãn liên tiếp "Age: 35" và "Gender: Male"). Hàm `horizontalOverlap` tính diện tích giao diện trên X:
  $$\text{intersection} = \min(x_1 + w_1, x_2 + w_2) - \max(x_1, x_2)$$
  Nếu tỉ lệ $\frac{\text{intersection}}{\min(w_1, w_2)} > 0.5$ (lớn hơn 50%), hệ thống sẽ coi là giao thoa ngang. Điều này giúp các ô vuông checkbox và dấu tích "x" đè lên nhau không bị gộp chung vào cột hàng ngang mà vẫn vẽ đè lên nhau chính xác.

### 5.2 Loại Bỏ Ràng Buộc Đồ Họa (Unconstrained Shapes)
* Các đối tượng vẽ hình nền (`type: "shape"`, `rect`, `line`) được bỏ qua hoàn toàn khỏi cơ chế tự động đẩy hàng (`auto-push` trên Canvas) và cơ chế dồn dòng dọc trong PDF generator (thông qua hàm kiểm tra `isOverlayingShape`).
* Nhờ vậy, hình vẽ, khung bo hoặc ô checkbox không đẩy văn bản khác xuống và ngược lại. Chúng hoạt động như các layer nền tĩnh để văn bản đè lên tự do.

### 5.3 Giới Hạn Chiều Rộng Cột Tránh Méo Chữ (Column Width Clamping)
* Để loại bỏ triệt để lỗi ép méo chữ dọc của pdfMake khi tổng độ rộng của dòng vượt quá chiều rộng khổ giấy, hệ thống tự động giới hạn độ rộng cột:
  $$\text{maxAllowedW} = \text{pageWidth} - \text{marginRight} - x$$
  $$\text{width} = \min(\text{width}, \text{maxAllowedW})$$
* Điều này giúp văn bản luôn hiển thị đúng hướng, không bao giờ bị nén thành một cột dọc ký tự.

---

## 6. Cơ Chế Live Preview Double-Buffering (Tránh Nhấp Nháy)

Live Preview song song được tối ưu hóa để mang lại trải nghiệm xem trước mượt mà nhất có thể:
1. **Debounce 450ms**: Trì hoãn việc phát sinh Blob URL và render PDF khi người dùng đang nhập liệu hoặc kéo thả phần tử liên tục để tránh quá tải trình duyệt.
2. **Double-Buffering (Hai Frame Phản Hồi)**:
   - Sử dụng hai iframe xem trước đặt ẩn/hiện hoán đổi thông qua thuộc tính `opacity` và `z-index`.
   - Blob URL của tài liệu PDF mới được nạp vào iframe ẩn chạy ngầm.
   - Khi iframe ẩn kích hoạt sự kiện `onload` (hoặc sau thời gian chờ an toàn 150ms), nó sẽ được hoán đổi hiển thị lên trên một cách mượt mà và giải phóng Blob URL cũ (`URL.revokeObjectURL`) tránh rò rỉ bộ nhớ.
3. **Resizer Pointer Lock**: Trong lúc người dùng kéo giãn Sidebar hay Preview Panel, pointer-events của iframe bị khóa (`pointer-events: none`) để chuột không bị "mất tiêu điểm" khi lướt qua frame xem trước PDF.

---

## 7. Quy Trình Phát Triển & Bảo Trì Code (Quy Tắc Vàng)

> [!IMPORTANT]
> 1. **Kiểm Tra Cú Pháp JS**: Trước khi bàn giao hay đóng gói bundle, luôn luôn kiểm tra lỗi cú pháp bằng cách chạy lệnh:
>    `node -c editor-pdfmake.js` hoặc `node -c pdfGenerator.js`
> 2. **Đóng Gói Offline**: Khi có bất kỳ thay đổi nào trong logic của `pdfGenerator.js`, bắt buộc phải build lại file bundle bằng lệnh:
>    `npx esbuild pdfGenerator.js --bundle --minify --outfile=pdfGenerator.bundle.js --format=esm --external:fs --external:path`
> 3. **Bảo toàn Giao Diện Anh Hóa (Full English UI)**: Toàn bộ nhãn thuộc tính, thông báo lỗi Fx (`Fx Error:`), nhãn nút bấm của Editor đều sử dụng ngôn ngữ Tiếng Anh tiêu chuẩn để đảm bảo sự đồng bộ toàn cầu.
> 4. **Tránh Placeholder**: Sử dụng ảnh Base64 hợp lệ hoặc SVG khi vẽ giao diện mẫu, tuyệt đối không chừa các link ảnh trống dễ gây lỗi runtime.

Tài liệu này được cập nhật vào ngày **29/05/2026**. Vui lòng tuân thủ nghiêm ngặt các quy định và sơ đồ logic trên để phát triển tính năng mới một cách ổn định nhất.
