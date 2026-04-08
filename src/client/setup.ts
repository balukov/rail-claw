declare const Terminal: new (opts: Record<string, unknown>) => {
  open(el: HTMLElement): void;
  loadAddon(addon: unknown): void;
  clear(): void;
  write(data: string): void;
  writeln(data: string): void;
  onData(cb: (data: string) => void): void;
  onResize(cb: (size: { cols: number; rows: number }) => void): void;
};

declare const FitAddon: {
  FitAddon: new () => {
    fit(): void;
    proposeDimensions(): { cols: number; rows: number } | undefined;
  };
};

const $ = (id: string) => document.getElementById(id)!;

let currentStep = 0;
let isConfigured = false;
let term: InstanceType<typeof Terminal> | null = null;
let ws: WebSocket | null = null;
let fitAddon: ReturnType<typeof FitAddon.FitAddon.prototype.constructor> | null = null;

// --- HTTP ---

async function httpJson<T = Record<string, unknown>>(
  url: string,
  opts?: RequestInit,
): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...opts });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// --- Wizard ---

function goToStep(n: number): void {
  currentStep = n;
  document.querySelectorAll(".wizard-card").forEach((el) => {
    el.classList.remove("active");
  });

  const el = $(`step${n}`);
  if (el) {
    el.classList.add("active");
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.querySelectorAll(".wiz-step").forEach((s) => {
    const num = parseInt(s.getAttribute("data-step") ?? "0");
    s.classList.remove("active", "done");
    if (num < n) s.classList.add("done");
    else if (num === n) s.classList.add("active");
  });
}

// --- Status ---

async function refreshStatus(): Promise<void> {
  $("status").textContent = "Loading...";
  try {
    const j = await httpJson<{
      configured: boolean;
      openclawVersion?: string;
      gatewayTarget?: string;
    }>("/setup/api/status");

    isConfigured = !!j.configured;
    const ver = j.openclawVersion ? j.openclawVersion : "";
    $("status").textContent = j.configured ? `Ready ${ver}` : "Setting up...";
    $("statusBar").classList.toggle("configured", !!j.configured);
  } catch (e) {
    $("status").textContent = `Error: ${e}`;
  }
}

// --- Terminal ---

function connectTerminal(command: string | null): void {
  if (ws && ws.readyState <= WebSocket.OPEN) {
    if (command) ws.send(command + "\n");
    return;
  }

  if (!term) {
    term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "JetBrains Mono, monospace",
      theme: {
        background: "#0c0e14",
        foreground: "#e8e6e3",
        cursor: "#e85d3a",
        selectionBackground: "rgba(232,93,58,0.25)",
      },
      convertEol: true,
    });
    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open($("terminal"));
    fitAddon.fit();
    window.addEventListener("resize", () => fitAddon?.fit());
  }

  term.clear();
  term.writeln("\x1b[1;32mConnecting...\x1b[0m\r\n");

  const proto = location.protocol === "https:" ? "wss:" : "ws:";

  httpJson<{ token: string }>("/setup/api/terminal-token")
    .then((j) => {
      const url = `${proto}//${location.host}/setup/terminal?token=${encodeURIComponent(j.token)}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        term!.writeln("\x1b[1;32mConnected!\x1b[0m\r\n");
        const dims = fitAddon!.proposeDimensions();
        if (dims)
          ws!.send(
            JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }),
          );
        if (command) setTimeout(() => ws!.send(command + "\n"), 500);
      };

      ws.onmessage = (e: MessageEvent) => term!.write(e.data as string);

      ws.onclose = () => {
        term!.writeln("\r\n\x1b[1;33mDisconnected.\x1b[0m");
        refreshStatus().then(() => {
          if (isConfigured && currentStep === 1) {
            $("step1Done").style.display = "flex";
          }
        });
      };

      ws.onerror = () =>
        term!.writeln("\r\n\x1b[1;31mConnection error.\x1b[0m");

      term!.onData((d: string) => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(d);
      });

      term!.onResize((s: { cols: number; rows: number }) => {
        if (ws && ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "resize", cols: s.cols, rows: s.rows }));
      });
    })
    .catch((e: Error) =>
      term!.writeln(`\x1b[1;31mFailed: ${e}\x1b[0m`),
    );
}

// --- Button handlers ---

$("termStart").onclick = () => connectTerminal("openclaw onboard");
$("termShell").onclick = () => connectTerminal(null);
$("step1Next").onclick = async () => {
  $("step1Next").textContent = "Starting gateway...";
  stopPolling();
  try {
    await httpJson("/setup/api/console/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cmd: "gateway.restart", arg: "" }),
    });
  } catch {}
  await refreshStatus();
  goToStep(2);
};

$("pairingApprove").onclick = async () => {
  const channel = ($("pairingChannel") as HTMLSelectElement).value;
  const code = ($("pairingCode") as HTMLInputElement).value.trim();
  if (!code) {
    alert("Enter the pairing code.");
    return;
  }
  const out = $("pairingOut");
  out.style.display = "block";
  out.textContent = "Approving...\n";
  try {
    const r = await fetch("/setup/api/pairing/approve", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel, code }),
    });
    out.textContent = await r.text();
  } catch (e) {
    out.textContent = `Error: ${e}`;
  }
};

$("devicesRefresh").onclick = async () => {
  const list = $("devicesList");
  list.textContent = "Loading...";
  try {
    const j = await httpJson<{ requestIds: string[] }>(
      "/setup/api/devices/pending",
    );
    const ids = j.requestIds ?? [];
    if (!ids.length) {
      list.textContent = "No pending devices.";
      return;
    }
    list.innerHTML = "";
    for (const id of ids) {
      const row = document.createElement("div");
      row.style.marginTop = "0.25rem";
      const btn = document.createElement("button");
      btn.textContent = "Approve";
      btn.style.marginRight = "0.5rem";
      btn.onclick = async () => {
        list.textContent = "Approving...";
        try {
          const r = await httpJson<{ output: string }>(
            "/setup/api/devices/approve",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ requestId: id }),
            },
          );
          list.textContent = r.output ?? "Approved!";
        } catch (e) {
          list.textContent = `Error: ${e}`;
        }
      };
      const code = document.createElement("code");
      code.textContent = id;
      row.appendChild(btn);
      row.appendChild(code);
      list.appendChild(row);
    }
  } catch (e) {
    list.textContent = `Error: ${e}`;
  }
};

$("step2Done").onclick = () => goToStep(3);

// --- Poll for config changes while on step 1 ---

let pollTimer: ReturnType<typeof setInterval> | null = null;

function startPolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    await refreshStatus();
    if (isConfigured && currentStep === 1) {
      $("step1Done").style.display = "flex";
    }
  }, 5000);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// --- Dashboard (shown when already configured) ---

let dashTerm: InstanceType<typeof Terminal> | null = null;
let dashWs: WebSocket | null = null;
let dashFit: ReturnType<typeof FitAddon.FitAddon.prototype.constructor> | null = null;

function showDashboard(): void {
  $("wizardProgress").style.display = "none";
  document.querySelectorAll(".wizard-card").forEach((el) => {
    (el as HTMLElement).style.display = "none";
  });
  $("dashboard").style.display = "block";
}

function connectDashTerminal(): void {
  if (dashWs && dashWs.readyState <= WebSocket.OPEN) return;

  $("dashTermContainer").style.display = "block";

  if (!dashTerm) {
    dashTerm = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "JetBrains Mono, monospace",
      theme: {
        background: "#0c0e14",
        foreground: "#e8e6e3",
        cursor: "#e85d3a",
        selectionBackground: "rgba(232,93,58,0.25)",
      },
      convertEol: true,
    });
    dashFit = new FitAddon.FitAddon();
    dashTerm.loadAddon(dashFit);
    dashTerm.open($("dashTerminal"));
    dashFit.fit();
    window.addEventListener("resize", () => dashFit?.fit());
  }

  dashTerm.clear();
  dashTerm.writeln("\x1b[1;32mConnecting...\x1b[0m\r\n");

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  httpJson<{ token: string }>("/setup/api/terminal-token")
    .then((j) => {
      const url = `${proto}//${location.host}/setup/terminal?token=${encodeURIComponent(j.token)}`;
      dashWs = new WebSocket(url);

      dashWs.onopen = () => {
        dashTerm!.writeln("\x1b[1;32mConnected!\x1b[0m\r\n");
        const dims = dashFit!.proposeDimensions();
        if (dims)
          dashWs!.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
      };
      dashWs.onmessage = (e: MessageEvent) => dashTerm!.write(e.data as string);
      dashWs.onclose = () => dashTerm!.writeln("\r\n\x1b[1;33mDisconnected.\x1b[0m");
      dashWs.onerror = () => dashTerm!.writeln("\r\n\x1b[1;31mConnection error.\x1b[0m");
      dashTerm!.onData((d: string) => {
        if (dashWs && dashWs.readyState === WebSocket.OPEN) dashWs.send(d);
      });
      dashTerm!.onResize((s: { cols: number; rows: number }) => {
        if (dashWs && dashWs.readyState === WebSocket.OPEN)
          dashWs.send(JSON.stringify({ type: "resize", cols: s.cols, rows: s.rows }));
      });
    })
    .catch((e: Error) => dashTerm!.writeln(`\x1b[1;31mFailed: ${e}\x1b[0m`));
}

$("dashShell").onclick = () => connectDashTerminal();
$("dashRestart").onclick = async () => {
  const out = $("dashOutput");
  out.style.display = "block";
  out.textContent = "Restarting gateway...";
  try {
    const r = await httpJson<{ output: string }>("/setup/api/console/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cmd: "gateway.restart", arg: "" }),
    });
    out.textContent = r.output ?? "Gateway restarted.";
    await refreshStatus();
  } catch (e) {
    out.textContent = `Error: ${e}`;
  }
};

// --- Init ---

refreshStatus().then(() => {
  if (isConfigured) {
    showDashboard();
  } else {
    goToStep(1);
    startPolling();
  }
});
