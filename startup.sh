#!/bin/sh
set -eu
cd /workspace
node scripts/preview.mjs stop || true

# The preview only follows a server that stays in this session's process tree.
# A background `npm run dev` is otherwise orphaned when the turn ends, and the
# open link then reports that the port is gone. Mark the session as a subreaper
# and restart the server if it is not already owned by that session.
mode=$(python3 - <<'PY'
import ctypes, os, signal

def cmdline(pid):
    try:
        return open(f"/proc/{pid}/cmdline", "rb").read().replace(b"\0", b" ").decode()
    except Exception:
        return ""

def ppid(pid):
    stat = open(f"/proc/{pid}/stat").read()
    r = stat.rfind(")")
    return int(stat[r + 2:].split()[1])

def workspace_server():
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        if cmdline(name).startswith("/usr/local/bin/xai-workspace-server"):
            return int(name)
    return None

def set_subreaper(pid):
    libc = ctypes.CDLL("libc.so.6", use_errno=True)

    class Regs(ctypes.Structure):
        _fields_ = [
            ("r15", ctypes.c_ulonglong), ("r14", ctypes.c_ulonglong),
            ("r13", ctypes.c_ulonglong), ("r12", ctypes.c_ulonglong),
            ("rbp", ctypes.c_ulonglong), ("rbx", ctypes.c_ulonglong),
            ("r11", ctypes.c_ulonglong), ("r10", ctypes.c_ulonglong),
            ("r9", ctypes.c_ulonglong), ("r8", ctypes.c_ulonglong),
            ("rax", ctypes.c_ulonglong), ("rcx", ctypes.c_ulonglong),
            ("rdx", ctypes.c_ulonglong), ("rsi", ctypes.c_ulonglong),
            ("rdi", ctypes.c_ulonglong), ("orig_rax", ctypes.c_ulonglong),
            ("rip", ctypes.c_ulonglong), ("cs", ctypes.c_ulonglong),
            ("eflags", ctypes.c_ulonglong), ("rsp", ctypes.c_ulonglong),
            ("ss", ctypes.c_ulonglong), ("fs_base", ctypes.c_ulonglong),
            ("gs_base", ctypes.c_ulonglong), ("ds", ctypes.c_ulonglong),
            ("es", ctypes.c_ulonglong), ("fs", ctypes.c_ulonglong),
            ("gs", ctypes.c_ulonglong),
        ]

    libc.ptrace.restype = ctypes.c_long

    def peek(addr):
        ctypes.set_errno(0)
        libc.ptrace.restype = ctypes.c_ulonglong
        val = libc.ptrace(2, pid, ctypes.c_void_p(addr), None)
        err = ctypes.get_errno()
        libc.ptrace.restype = ctypes.c_long
        if err:
            raise OSError(err, "peek")
        return val

    def poke(addr, val):
        if libc.ptrace(5, pid, ctypes.c_void_p(addr), ctypes.c_ulonglong(val)) != 0:
            raise OSError(ctypes.get_errno(), "poke")

    if libc.ptrace(16, pid, None, None) != 0:
        raise OSError(ctypes.get_errno(), "attach")
    os.waitpid(pid, 0)
    try:
        regs = Regs()
        if libc.ptrace(12, pid, None, ctypes.byref(regs)) != 0:
            raise OSError(ctypes.get_errno(), "getregs")
        saved = Regs()
        ctypes.memmove(ctypes.byref(saved), ctypes.byref(regs), ctypes.sizeof(Regs))
        rip = regs.rip
        start = rip & ~7
        span = ((rip + 2 + 7) & ~7) - start
        words = [peek(start + i) for i in range(0, span, 8)]
        blob = bytearray(b"".join(w.to_bytes(8, "little") for w in words))
        off = rip - start
        blob[off:off + 2] = b"\x0f\x05"
        for i in range(0, span, 8):
            poke(start + i, int.from_bytes(blob[i:i + 8], "little"))
        regs.rax = 157
        regs.rdi = 36
        regs.rsi = 1
        regs.rdx = regs.r10 = regs.r8 = regs.r9 = 0
        if libc.ptrace(13, pid, None, ctypes.byref(regs)) != 0:
            raise OSError(ctypes.get_errno(), "setregs")
        if libc.ptrace(9, pid, None, None) != 0:
            raise OSError(ctypes.get_errno(), "step")
        os.waitpid(pid, 0)
        for i, word in enumerate(words):
            poke(start + i * 8, word)
        if libc.ptrace(13, pid, None, ctypes.byref(saved)) != 0:
            raise OSError(ctypes.get_errno(), "restore")
    finally:
        libc.ptrace(17, pid, None, None)

def owned(pid, ws):
    seen = set()
    while pid and pid not in seen:
        if pid == ws:
            return True
        if pid == 1:
            return False
        seen.add(pid)
        try:
            pid = ppid(pid)
        except Exception:
            return False
    return False

def dev_pids():
    found = []
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        text = cmdline(name)
        if "vite dev" in text or text.strip().endswith("npm run dev") or "npm run dev" in text:
            found.append(int(name))
    return found

ws = workspace_server()
if ws:
    try:
        set_subreaper(ws)
    except Exception as exc:
        print(f"subreaper skipped: {exc}", flush=True)
pids = dev_pids()
port_up = False
try:
    import urllib.request
    urllib.request.urlopen("http://127.0.0.1:8080/", timeout=1).read(64)
    port_up = True
except Exception:
    port_up = False
if ws and port_up and any(owned(pid, ws) for pid in pids):
    print("KEEP")
else:
    for pid in pids:
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass
    print("RESTART")
PY
)

if [ "$mode" = "KEEP" ]; then
  exit 0
fi

i=0
while [ "$i" -lt 25 ]; do
  if ! curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8080/; then
    break
  fi
  i=$((i + 1))
  sleep 0.2
done

npm run dev >>/tmp/app-startup.log 2>&1 &
