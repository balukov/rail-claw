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

let isConfigured = false;
let hasChannels = false;

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

// --- Status ---

async function refreshStatus(): Promise<void> {
  $("status").textContent = "Loading...";
  try {
    const j = await httpJson<{
      configured: boolean;
      channelsReady: boolean;
      openclawVersion?: string;
    }>("/snapclaw/api/status");

    isConfigured = !!j.configured;
    hasChannels = !!j.channelsReady;
    const ver = j.openclawVersion ? j.openclawVersion : "";
    $("status").textContent = j.configured ? `Ready ${ver}` : "Setting up...";
    $("statusBar").classList.toggle("configured", !!j.configured);
  } catch (e) {
    $("status").textContent = `Error: ${e}`;
  }
}

function setBadge(el: HTMLElement, type: "success" | "pending", text: string): void {
  el.innerHTML = "";
  const badge = document.createElement("span");
  badge.className = `status-badge ${type}`;
  badge.textContent = text;
  el.appendChild(badge);
}

// --- Setup step terminal ---

function connectStepTerminal(
  step: string,
  termContainerId: string,
  termId: string,
  actionsId: string,
  statusId: string,
  btnId: string,
): void {
  $(actionsId).classList.add("hidden");
  $(termContainerId).classList.remove("hidden");

  const term = new Terminal({
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
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open($(termId));
  fit.fit();
  window.addEventListener("resize", () => fit.fit());

  term.writeln("\x1b[1;32mConnecting...\x1b[0m\r\n");

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  httpJson<{ token: string }>("/snapclaw/api/setup-terminal-token")
    .then((j) => {
      const url = `${proto}//${location.host}/snapclaw/setup-terminal?token=${encodeURIComponent(j.token)}&step=${step}`;
      const ws = new WebSocket(url);

      ws.onopen = () => {
        term.clear();
        const dims = fit.proposeDimensions();
        if (dims) ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
      };
      ws.onmessage = (e: MessageEvent) => {
        const data = e.data as string;
        try {
          const msg = JSON.parse(data);
          if (msg.type === "step-complete") {
            if (msg.ok) {
              setBadge($(statusId), "success", "Connected");
              const stepNum = $(btnId).closest(".card")?.querySelector(".step-number");
              if (stepNum) stepNum.classList.add("done");
            }
            refreshStatus();
            return;
          }
        } catch {}
        term.write(data);
      };
      ws.onclose = () => {
        term.writeln("\r\n\x1b[1;33mSession ended.\x1b[0m");
        $(actionsId).classList.remove("hidden");
        const btn = $(btnId) as HTMLButtonElement;
        btn.textContent = "Retry";
        btn.disabled = false;
      };
      ws.onerror = () => term.writeln("\r\n\x1b[1;31mConnection error.\x1b[0m");
      term.onData((d: string) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(d);
      });
      term.onResize((s: { cols: number; rows: number }) => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "resize", cols: s.cols, rows: s.rows }));
      });
    })
    .catch((e: Error) => term.writeln(`\x1b[1;31mFailed: ${e}\x1b[0m`));
}

// --- Step buttons ---

$("codexStartBtn").onclick = () => {
  ($("codexStartBtn") as HTMLButtonElement).disabled = true;
  ($("codexStartBtn") as HTMLButtonElement).textContent = "Connecting...";
  connectStepTerminal("codex", "codexTermContainer", "codexTerminal", "codexActions", "codexStatus", "codexStartBtn");
};

$("telegramStartBtn").onclick = () => {
  ($("telegramStartBtn") as HTMLButtonElement).disabled = true;
  ($("telegramStartBtn") as HTMLButtonElement).textContent = "Connecting...";
  connectStepTerminal("telegram", "telegramTermContainer", "telegramTerminal", "telegramActions", "telegramStatus", "telegramStartBtn");
};

// --- Dashboard (shown when already configured) ---

let dashTerm: InstanceType<typeof Terminal> | null = null;
let dashWs: WebSocket | null = null;
let dashFit: ReturnType<typeof FitAddon.FitAddon.prototype.constructor> | null = null;

function showDashboard(): void {
  $("setupCards").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
}

function connectDashTerminal(): void {
  if (dashWs && dashWs.readyState <= WebSocket.OPEN) return;

  $("dashTermContainer").classList.remove("hidden");

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
  httpJson<{ token: string }>("/snapclaw/api/terminal-token")
    .then((j) => {
      const url = `${proto}//${location.host}/snapclaw/terminal?token=${encodeURIComponent(j.token)}`;
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
  out.classList.remove("hidden");
  out.textContent = "Restarting gateway...";
  try {
    const r = await httpJson<{ output: string }>("/snapclaw/api/console/run", {
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
  if (hasChannels) {
    showDashboard();
  }
});
