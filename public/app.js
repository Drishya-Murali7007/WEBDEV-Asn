const $ = id => document.getElementById(id);
let mode = "login";
let token = localStorage.getItem("secureConnectToken");
let currentUser = null;
let socket = null;
let currentRoom = "general";

document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => {
  mode = button.dataset.mode;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === button));
  $("username-wrap").classList.toggle("hidden", mode !== "signup");
  $("auth-submit").textContent = mode === "signup" ? "Create account" : "Login";
  $("auth-message").textContent = "";
}));

async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

$("auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const body = { email: $("email").value, password: $("password").value };
    if (mode === "signup") body.username = $("username").value;
    const data = await api(`/api/auth/${mode === "signup" ? "signup" : "login"}`, {
      method: "POST", body: JSON.stringify(body)
    });
    if (mode === "signup") {
      $("auth-message").textContent = "Account created. You can now log in.";
      document.querySelector('[data-mode="login"]').click();
    } else {
      token = data.token;
      currentUser = data.user;
      localStorage.setItem("secureConnectToken", token);
      showApp();
    }
  } catch (error) { $("auth-message").textContent = error.message; }
});

function showApp() {
  $("auth-panel").classList.add("hidden");
  $("app-panel").classList.remove("hidden");
  $("status").textContent = "Authenticated";
  $("welcome").textContent = `Welcome, ${currentUser.username}`;
  $("role").textContent = `Role: ${currentUser.role}`;
  loadNotes();
  connectChat();
}

async function loadNotes() {
  try {
    const notes = await api("/api/notes");
    $("notes").innerHTML = "";
    notes.forEach(note => {
      const article = document.createElement("article");
      article.className = "note";
      const title = document.createElement("h3");
      const content = document.createElement("p");
      title.textContent = note.title;
      content.textContent = note.content;
      const actions = document.createElement("div");
      actions.className = "note-actions";
      const edit = document.createElement("button");
      edit.className = "secondary"; edit.textContent = "Edit";
      edit.onclick = async () => {
        const nextTitle = prompt("Update title:", note.title);
        if (nextTitle === null) return;
        const nextContent = prompt("Update content:", note.content);
        if (nextContent === null) return;
        try { await api(`/api/notes/${note.id}`, { method: "PUT", body: JSON.stringify({ title: nextTitle, content: nextContent }) }); loadNotes(); }
        catch (e) { $("note-message").textContent = e.message; }
      };
      const remove = document.createElement("button");
      remove.className = "danger"; remove.textContent = "Delete";
      remove.onclick = async () => {
        if (!confirm("Delete this note?")) return;
        try { await api(`/api/notes/${note.id}`, { method: "DELETE" }); loadNotes(); }
        catch (e) { $("note-message").textContent = e.message; }
      };
      actions.append(edit, remove); article.append(title, content, actions); $("notes").append(article);
    });
    if (!notes.length) $("notes").textContent = "No notes yet. Add your first note above.";
  } catch (error) { $("note-message").textContent = error.message; }
}

$("note-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await api("/api/notes", { method: "POST", body: JSON.stringify({ title: $("note-title").value, content: $("note-content").value }) });
    $("note-form").reset(); $("note-message").textContent = "Note saved."; loadNotes();
  } catch (error) { $("note-message").textContent = error.message; }
});

function connectChat() {
  if (socket) socket.disconnect();
  socket = io({ auth: { token } });
  socket.on("connect", () => { socket.emit("join-room", currentRoom); $("chat-message").textContent = "Connected to chat."; });
  socket.on("connect_error", error => $("chat-message").textContent = error.message);
  socket.on("system-message", message => addChatLine("System", message));
  socket.on("chat-message", data => addChatLine(data.username, data.message));
}
function addChatLine(username, message) {
  const line = document.createElement("div"); line.className = "chat-line";
  const name = document.createElement("b"); name.textContent = `${username}: `;
  const body = document.createElement("span"); body.textContent = message;
  line.append(name, body); $("chat-log").append(line); $("chat-log").scrollTop = $("chat-log").scrollHeight;
}
$("join").addEventListener("click", () => {
  currentRoom = $("room").value.trim() || "general";
  if (socket?.connected) socket.emit("join-room", currentRoom);
  $("chat-log").innerHTML = "";
});
$("chat-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!socket?.connected) return $("chat-message").textContent = "Chat is not connected.";
  socket.emit("chat-message", { room: currentRoom, message: $("chat-input").value });
  $("chat-input").value = "";
});
$("logout").addEventListener("click", () => {
  if (socket) socket.disconnect();
  localStorage.removeItem("secureConnectToken"); token = null; currentUser = null;
  $("app-panel").classList.add("hidden"); $("auth-panel").classList.remove("hidden");
  $("status").textContent = "Not signed in"; $("auth-form").reset();
});

async function restoreSession() {
  if (!token) return;
  try {
    const data = await api("/api/auth/me");
    currentUser = data.user; showApp();
  } catch {
    localStorage.removeItem("secureConnectToken"); token = null;
  }
}
restoreSession();
