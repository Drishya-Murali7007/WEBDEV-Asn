# Secure Connect and Communication Platform — Lab 4

A Node.js + Express application implementing signup/login, bcrypt password hashing, JWT authentication, protected routes, role-based access control, private Notes CRUD, Socket.IO chat, and Node.js EventEmitter events.

## Requirements
- Node.js 18 or later
- npm

## Setup (Windows PowerShell / macOS / Linux)

1. Extract the ZIP and open this folder in VS Code.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create your environment file:

   **Windows PowerShell**
   ```powershell
   Copy-Item .env.example .env
   ```

   **macOS/Linux**
   ```bash
   cp .env.example .env
   ```

4. Open `.env` and replace `JWT_SECRET` with a long random secret.
5. Start the server:

   ```bash
   npm start
   ```

6. Open http://localhost:5000 in your browser.

## First run
The first account registered is assigned the `admin` role. All subsequent accounts receive the `user` role. This is for demonstrating RBAC in the lab; a production system should use an explicit, securely controlled admin-provisioning process.

Data is stored in `data/users.json` and `data/notes.json`. These files are created automatically when needed. Do not commit real user data or `.env` to Git.

## API reference

All request bodies use JSON.

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | No | Register |
| POST | `/api/auth/login` | No | Login and receive JWT |
| GET | `/api/auth/me` | Bearer token | Current user |
| GET | `/api/protected` | Bearer token | Protected example |
| GET | `/api/admin` | Admin JWT | Admin-only route |
| GET | `/api/notes` | Bearer token | List own notes |
| POST | `/api/notes` | Bearer token | Create note |
| PUT | `/api/notes/:id` | Bearer token | Update own note |
| DELETE | `/api/notes/:id` | Bearer token | Delete own note |

### Example signup
`POST http://localhost:5000/api/auth/signup`

```json
{
  "username": "victor",
  "email": "victor@example.com",
  "password": "123456"
}
```

### Example login
`POST http://localhost:5000/api/auth/login`

```json
{
  "email": "victor@example.com",
  "password": "123456"
}
```

Copy the returned `token`. For protected endpoints, set this header:

```text
Authorization: Bearer YOUR_JWT_TOKEN
```

### Create a note
`POST http://localhost:5000/api/notes`

```json
{
  "title": "My First Note",
  "content": "This is my first note for Web Dev III."
}
```

### Socket.IO chat
1. Sign in through the web page.
2. Enter a room name (default: `general`) and select **Join room**.
3. Open another browser/incognito window and register/log in with a second account.
4. Join the same room and send messages.

Socket.IO connections are authenticated using the JWT token. Chat messages are broadcast to clients in the selected room.

## Demonstrating the lab requirements
- **bcrypt:** passwords are hashed with `bcrypt.hash()` and checked with `bcrypt.compare()`.
- **JWT:** `jsonwebtoken` signs tokens at login and verifies them in middleware.
- **Protected routes:** `/api/protected` and all Notes routes require a Bearer token.
- **RBAC:** `/api/admin` requires the `admin` role.
- **Notes CRUD:** create, read, update, and delete endpoints operate only on the authenticated user's notes.
- **Socket.IO:** authenticated clients join rooms and exchange real-time messages.
- **EventEmitter:** registration and note create/delete events are logged in the server console.
- **dotenv:** configuration is read from `.env`.

## Notes
- The assignment permits MongoDB or another preferred persistence option. This implementation uses local JSON files to keep setup simple and avoid an extra database service.
- JSON-file storage is suitable for a classroom demonstration, not concurrent production workloads.
- Do not expose `.env`, JWT secrets, or stored password hashes.
