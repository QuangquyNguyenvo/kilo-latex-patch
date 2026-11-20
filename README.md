<p align="center"><img src="assets/header.svg" alt="kilo-latex-patch" width="100%"></p>

Giúp chat của **Kilo Desktop** (Windows) hiển thị được công thức LaTeX, dùng tạm cho tới khi Kilo sửa [#70](https://github.com/Kilo-Org/kilo-desktop/issues/70). Mở PowerShell rồi dán lệnh bên dưới. Mỗi lần Kilo tự cập nhật thì chạy lại.

**Cài**

```powershell
irm https://raw.githubusercontent.com/QuangquyNguyenvo/kilo-latex-patch/main/install.ps1 | iex
```

**Gỡ**

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/QuangquyNguyenvo/kilo-latex-patch/main/install.ps1))) restore
```

<details><summary>Cách hoạt động</summary>

Tool chèn `remark-math` và `rehype-katex` vào bộ hiển thị markdown của Kilo. Hỗ trợ `$$…$$`, `\[…\]`, `\(…\)` và `$…$`.
File vá được ghi thêm vào cuối `app.asar`, sau đó tool cập nhật mã kiểm tra toàn vẹn trong `kilo-desktop.exe`. Việc này làm chữ ký số của exe không còn hợp lệ, nhưng app vẫn chạy bình thường khi Smart App Control tắt. Lệnh gỡ trả file về giống hệt bản gốc. Cần Node.js 18 trở lên; nếu máy chưa có, script sẽ hỏi rồi cài giúp.

</details>

<p align="center"><img src="assets/footer.svg" alt="unofficial · MIT · not affiliated with Kilo" width="100%"></p>
