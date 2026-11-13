const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function filePath(name) {
  return path.join(dataDir, `${name}.json`);
}

function read(name) {
  const file = filePath(name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]", "utf8");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function write(name, data) {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf8");
}

module.exports = { read, write };
