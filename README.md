# PratibhaKhoj Standalone Backend

Standalone Node.js + Express + MongoDB backend for the Vikalpa student registration portal.

## Database

Database name:

`pratibhakhojVikalpa`

The backend does not import or depend on the ERP backend.

## Collections

The application intentionally uses these collection names:

- `users`
- `roles`
- `districts`
- `blocks`
- `schools`
- `students`
- `userregionaccesses`

No `examination*` collection names are created by this backend.

## Seed behavior

Every startup:

1. Roles are upserted.
2. `users` is checked for `userId: admin`.
3. If `admin` exists, no duplicate admin is created.
4. If it does not exist, the admin is created.
5. Only one dummy district, two dummy blocks and three dummy schools are seeded.
6. No ERP district/block/school data is imported.

Default admin:

- User ID: `admin`
- Password: `vikalpa@123`
- Contact: `9999999999`

Change these through `.env` before production.

## API

Base URL:

`http://localhost:8100/api/v1`

- `/health`
- `/auth`
- `/regions`
- `/schools`
- `/students`

## Student registration

Supported public registration types:

- `MB` → Mission Buniyaad → class 8
- `HS100` → Haryana Super 100 → class 10

The public flow starts with SRN lookup. Existing registrations open the acknowledgement page; pending registrations can be edited.

Student uploads are handled with Multer:

- student image: JPG/PNG/WEBP
- previous annual result: JPG/PNG/WEBP/PDF
- maximum 5 MB per file

Files are stored below `public/uploads/students`.

## Development

Copy `.env.example` to `.env`, configure MongoDB and secrets, then:

```bash
npm install
npm run dev
```


## Student file uploads

Student image and previous class result uploads use Multer `memoryStorage()` and DigitalOcean Spaces/S3-compatible object storage.

Required environment variables:
- `SPACES_REGION`
- `SPACES_ENDPOINT`
- `SPACES_BUCKET`
- `SPACES_ACCESS_KEY`
- `SPACES_SECRET_KEY`

Multipart field names:
- `studentImage`
- `previousClassResult`

Student schema stores `studentImage` metadata and `previousClassResult`
