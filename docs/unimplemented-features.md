# Features Explicitly Not Implemented

This document records features that are intentionally omitted from the project. Their absence is by design and pull requests adding these features will be rejected.

## Two-Factor Authentication (2FA)

- We rely on Firebase Authentication for sign‑in.
- Only email link authentication is used for testing purposes.
- No additional verification steps such as SMS or authenticator apps are planned.

- Email/password authentication. The application uses SSO only and does not provide its own credential login.
- Password reset feature. Since no password-based login is offered, password reset is unnecessary.

## Advanced Search Limitations

- ページをまたいだ検索機能は提供していません。検索は表示中のページ内のみ対象としています。
