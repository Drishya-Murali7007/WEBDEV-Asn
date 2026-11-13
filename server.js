require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { randomUUID } = require("crypto");
const { EventEmitter } = require("events");
const store = require("./src/store");

if (!process.env.JWT_SECRET) {
  console.error("Missing JWT_SECRET. Copy .env.example to .env and set a secret.");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const events = new EventEmitter();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";

function createToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function authenticateToken(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "No token provided" });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied: insufficient role" });
    }
    next();
  };
}

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "username, email and password are required" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    const users = store.read("users");
    const normalizedEmail = String(email).trim().toLowerCase();
    if (users.some(u => u.email === normalizedEmail)) {
      return res.status(409).json({ message: "Email already registered" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = {
      id: randomUUID(),
      username: String(username).trim(),
      email: normalizedEmail,
      passwordHash,
      role: users.length === 0 ? "admin" : "user",
      createdAt: new Date().toISOString()
    };
    users.push(user);
    store.write("users", users);
    events.emit("user:registered", { id: user.id, username: user.username });
    return res.status(201).json({
      message: "User registered",
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to register user" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email and password are required" });
  const user = store.read("users").find(u => u.email === String(email).trim().toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  const token = createToken(user);
  return res.json({
    message: "Login successful",
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role }
  });
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/protected", authenticateToken, (req, res) => {
  res.json({ message: "You accessed a protected route", user: req.user });
});

app.get("/api/admin", authenticateToken, allowRoles("admin"), (req, res) => {
  res.json({ message: "Admin-only route", users: store.read("users").map(({ passwordHash, ...u }) => u) });
});

app.get("/api/notes", authenticateToken, (req, res) => {
  const notes = store.read("notes").filter(n => n.owner === req.user.id);
  res.json(notes);
});

app.post("/api/notes", authenticateToken, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ message: "title and content are required" });
  const notes = store.read("notes");
  const note = {
    id: randomUUID(), title: String(title).trim(), content: String(content).trim(),
    owner: req.user.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  notes.push(note);
  store.write("notes", notes);
  events.emit("note:created", { noteId: note.id, owner: req.user.id });
  res.status(201).json(note);
});

app.put("/api/notes/:id", authenticateToken, (req, res) => {
  const notes = store.read("notes");
  const index = notes.findIndex(n => n.id === req.params.id && n.owner === req.user.id);
  if (index === -1) return res.status(404).json({ message: "Note not found" });
  const { title, content } = req.body;
  if (title !== undefined) notes[index].title = String(title).trim();
  if (content !== undefined) notes[index].content = String(content).trim();
  notes[index].updatedAt = new Date().toISOString();
  store.write("notes", notes);
  res.json(notes[index]);
});

app.delete("/api/notes/:id", authenticateToken, (req, res) => {
  const notes = store.read("notes");
  const filtered = notes.filter(n => !(n.id === req.params.id && n.owner === req.user.id));
  if (filtered.length === notes.length) return res.status(404).json({ message: "Note not found" });
  store.write("notes", filtered);
  events.emit("note:deleted", { noteId: req.params.id, owner: req.user.id });
  res.json({ message: "Note deleted" });
});

// EventEmitter listeners demonstrate event-driven server-side actions.
events.on("user:registered", data => console.log("[event] New user registered:", data.username));
events.on("note:created", data => console.log("[event] Note created:", data.noteId));
events.on("note:deleted", data => console.log("[event] Note deleted:", data.noteId));

// Socket.IO authenticates each connection with a JWT.
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication token required"));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
});

io.on("connection", socket => {
  console.log(`[socket] ${socket.user.username} connected`);
  socket.on("join-room", room => {
    const safeRoom = String(room || "general").trim().slice(0, 40) || "general";
    socket.join(safeRoom);
    socket.emit("system-message", `You joined #${safeRoom}`);
  });
  socket.on("chat-message", payload => {
    const room = String(payload?.room || "general").trim().slice(0, 40) || "general";
    const message = String(payload?.message || "").trim().slice(0, 500);
    if (!message) return;
    const chat = {
      id: randomUUID(),
      username: socket.user.username,
      message,
      room,
      sentAt: new Date().toISOString()
    };
    io.to(room).emit("chat-message", chat);
    console.log(`[chat:${room}] ${chat.username}: ${chat.message}`);
  });
  socket.on("disconnect", () => console.log(`[socket] ${socket.user.username} disconnected`));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

server.listen(PORT, () => console.log(`Secure Connect server running at http://localhost:${PORT}`));
