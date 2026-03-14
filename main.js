const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

if (process.env.NODE_ENV !== "production") {
  require("electron-reload")(__dirname, {
    electron: path.join(__dirname, "node_modules", ".bin", "electron.cmd"),
    forceHardReset: true,
    hardResetMethod: "exit",
  });
}

let mainWindow;
let apiProcess;
let tunnelProcess;

// ── Sidecar processes ─────────────────────────────────────────────────────────

function startTunnel() {
  // Requires key-based SSH auth to work without a password prompt.
  // Run once manually: ssh-copy-id oliverjones@100.82.94.80
  tunnelProcess = spawn("ssh", [
    "-o", "StrictHostKeyChecking=no",
    "-o", "ExitOnForwardFailure=no",
    "-L", "5432:localhost:5432",
    "oliverjones@100.82.94.80", "-N"
  ], { stdio: "pipe" });

  tunnelProcess.on("error", (e) => console.warn("[tunnel] could not start:", e.message));
  tunnelProcess.stderr.on("data", (d) => console.log("[tunnel]", d.toString().trim()));
}

function startAPI() {
  const python = process.platform === "win32" ? "python" : "python3";
  apiProcess = spawn(python, ["-m", "uvicorn", "api:app", "--port", "8765"], {
    cwd: __dirname,
    stdio: "pipe",
  });
  apiProcess.stdout.on("data", (d) => console.log("[api]", d.toString().trim()));
  apiProcess.stderr.on("data", (d) => console.log("[api]", d.toString().trim()));
  apiProcess.on("error", (e) => console.error("[api] failed to start:", e.message));
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "BankSt OS",
    backgroundColor: "#1e1e1e",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile("index.html");

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Intercept key combos before browser default handling
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!input.control) return;

    // Ctrl+W — close active workspace tab
    if (!input.shift && !input.alt && input.key === "w") {
      event.preventDefault();
      mainWindow.webContents.send("tab:close-active");
      return;
    }

    // Ctrl+Tab — next tab
    if (!input.shift && input.key === "Tab") {
      event.preventDefault();
      mainWindow.webContents.send("tab:next");
      return;
    }

    // Ctrl+Shift+Tab — previous tab
    if (input.shift && input.key === "Tab") {
      event.preventDefault();
      mainWindow.webContents.send("tab:prev");
    }
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  startTunnel();
  startAPI();
  createWindow();
});

app.on("window-all-closed", () => {
  apiProcess?.kill();
  tunnelProcess?.kill();
  app.quit();
});
