# kilo-latex-patch

Bản vá **không chính thức** giúp chat của **Kilo Desktop** (Windows) hiển thị công thức LaTeX bằng KaTeX.
Dùng tạm cho tới khi Kilo sửa [Kilo-Org/kilo-desktop#70](https://github.com/Kilo-Org/kilo-desktop/issues/70).

*Unofficial local patch that adds LaTeX math rendering to the Kilo Desktop chat on Windows.*

## Cài nhanh

Mở **PowerShell** rồi dán lệnh sau:

```powershell
irm https://raw.githubusercontent.com/QuangquyNguyenvo/kilo-latex-patch/main/install.ps1 | iex
```

Script sẽ:

1. Kiểm tra Node.js. Nếu máy chưa có, script hỏi bạn có muốn cài bằng `winget` không.
2. Nếu Kilo đang mở, hỏi bạn rồi mới đóng app.
3. Vá Kilo, sau đó mở lại app.

**Mỗi lần Kilo tự cập nhật lên bản mới, chạy lại lệnh trên**, vì bản cập nhật cài vào một thư mục mới chưa có bản vá.

Nếu máy đã có Node.js, cũng có thể chạy trực tiếp (nhớ thoát Kilo trước):

```powershell
npx kilo-latex-patch
```

## Gỡ vá / xem trạng thái

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/QuangquyNguyenvo/kilo-latex-patch/main/install.ps1))) restore
```

```powershell
npx kilo-latex-patch status
```

`restore` trả file của Kilo về giống bản gốc từng byte.

## Hỗ trợ những gì

- `$$...$$` và `\[...\]`: công thức nằm riêng một dòng.
- `\(...\)` và `$...$`: công thức nằm trong câu. `$...$` dùng luật của pandoc, nên câu như "giá $5 đến $10" vẫn giữ dạng chữ.
- Code block và inline code không bị đụng tới.
- Đã thử với Kilo Desktop 1.0.0 trên Windows. Nếu bản Kilo mới thay đổi code, tool sẽ báo lỗi và **không sửa gì cả**.

## Cách hoạt động

- Kilo dùng `react-markdown` để hiển thị markdown. Tool chèn thêm `remark-math` và `rehype-katex` vào chỗ Kilo dựng bộ xử lý markdown, và đổi các ký hiệu `\(` `\[` `$` sang dạng plugin đọc được trước khi xử lý.
- File vá và KaTeX (JS, CSS, font) được **ghi thêm vào cuối** `resources/app.asar`, phần dữ liệu cũ giữ nguyên.
- Kilo có bật cơ chế tự kiểm tra xem `app.asar` có bị sửa không (Electron fuse `EnableEmbeddedAsarIntegrityValidation`). Tool tính lại mã hash rồi ghi đè đúng 64 ký tự hash nằm trong `kilo-desktop.exe`. Việc này làm chữ ký số của exe không còn hợp lệ. Windows vẫn chạy app bình thường, trừ khi máy bật Smart App Control.
- Thông tin để gỡ vá được lưu ở `resources/kilo-latex-patch/`.

## Phát triển

```powershell
npm install
npm run build   # bundle dist/kilo-math
npm test        # thử render các mẫu câu trả lời
```

## License

MIT. Gói này có kèm [KaTeX](https://github.com/KaTeX/KaTeX), `remark-math` và `rehype-katex` (đều dùng giấy phép MIT).
Đây là dự án độc lập, không liên quan tới Kilo hay Anaconda.
