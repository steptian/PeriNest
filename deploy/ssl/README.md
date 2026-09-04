# SSL 证书目录

放置证书文件（不入库，已在 .gitignore 排除）：

- `api.yourdomain.com.pem` / `api.yourdomain.com.key`
- `admin.yourdomain.com.pem` / `admin.yourdomain.com.key`

签发建议：Let's Encrypt（`certbot --nginx -d api.yourdomain.com`）。
