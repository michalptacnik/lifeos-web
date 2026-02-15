"use client";

import { DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type TaskStatus = "TODO" | "IN_PROCESS" | "DONE";
type TabKey = "kanban" | "worktime";
type AppView = "dashboard" | "tasks" | "calendar";
type AreaKey = "HOME" | "BUDGET" | "WORK";
type AuthMode = "login" | "register";
type ResourceKey = "tasks" | "worktime" | "automation";
type SessionProfile = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  household: {
    id: string;
    name: string;
    role: "OWNER" | "MANAGER" | "VIEWER";
  } | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  area?: AreaKey | null;
  project: string | null;
  status: TaskStatus;
  startedOn: string | null;
  finishedOn: string | null;
  createdAt: string;
  ownerEmail: string | null;
};

type WorkSession = {
  id: string;
  task: Task;
  startedAt: string;
  endedAt: string | null;
  notes: string;
};

type WorktimePayload = {
  queueTasks: Task[];
  activeSession: WorkSession | null;
  recentSessions: WorkSession[];
};

type AutomationPlanItem = {
  id: string;
  title: string;
  area: AreaKey;
  project: string | null;
  status: TaskStatus;
  ownerEmail: string | null;
  reason: string;
};

type AutomationActivityItem = {
  id: string;
  action: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

type AutomationPlanResponse = {
  mode: string;
  selected: AutomationPlanItem[];
  summary?: string;
  changes?: Array<{
    type: string;
    taskId: string;
    title: string;
    before: { status: TaskStatus; startedOn: string | null };
    after: { status: TaskStatus; startedOn: string | null };
    reason: string;
  }>;
  applied?: { promotedTaskId: string | null } | null;
  approvalRequired?: boolean;
  message?: string;
};

const columns: TaskStatus[] = ["TODO", "IN_PROCESS", "DONE"];
const areas: AreaKey[] = ["HOME", "BUDGET", "WORK"];
const areaLabel: Record<AreaKey, string> = {
  HOME: "Home",
  BUDGET: "Budget",
  WORK: "Work"
};
const statusMeta: Record<TaskStatus, { title: string; tone: string }> = {
  TODO: { title: "To Do", tone: "#d6e4ff" },
  IN_PROCESS: { title: "In Process", tone: "#ffe2bf" },
  DONE: { title: "Done", tone: "#c6f2d0" }
};

const emptyTaskForm = {
  title: "",
  description: "",
  area: "WORK" as AreaKey,
  projectName: "",
  ownerEmail: "",
  startedOn: "",
  finishedOn: ""
};

function fmt(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function toInputDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const tzOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function timerLabel(startedAt: string, nowMs: number) {
  const elapsed = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000));
  const hh = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function decodeProject(areaValue: AreaKey | null | undefined, value: string | null): { area: AreaKey; projectName: string } {
  if (areaValue && areas.includes(areaValue)) {
    return { area: areaValue, projectName: value ?? "" };
  }
  if (!value) return { area: "WORK", projectName: "" };
  const parts = value.split("::");
  if (parts.length >= 2 && areas.includes(parts[0] as AreaKey)) {
    return { area: parts[0] as AreaKey, projectName: parts.slice(1).join("::") };
  }
  return { area: "WORK", projectName: value };
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const effectiveUserEmail = profile?.user?.email ?? session?.user?.email;
  const [view, setView] = useState<AppView>("dashboard");
  const [tab, setTab] = useState<TabKey>("kanban");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [worktime, setWorktime] = useState<WorktimePayload>({ queueTasks: [], activeSession: null, recentSessions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingValues, setEditingValues] = useState(emptyTaskForm);
  const [activeAreaFilter, setActiveAreaFilter] = useState<"ALL" | AreaKey>("ALL");
  const [tick, setTick] = useState(Date.now());
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [availableProviders, setAvailableProviders] = useState({ google: false, apple: false });
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [automationActivity, setAutomationActivity] = useState<AutomationActivityItem[]>([]);
  const [automationPreview, setAutomationPreview] = useState<AutomationPlanItem[] | null>(null);
  const [automationSummary, setAutomationSummary] = useState<string | null>(null);
  const [automationChanges, setAutomationChanges] = useState<NonNullable<AutomationPlanResponse["changes"]> | null>(null);
  const [automationBusy, setAutomationBusy] = useState(false);
  const [automationArea, setAutomationArea] = useState<AreaKey>("WORK");

  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);
  const activeTask = worktime.activeSession?.task ?? selectedTask;
  const visibleTasks = useMemo(() => {
    if (activeAreaFilter === "ALL") return tasks;
    return tasks.filter((task) => decodeProject(task.area, task.project).area === activeAreaFilter);
  }, [tasks, activeAreaFilter]);
  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const lastOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    const firstVisible = new Date(firstOfMonth);
    firstVisible.setDate(firstVisible.getDate() - firstOfMonth.getDay());
    const lastVisible = new Date(lastOfMonth);
    lastVisible.setDate(lastVisible.getDate() + (6 - lastOfMonth.getDay()));

    const days: Date[] = [];
    for (let cursor = new Date(firstVisible); cursor <= lastVisible; cursor.setDate(cursor.getDate() + 1)) {
      days.push(new Date(cursor));
    }
    return days;
  }, [calendarMonth]);
  const selectedDateTasks = useMemo(() => {
    return visibleTasks.filter((task) => {
      const startedOn = task.startedOn ? startOfDay(new Date(task.startedOn)) : null;
      const finishedOn = task.finishedOn ? startOfDay(new Date(task.finishedOn)) : null;
      return Boolean((startedOn && isSameDay(startedOn, selectedDate)) || (finishedOn && isSameDay(finishedOn, selectedDate)));
    });
  }, [visibleTasks, selectedDate]);
  const recentProjects = useMemo(() => {
    const map = new Map<string, { area: AreaKey; projectName: string; total: number; done: number; lastActivity: number }>();
    for (const task of tasks) {
      const decoded = decodeProject(task.area, task.project);
      if (!decoded.projectName) continue;
      const key = `${decoded.area}::${decoded.projectName}`;
      const existing = map.get(key) ?? { area: decoded.area, projectName: decoded.projectName, total: 0, done: 0, lastActivity: 0 };
      existing.total += 1;
      if (task.status === "DONE") existing.done += 1;
      const activityDate = task.finishedOn ?? task.startedOn ?? task.createdAt;
      existing.lastActivity = Math.max(existing.lastActivity, new Date(activityDate).getTime());
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.lastActivity - a.lastActivity).slice(0, 5);
  }, [tasks]);
  const areaStats = useMemo(() => {
    return areas.map((area) => {
      const list = tasks.filter((task) => decodeProject(task.area, task.project).area === area);
      const done = list.filter((task) => task.status === "DONE").length;
      const inProcess = list.filter((task) => task.status === "IN_PROCESS").length;
      return { area, total: list.length, done, inProcess };
    });
  }, [tasks]);
  const todayTasks = useMemo(() => {
    const today = startOfDay(new Date());
    return tasks.filter((task) => {
      const startedOn = task.startedOn ? startOfDay(new Date(task.startedOn)) : null;
      const finishedOn = task.finishedOn ? startOfDay(new Date(task.finishedOn)) : null;
      return Boolean((startedOn && isSameDay(startedOn, today)) || (finishedOn && isSameDay(finishedOn, today)));
    });
  }, [tasks]);
  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`/api/lifeos${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {})
      }
    });
    const raw = await res.text();
    const payload = raw ? JSON.parse(raw) : null;
    if (!res.ok) throw new Error(payload?.message ?? `Request failed: ${res.status}`);
    return payload as T;
  }

  async function loadResources(resources: ResourceKey[], options?: { showLoading?: boolean }) {
    if (!effectiveUserEmail) {
      setLoading(false);
      return;
    }

    if (options?.showLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const tasksPromise = resources.includes("tasks") ? api<Task[]>("/tasks") : Promise.resolve(null);
      const worktimePromise = resources.includes("worktime") ? api<WorktimePayload>("/worktime") : Promise.resolve(null);
      const automationPromise = resources.includes("automation")
        ? api<AutomationActivityItem[]>("/automation/activity").catch(() => [])
        : Promise.resolve(null);

      const [tasksData, worktimeData, activityData] = await Promise.all([tasksPromise, worktimePromise, automationPromise]);

      if (tasksData) {
        setTasks(tasksData);
        setTaskForm((prev) => ({ ...prev, ownerEmail: prev.ownerEmail || effectiveUserEmail || "" }));
      }
      if (worktimeData) {
        setWorktime(worktimeData);
      }
      if (activityData) {
        setAutomationActivity(activityData);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (options?.showLoading) {
        setLoading(false);
      }
    }
  }

  function invalidate(...resources: ResourceKey[]) {
    void loadResources(resources, { showLoading: false });
  }

  useEffect(() => {
    void loadResources(["tasks", "worktime", "automation"], { showLoading: true });
  }, [effectiveUserEmail]);

  useEffect(() => {
    if (!session?.user?.email) {
      setProfile(null);
      return;
    }

    const loadProfile = async () => {
      try {
        const res = await fetch("/api/session/profile", { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as SessionProfile;
        setProfile(payload);
      } catch {
      }
    };

    void loadProfile();
  }, [session?.user?.email]);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const res = await fetch("/api/setup/oauth", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { providers?: { google?: boolean; apple?: boolean } };
        setAvailableProviders({
          google: Boolean(data.providers?.google),
          apple: Boolean(data.providers?.apple)
        });
      } catch {
      }
    };

    loadProviders();
  }, []);

  useEffect(() => {
    if (!worktime.activeSession) return;
    const interval = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [worktime.activeSession]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const created = await api<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: taskForm.title,
          description: taskForm.description || null,
          area: taskForm.area,
          project: taskForm.projectName.trim() || null,
          ownerEmail: taskForm.ownerEmail || effectiveUserEmail || null,
          startedOn: taskForm.startedOn ? new Date(taskForm.startedOn).toISOString() : null,
          finishedOn: taskForm.finishedOn ? new Date(taskForm.finishedOn).toISOString() : null,
          status: "TODO"
        })
      });
      setTasks((prev) => [created, ...prev.filter((task) => task.id !== created.id)]);
      setTaskForm({ ...emptyTaskForm, ownerEmail: effectiveUserEmail || "" });
      setCreateOpen(false);
      invalidate("tasks");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function beginEdit(task: Task) {
    const decoded = decodeProject(task.area, task.project);
    setEditingTask(task);
    setEditingValues({
      title: task.title,
      description: task.description ?? "",
      area: decoded.area,
      projectName: decoded.projectName,
      ownerEmail: task.ownerEmail ?? effectiveUserEmail ?? "",
      startedOn: toInputDate(task.startedOn),
      finishedOn: toInputDate(task.finishedOn)
    });
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask) return;
    setError(null);
    try {
      const updated = await api<Task>(`/tasks/${editingTask.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editingValues.title,
          description: editingValues.description || null,
          area: editingValues.area,
          project: editingValues.projectName.trim() || null,
          ownerEmail: editingValues.ownerEmail || null,
          startedOn: editingValues.startedOn ? new Date(editingValues.startedOn).toISOString() : null,
          finishedOn: editingValues.finishedOn ? new Date(editingValues.finishedOn).toISOString() : null
        })
      });
      setTasks((prev) => prev.map((task) => (task.id === updated.id ? updated : task)));
      setEditingTask(null);
      invalidate("tasks", "worktime");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function moveTask(taskId: string, status: TaskStatus) {
    setError(null);
    const prevTasks = tasks;
    setTasks((list) => list.map((task) => (task.id === taskId ? { ...task, status } : task)));
    try {
      await api<Task>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setDraggingTaskId(null);
      invalidate("tasks", "worktime");
    } catch (err) {
      setTasks(prevTasks);
      setError((err as Error).message);
    }
  }

  function onTaskDragStart(event: DragEvent<HTMLElement>, taskId: string) {
    setDraggingTaskId(taskId);
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
  }

  function onColumnDrop(event: DragEvent<HTMLElement>, status: TaskStatus) {
    event.preventDefault();
    const droppedTaskId = event.dataTransfer.getData("text/plain");
    const taskId = droppedTaskId || draggingTaskId;
    if (!taskId) return;
    moveTask(taskId, status);
  }

  async function deleteTask(taskId: string) {
    setError(null);
    const prevTasks = tasks;
    setTasks((list) => list.filter((task) => task.id !== taskId));
    try {
      await api(`/tasks/${taskId}`, { method: "DELETE" });
      if (selectedTaskId === taskId) setSelectedTaskId(null);
      invalidate("tasks", "worktime");
    } catch (err) {
      setTasks(prevTasks);
      setError((err as Error).message);
    }
  }

  async function startWork() {
    if (!activeTask) return;
    setError(null);
    try {
      await api<WorkSession>("/worktime/start", { method: "POST", body: JSON.stringify({ taskId: activeTask.id }) });
      invalidate("worktime", "tasks");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function stopWork() {
    setError(null);
    try {
      await api<WorkSession>("/worktime/stop", { method: "POST", body: JSON.stringify({}) });
      invalidate("worktime", "tasks");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveSessionNote(sessionId: string, notes: string) {
    try {
      await api<WorkSession>("/worktime/" + sessionId, { method: "PATCH", body: JSON.stringify({ notes }) });
      invalidate("worktime");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function runOAuthSetup() {
    const token = window.prompt("Setup token")?.trim();
    if (!token) return;

    const googleClientId = window.prompt("Google Client ID (blank to keep empty)") ?? "";
    const googleClientSecret = window.prompt("Google Client Secret (blank to keep empty)") ?? "";
    const appleClientId = window.prompt("Apple Client ID (blank to keep empty)") ?? "";
    const appleClientSecret = window.prompt("Apple Client Secret (blank to keep empty)") ?? "";

    const res = await fetch("/api/setup/oauth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setupToken: token, googleClientId, googleClientSecret, appleClientId, appleClientSecret })
    });

    const payload = await res.json();
    if (!res.ok) {
      setSetupMessage(payload.message ?? "OAuth setup failed");
      return;
    }

    setAvailableProviders({
      google: Boolean(payload.providers?.google),
      apple: Boolean(payload.providers?.apple)
    });
    setSetupMessage("OAuth credentials saved. You can sign in now.");
  }

  async function submitLocalAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = authEmail.trim().toLowerCase();
    const password = authPassword;
    if (!email || !password) {
      setAuthMessage("Email and password are required.");
      return;
    }

    setAuthBusy(true);
    setAuthMessage(null);
    try {
      const csrfRes = await fetch("/api/auth/csrf", { cache: "no-store" });
      const csrfPayload = (await csrfRes.json()) as { csrfToken?: string };
      const csrfToken = csrfPayload.csrfToken;
      if (!csrfToken) {
        throw new Error("Unable to establish secure auth session");
      }

      const authEndpoint = authMode === "register" ? "/api/local-auth/register" : "/api/local-auth/login";
      const authRes = await fetch(authEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          email,
          password,
          displayName: authMode === "register" ? (authDisplayName.trim() || undefined) : undefined
        })
      });

      const authRaw = await authRes.text();
      const authPayload = authRaw ? JSON.parse(authRaw) : {};
      if (!authRes.ok) {
        if (authRes.status === 409) {
          throw new Error("Account already exists. Switch to Login.");
        }
        if (authRes.status === 429) {
          const retryAfterSeconds = Number(authPayload.retryAfterSeconds ?? 0);
          if (retryAfterSeconds > 0) {
            const minutes = Math.ceil(retryAfterSeconds / 60);
            throw new Error(`Too many attempts. Try again in about ${minutes} minute(s).`);
          }
          throw new Error("Too many attempts. Try again later.");
        }
        if (authRes.status === 401) {
          throw new Error("Wrong email or password.");
        }
        throw new Error(authPayload.message ?? (authMode === "register" ? "Registration failed" : "Login failed"));
      }

      const result = await signIn("credentials", { email, password, csrfToken, redirect: false });
      if (result?.error) {
        throw new Error("Login failed. Please retry.");
      }
      setAuthPassword("");
      setAuthMessage("Signed in.");
    } catch (err) {
      setAuthMessage((err as Error).message);
    } finally {
      setAuthBusy(false);
    }
  }

  function jumpToToday() {
    const today = startOfDay(new Date());
    setSelectedDate(today);
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  async function runPlanDay(mode: "dry_run" | "apply") {
    setAutomationBusy(true);
    try {
      const shouldConfirmBudget = mode === "apply" && automationArea === "BUDGET";
      if (shouldConfirmBudget) {
        const ok = window.confirm("Apply automation for Budget area? This requires explicit approval.");
        if (!ok) {
          setAutomationBusy(false);
          return;
        }
      }

      const payload = await api<AutomationPlanResponse>("/automation/plan-day", {
        method: "POST",
        body: JSON.stringify({ mode, area: automationArea, limit: 5, confirmBudgetApply: shouldConfirmBudget })
      });
      setAutomationPreview(payload.selected);
      setAutomationSummary(payload.summary ?? null);
      setAutomationChanges(payload.changes ?? null);
      invalidate("tasks", "worktime", "automation");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAutomationBusy(false);
    }
  }

  if (status === "loading") {
    return <main className="mx-auto max-w-5xl px-4 py-8">Loading session...</main>;
  }

  if (status === "unauthenticated") {
    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <section className="rounded-3xl border border-white/80 bg-white/92 p-6 shadow-[0_16px_36px_rgba(45,74,110,0.18)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">LifeOS</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-2 text-sm text-slate-700">Email and password first. SSO is optional.</p>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-full bg-slate-100 p-1">
            <button
              onClick={() => setAuthMode("login")}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${authMode === "login" ? "bg-slate-900 text-white" : "text-slate-700"}`}
            >
              Login
            </button>
            <button
              onClick={() => setAuthMode("register")}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${authMode === "register" ? "bg-slate-900 text-white" : "text-slate-700"}`}
            >
              Register
            </button>
          </div>

          <form onSubmit={submitLocalAuth} className="mt-4 space-y-2">
            {authMode === "register" ? (
              <input
                type="text"
                value={authDisplayName}
                onChange={(e) => setAuthDisplayName(e.target.value)}
                placeholder="Display name"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            ) : null}
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              required
            />
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              required
            />
            <button
              disabled={authBusy}
              className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
            >
              {authBusy ? "Please wait..." : authMode === "login" ? "Sign in with Email" : "Create account"}
            </button>
          </form>

          {authMessage ? <p className="mt-2 text-xs text-slate-700">{authMessage}</p> : null}

          <details className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Use SSO instead</summary>
            <div className="mt-3 space-y-2">
              <button
                disabled={!availableProviders.google}
                onClick={() => signIn("google")}
                className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
              >
                Continue with Google
              </button>
              <button
                disabled={!availableProviders.apple}
                onClick={() => signIn("apple")}
                className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
              >
                Continue with Apple
              </button>
              {(!availableProviders.google || !availableProviders.apple) && (
                <p className="text-xs text-amber-700">Providers are not fully configured yet.</p>
              )}
              <button
                onClick={runOAuthSetup}
                className="w-full rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800"
              >
                Configure OAuth on this server
              </button>
              {setupMessage ? <p className="text-xs text-slate-700">{setupMessage}</p> : null}
            </div>
          </details>
        </section>
      </main>
    );
  }

  if (loading) {
    return <main className="mx-auto max-w-5xl px-4 py-8">Loading tasks...</main>;
  }

  return (
    <main className="mx-auto max-w-5xl px-3 pb-24 pt-3 md:px-6 md:pb-8">
      <header className="sticky top-2 z-20 rounded-3xl border border-white/70 bg-white/90 px-4 py-3 shadow-[0_12px_30px_rgba(48,74,112,0.18)] backdrop-blur">
        {view === "dashboard" ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">LifeOS</p>
              <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
              <p className="text-xs text-slate-600">{profile?.user.displayName || effectiveUserEmail}</p>
              {profile?.household ? <p className="text-xs text-slate-500">{profile.household.name} ({profile.household.role})</p> : null}
            </div>
            {session?.user?.email ? <button onClick={() => signOut()} className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">Sign out</button> : null}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">LifeOS App</p>
                <h1 className="text-2xl font-semibold text-slate-900">{view === "tasks" ? "Work / Tasks" : "Calendar"}</h1>
              </div>
              <div className="flex gap-2">
                {view === "tasks" ? <button onClick={() => setCreateOpen(true)} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">+ Task</button> : null}
                <button onClick={() => setView("dashboard")} className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">Back to Dashboard</button>
              </div>
            </div>
          {view === "tasks" ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
              {(["kanban", "worktime"] as TabKey[]).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`rounded-2xl px-3 py-2 text-sm font-semibold ${tab === t ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
                  {t === "kanban" ? "Kanban" : "Worktime"}
                </button>
              ))}
              </div>
            ) : null}
            {view === "tasks" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => setActiveAreaFilter("ALL")} className={`rounded-full px-3 py-1 text-xs font-semibold ${activeAreaFilter === "ALL" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>All Areas</button>
                {areas.map((area) => (
                  <button key={area} onClick={() => setActiveAreaFilter(area)} className={`rounded-full px-3 py-1 text-xs font-semibold ${activeAreaFilter === area ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
                    {areaLabel[area]}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </header>

      {view === "dashboard" ? (
        <section className="mt-4 space-y-4">
          <article className="rounded-3xl border border-white/70 bg-white/88 p-4 shadow-[0_8px_24px_rgba(52,82,120,0.12)]">
            <h2 className="text-lg font-semibold text-slate-900">Widgets</h2>
            <p className="mt-1 text-sm text-slate-600">Live snapshot from your current system.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-700">Today Focus</p>
                <p className="mt-1 text-xs text-slate-500">Tasks touching today: {todayTasks.length}</p>
                <p className="mt-2 text-xs text-slate-600">Active session: {worktime.activeSession ? worktime.activeSession.task.title : "None"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-700">Area Overview</p>
                <div className="mt-2 space-y-1">
                  {areaStats.map((stat) => (
                    <p key={stat.area} className="text-xs text-slate-600">
                      {areaLabel[stat.area]}: {stat.total} tasks ({stat.done} done, {stat.inProcess} active)
                    </p>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-700">Recent Projects</p>
                <div className="mt-2 space-y-1">
                  {recentProjects.length === 0 ? (
                    <p className="text-xs text-slate-500">No projects yet.</p>
                  ) : (
                    recentProjects.map((project) => (
                      <p key={`${project.area}-${project.projectName}`} className="text-xs text-slate-600">
                        {areaLabel[project.area]} / {project.projectName}: {project.done}/{project.total} done
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-white/70 bg-white/88 p-4 shadow-[0_8px_24px_rgba(52,82,120,0.12)]">
            <h2 className="text-lg font-semibold text-slate-900">Apps</h2>
            <p className="mt-1 text-sm text-slate-600">First row only for now. App order will be user-customizable later.</p>
            <div className="mt-4 grid grid-cols-4 gap-4">
              <button
                onClick={() => {
                  setView("tasks");
                  setTab("kanban");
                }}
                className="group flex flex-col items-center gap-2 text-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-lg font-bold text-white shadow-md transition group-hover:scale-105">
                  O
                </div>
                <span className="text-xs font-medium text-slate-700">Work</span>
              </button>
              <button
                onClick={() => setView("calendar")}
                className="group flex flex-col items-center gap-2 text-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-bold text-white shadow-md transition group-hover:scale-105">
                  C
                </div>
                <span className="text-xs font-medium text-slate-700">Calendar</span>
              </button>
              <div className="flex flex-col items-center gap-2 text-center opacity-70">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-100 text-lg font-bold text-slate-500">+</div>
                <span className="text-xs font-medium text-slate-600">Empty</span>
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-white/70 bg-white/88 p-4 shadow-[0_8px_24px_rgba(52,82,120,0.12)]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Automation</h2>
              <div className="flex gap-2">
                <button disabled={automationBusy} onClick={() => runPlanDay("dry_run")} className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60">Preview Plan</button>
                <button disabled={automationBusy} onClick={() => runPlanDay("apply")} className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Apply Plan</button>
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-600">Agent-ready operation surface with audit trail.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {areas.map((area) => (
                <button key={area} onClick={() => setAutomationArea(area)} className={`rounded-full px-3 py-1 text-xs font-semibold ${automationArea === area ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
                  {areaLabel[area]}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Latest Plan</p>
                {automationSummary ? <p className="mt-1 text-xs text-slate-600">{automationSummary}</p> : null}
                <div className="mt-2 space-y-1">
                  {!automationPreview || automationPreview.length === 0 ? (
                    <p className="text-xs text-slate-500">No plan preview yet.</p>
                  ) : (
                    automationPreview.slice(0, 4).map((item) => (
                      <p key={item.id} className="text-xs text-slate-700">
                        {areaLabel[item.area]} / {item.project || "-"}: {item.title}
                      </p>
                    ))
                  )}
                </div>
                {automationChanges && automationChanges.length > 0 ? (
                  <div className="mt-2 rounded-lg bg-slate-50 p-2">
                    {automationChanges.map((change) => (
                      <p key={change.taskId} className="text-xs text-slate-700">
                        Change: {change.title} ({change.before.status} to {change.after.status})
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Recent Activity</p>
                <div className="mt-2 space-y-1">
                  {automationActivity.length === 0 ? (
                    <p className="text-xs text-slate-500">No automation events yet.</p>
                  ) : (
                    automationActivity.slice(0, 4).map((event) => (
                      <p key={event.id} className="text-xs text-slate-700">
                        {new Date(event.createdAt).toLocaleTimeString()} - {event.action}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          </article>
        </section>
      ) : (
        <>
          {view === "tasks" && error ? <p className="mt-3 rounded-2xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

          {view === "tasks" && tab === "kanban" && (
            <section className="mt-4 space-y-4">
              <div className="flex snap-x gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:overflow-visible">
                {columns.map((statusKey) => {
                  const list = visibleTasks.filter((task) => task.status === statusKey);
                  return (
                    <article
                      key={statusKey}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onColumnDrop(e, statusKey)}
                      className="min-w-[84vw] snap-start rounded-3xl border border-white/70 bg-white/85 p-3 shadow-[0_8px_24px_rgba(52,82,120,0.14)] md:min-w-0"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <h2 className="rounded-full px-3 py-1 text-sm font-semibold" style={{ backgroundColor: statusMeta[statusKey].tone }}>
                          {statusMeta[statusKey].title} ({list.length})
                        </h2>
                        {draggingTaskId ? <button onClick={() => moveTask(draggingTaskId, statusKey)} className="rounded-full border border-slate-300 px-3 py-1 text-xs">Move Here</button> : null}
                      </div>
                      <div className="space-y-2">
                        {list.map((task) => (
                          (() => {
                            const decoded = decodeProject(task.area, task.project);
                            return (
                          <article
                            key={task.id}
                            draggable
                            onDragStart={(e) => onTaskDragStart(e, task.id)}
                            onDragEnd={() => setDraggingTaskId(null)}
                            onTouchStart={() => setDraggingTaskId(task.id)}
                            className={`rounded-2xl border border-slate-200 bg-white p-3 ${selectedTaskId === task.id ? "ring-2 ring-slate-400" : ""}`}
                          >
                            <button onClick={() => setSelectedTaskId(task.id)} className="w-full text-left">
                              <p className="text-base font-semibold">{task.title}</p>
                              <p className="mt-1 text-xs text-slate-600">Area: {areaLabel[decoded.area]}</p>
                              <p className="text-xs text-slate-600">Project: {decoded.projectName || "-"}</p>
                              <p className="text-xs text-slate-600">Owner: {task.ownerEmail || "-"}</p>
                              <p className="text-xs text-slate-600">Started: {fmt(task.startedOn)}</p>
                              <p className="text-xs text-slate-600">Finished: {fmt(task.finishedOn)}</p>
                            </button>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {columns.map((target) => (
                                <button key={target} onClick={() => moveTask(task.id, target)} className="rounded-full border border-slate-300 px-2 py-1 text-[11px]">{statusMeta[target].title}</button>
                              ))}
                            </div>
                            <div className="mt-2 flex gap-2">
                              <button onClick={() => beginEdit(task)} className="rounded-full bg-slate-200 px-3 py-1 text-xs">Edit</button>
                              <button onClick={() => deleteTask(task.id)} className="rounded-full bg-rose-200 px-3 py-1 text-xs text-rose-900">Delete</button>
                            </div>
                          </article>
                            );
                          })()
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>

              {selectedTask ? (
                (() => {
                  const decoded = decodeProject(selectedTask.area, selectedTask.project);
                  return (
                <section className="rounded-3xl border border-white/70 bg-white/88 p-4 shadow-[0_8px_24px_rgba(52,82,120,0.12)]">
                  <h3 className="text-lg font-semibold">Selected Task</h3>
                  <p className="mt-2 text-sm text-slate-700">{selectedTask.title}</p>
                  <p className="text-sm text-slate-600">Area: {areaLabel[decoded.area]}</p>
                  <p className="text-sm text-slate-600">Project: {decoded.projectName || "-"}</p>
                  <p className="text-sm text-slate-600">Owner: {selectedTask.ownerEmail || "-"}</p>
                  <p className="text-sm text-slate-600">Started: {fmt(selectedTask.startedOn)}</p>
                  <p className="text-sm text-slate-600">Finished: {fmt(selectedTask.finishedOn)}</p>
                  <p className="mt-2 text-sm text-slate-600">Description: {selectedTask.description || "-"}</p>
                </section>
                  );
                })()
              ) : null}
            </section>
          )}

          {view === "tasks" && tab === "worktime" && (
            <section className="mt-4 grid gap-3 md:grid-cols-3">
              <article className="rounded-3xl border border-white/70 bg-white/88 p-3 shadow-[0_8px_24px_rgba(52,82,120,0.12)]">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.1em] text-slate-600">Top: Queue</h2>
                <div className="space-y-2">
                  {worktime.queueTasks.map((task) => (
                    <button key={task.id} onClick={() => setSelectedTaskId(task.id)} className={`w-full rounded-xl border px-3 py-2 text-left ${activeTask?.id === task.id ? "border-slate-900 bg-white" : "border-slate-200 bg-white/70"}`}>
                      <p className="text-sm font-semibold">{task.title}</p>
                      <p className="text-xs text-slate-600">{statusMeta[task.status].title}</p>
                    </button>
                  ))}
                </div>
              </article>

              <article className="rounded-3xl bg-slate-900 p-4 text-white shadow-[0_10px_28px_rgba(15,23,42,0.45)]">
                <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-300">Middle: Active Task</h2>
                <p className="mt-2 text-lg font-semibold">{activeTask?.title ?? "Pick task from queue"}</p>
                <p className="text-sm text-slate-300">Project: {activeTask ? decodeProject(activeTask.area, activeTask.project).projectName || "-" : "-"}</p>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{worktime.activeSession ? timerLabel(worktime.activeSession.startedAt, tick) : "00:00:00"}</p>
                {worktime.activeSession ? (
                  <button onClick={stopWork} className="mt-3 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white">Stop Work</button>
                ) : (
                  <button onClick={startWork} disabled={!activeTask} className="mt-3 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-500">Start Work</button>
                )}
              </article>

              <article className="rounded-3xl border border-white/70 bg-white/88 p-3 shadow-[0_8px_24px_rgba(52,82,120,0.12)]">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.1em] text-slate-600">Bottom: Editable Log</h2>
                <div className="max-h-[24rem] space-y-2 overflow-auto pr-1">
                  {worktime.recentSessions.map((sessionRow) => (
                    <div key={sessionRow.id} className="rounded-xl border border-slate-200 bg-white p-2">
                      <p className="text-sm font-semibold">{sessionRow.task.title}</p>
                      <p className="text-xs text-slate-600">{fmt(sessionRow.startedAt)} - {fmt(sessionRow.endedAt)}</p>
                      <textarea defaultValue={sessionRow.notes} onBlur={(e) => saveSessionNote(sessionRow.id, e.target.value)} rows={2} className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {view === "calendar" && (
            <section className="mt-4 grid gap-3 lg:grid-cols-[2fr_1fr]">
              <article className="rounded-3xl border border-white/70 bg-white/88 p-4 shadow-[0_8px_24px_rgba(52,82,120,0.12)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Calendar</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
                    >
                      Prev
                    </button>
                    <button
                      onClick={jumpToToday}
                      className="rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
                    >
                      Today
                    </button>
                    <button
                      onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
                    >
                      Next
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  {calendarMonth.toLocaleString(undefined, { month: "long", year: "numeric" })}
                </p>
                <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div key={day} className="py-1">{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day) => {
                    const today = startOfDay(new Date());
                    const isToday = isSameDay(day, today);
                    const isSelected = isSameDay(day, selectedDate);
                    const inMonth = isSameMonth(day, calendarMonth);
                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedDate(day)}
                        className={`min-h-16 rounded-xl border px-2 py-2 text-left text-sm transition ${
                          isSelected
                            ? "border-slate-900 bg-slate-900 text-white"
                            : inMonth
                              ? "border-slate-200 bg-white text-slate-800"
                              : "border-slate-100 bg-slate-50 text-slate-400"
                        }`}
                      >
                        <span className={`text-xs font-semibold ${isToday && !isSelected ? "rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800" : ""}`}>
                          {day.getDate()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </article>
              <article className="rounded-3xl border border-white/70 bg-white/88 p-4 shadow-[0_8px_24px_rgba(52,82,120,0.12)]">
                <h2 className="text-lg font-semibold">Selected Day</h2>
                <p className="mt-2 text-sm text-slate-700">
                  Selected day: {selectedDate.toLocaleDateString()}
                </p>
                <div className="mt-3 space-y-2">
                  {selectedDateTasks.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">No tasks mapped to this day yet.</p>
                  ) : (
                    selectedDateTasks.map((task) => (
                      (() => {
                        const decoded = decodeProject(task.area, task.project);
                        return (
                      <div key={task.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-800">{task.title}</p>
                        <p className="text-xs text-slate-600">Area: {areaLabel[decoded.area]}</p>
                        <p className="text-xs text-slate-600">Project: {decoded.projectName || "-"}</p>
                        <p className="text-xs text-slate-600">Status: {statusMeta[task.status].title}</p>
                        <p className="text-xs text-slate-600">Start: {fmt(task.startedOn)}</p>
                        <p className="text-xs text-slate-600">Finish: {fmt(task.finishedOn)}</p>
                      </div>
                        );
                      })()
                    ))
                  )}
                </div>
                <p className="mt-3 text-sm text-slate-700">
                  Next step: CalDAV and iOS calendar import will populate this timeline too.
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  Existing ICS feed: <a className="underline" href="/api/lifeos/calendar/tasks.ics" target="_blank" rel="noreferrer">/api/lifeos/calendar/tasks.ics</a>
                </p>
              </article>
            </section>
          )}

        </>
      )}

      {view === "tasks" && createOpen ? (
        <section className="fixed inset-0 z-30 flex items-end bg-black/40 p-3 md:items-center md:justify-center">
          <form onSubmit={createTask} className="w-full max-w-xl rounded-3xl bg-white p-4 shadow-2xl">
            <h3 className="mb-3 text-lg font-semibold">Create Task</h3>
            <div className="grid gap-2 md:grid-cols-2">
              <input required value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2" placeholder="Task title" />
              <select value={taskForm.area} onChange={(e) => setTaskForm((p) => ({ ...p, area: e.target.value as AreaKey }))} className="rounded-xl border border-slate-300 px-3 py-2">
                {areas.map((area) => <option key={area} value={area}>{areaLabel[area]}</option>)}
              </select>
              <input value={taskForm.projectName} onChange={(e) => setTaskForm((p) => ({ ...p, projectName: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2" placeholder="Project name" />
              <input type="email" value={taskForm.ownerEmail} onChange={(e) => setTaskForm((p) => ({ ...p, ownerEmail: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2" placeholder="Owner email" />
              <textarea value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 md:col-span-2" placeholder="Description" rows={2} />
              <label className="text-sm text-slate-700">Started on
                <input type="datetime-local" value={taskForm.startedOn} onChange={(e) => setTaskForm((p) => ({ ...p, startedOn: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700">Finished on
                <input type="datetime-local" value={taskForm.finishedOn} onChange={(e) => setTaskForm((p) => ({ ...p, finishedOn: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="submit" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Create</button>
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold">Cancel</button>
            </div>
          </form>
        </section>
      ) : null}

      {view === "tasks" && editingTask ? (
        <section className="fixed inset-0 z-30 flex items-end bg-black/40 p-3 md:items-center md:justify-center">
          <form onSubmit={saveEdit} className="w-full max-w-xl rounded-3xl bg-white p-4 shadow-2xl">
            <h3 className="mb-3 text-lg font-semibold">Edit Task</h3>
            <div className="grid gap-2 md:grid-cols-2">
              <input required value={editingValues.title} onChange={(e) => setEditingValues((p) => ({ ...p, title: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2" />
              <select value={editingValues.area} onChange={(e) => setEditingValues((p) => ({ ...p, area: e.target.value as AreaKey }))} className="rounded-xl border border-slate-300 px-3 py-2">
                {areas.map((area) => <option key={area} value={area}>{areaLabel[area]}</option>)}
              </select>
              <input value={editingValues.projectName} onChange={(e) => setEditingValues((p) => ({ ...p, projectName: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2" />
              <input type="email" value={editingValues.ownerEmail} onChange={(e) => setEditingValues((p) => ({ ...p, ownerEmail: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2" />
              <textarea value={editingValues.description} onChange={(e) => setEditingValues((p) => ({ ...p, description: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 md:col-span-2" rows={2} />
              <label className="text-sm text-slate-700">Started on
                <input type="datetime-local" value={editingValues.startedOn} onChange={(e) => setEditingValues((p) => ({ ...p, startedOn: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700">Finished on
                <input type="datetime-local" value={editingValues.finishedOn} onChange={(e) => setEditingValues((p) => ({ ...p, finishedOn: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="submit" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Save</button>
              <button type="button" onClick={() => setEditingTask(null)} className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold">Cancel</button>
            </div>
          </form>
        </section>
      ) : null}
    </main>
  );
}
