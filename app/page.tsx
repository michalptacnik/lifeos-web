"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type TaskStatus = "TODO" | "IN_PROCESS" | "DONE";
type TabKey = "kanban" | "worktime" | "calendar";

type Task = {
  id: string;
  title: string;
  description: string | null;
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

const columns: TaskStatus[] = ["TODO", "IN_PROCESS", "DONE"];
const statusMeta: Record<TaskStatus, { title: string; tone: string }> = {
  TODO: { title: "To Do", tone: "#d6e4ff" },
  IN_PROCESS: { title: "In Process", tone: "#ffe2bf" },
  DONE: { title: "Done", tone: "#c6f2d0" }
};


const emptyTaskForm = {
  title: "",
  description: "",
  project: "",
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

export default function HomePage() {
  const { data: session, status } = useSession();
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
  const [tick, setTick] = useState(Date.now());
  const [availableProviders, setAvailableProviders] = useState({ google: false, apple: false });
  const [setupMessage, setSetupMessage] = useState<string | null>(null);

  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);
  const activeTask = worktime.activeSession?.task ?? selectedTask;

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

  async function refreshAll() {
    if (!session?.user?.email) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [tasksData, worktimeData] = await Promise.all([api<Task[]>("/tasks"), api<WorktimePayload>("/worktime")]);
      setTasks(tasksData);
      setWorktime(worktimeData);
      setTaskForm((prev) => ({ ...prev, ownerEmail: prev.ownerEmail || session.user?.email || "" }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
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
      await api<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: taskForm.title,
          description: taskForm.description || null,
          project: taskForm.project || null,
          ownerEmail: taskForm.ownerEmail || session?.user?.email || null,
          startedOn: taskForm.startedOn ? new Date(taskForm.startedOn).toISOString() : null,
          finishedOn: taskForm.finishedOn ? new Date(taskForm.finishedOn).toISOString() : null,
          status: "TODO"
        })
      });
      setTaskForm({ ...emptyTaskForm, ownerEmail: session?.user?.email || "" });
      setCreateOpen(false);
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function beginEdit(task: Task) {
    setEditingTask(task);
    setEditingValues({
      title: task.title,
      description: task.description ?? "",
      project: task.project ?? "",
      ownerEmail: task.ownerEmail ?? session?.user?.email ?? "",
      startedOn: toInputDate(task.startedOn),
      finishedOn: toInputDate(task.finishedOn)
    });
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask) return;
    setError(null);
    try {
      await api<Task>(`/tasks/${editingTask.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editingValues.title,
          description: editingValues.description || null,
          project: editingValues.project || null,
          ownerEmail: editingValues.ownerEmail || null,
          startedOn: editingValues.startedOn ? new Date(editingValues.startedOn).toISOString() : null,
          finishedOn: editingValues.finishedOn ? new Date(editingValues.finishedOn).toISOString() : null
        })
      });
      setEditingTask(null);
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function moveTask(taskId: string, status: TaskStatus) {
    setError(null);
    try {
      await api<Task>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setDraggingTaskId(null);
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteTask(taskId: string) {
    setError(null);
    try {
      await api(`/tasks/${taskId}`, { method: "DELETE" });
      if (selectedTaskId === taskId) setSelectedTaskId(null);
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function startWork() {
    if (!activeTask) return;
    setError(null);
    try {
      await api<WorkSession>("/worktime/start", { method: "POST", body: JSON.stringify({ taskId: activeTask.id }) });
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function stopWork() {
    setError(null);
    try {
      await api<WorkSession>("/worktime/stop", { method: "POST", body: JSON.stringify({}) });
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveSessionNote(sessionId: string, notes: string) {
    try {
      await api<WorkSession>("/worktime/" + sessionId, { method: "PATCH", body: JSON.stringify({ notes }) });
      await refreshAll();
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

  if (status === "loading") {
    return <main className="mx-auto max-w-5xl px-4 py-8">Loading session...</main>;
  }

  if (status === "unauthenticated") {
    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <section className="rounded-3xl border border-white/80 bg-white/92 p-6 shadow-[0_16px_36px_rgba(45,74,110,0.18)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">LifeOS</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-2 text-sm text-slate-700">Use SSO only. Email/password login is disabled.</p>
          <div className="mt-5 space-y-2">
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
          </div>
          {(!availableProviders.google || !availableProviders.apple) && (
            <p className="mt-3 text-xs text-amber-700">Providers are not fully configured yet. Use "Configure OAuth on this server" below or server env setup.</p>
          )}
          <button
            onClick={runOAuthSetup}
            className="mt-3 w-full rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800"
          >
            Configure OAuth on this server
          </button>
          {setupMessage ? <p className="mt-2 text-xs text-slate-700">{setupMessage}</p> : null}
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">LifeOS</p>
            <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
            <p className="text-xs text-slate-600">{session?.user?.email}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCreateOpen(true)} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">+ Task</button>
            <button onClick={() => signOut()} className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">Sign out</button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["kanban", "worktime", "calendar"] as TabKey[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-2xl px-3 py-2 text-sm font-semibold ${tab === t ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
              {t === "kanban" ? "Kanban" : t === "worktime" ? "Worktime" : "Calendar"}
            </button>
          ))}
        </div>
      </header>

      {error ? <p className="mt-3 rounded-2xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {tab === "kanban" && (
        <section className="mt-4 space-y-4">
          <div className="flex snap-x gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:overflow-visible">
            {columns.map((statusKey) => {
              const list = tasks.filter((task) => task.status === statusKey);
              return (
                <article
                  key={statusKey}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => draggingTaskId && moveTask(draggingTaskId, statusKey)}
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
                      <article
                        key={task.id}
                        draggable
                        onDragStart={() => setDraggingTaskId(task.id)}
                        onDragEnd={() => setDraggingTaskId(null)}
                        onTouchStart={() => setDraggingTaskId(task.id)}
                        className={`rounded-2xl border border-slate-200 bg-white p-3 ${selectedTaskId === task.id ? "ring-2 ring-slate-400" : ""}`}
                      >
                        <button onClick={() => setSelectedTaskId(task.id)} className="w-full text-left">
                          <p className="text-base font-semibold">{task.title}</p>
                          <p className="mt-1 text-xs text-slate-600">Project: {task.project || "-"}</p>
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
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          {selectedTask ? (
            <section className="rounded-3xl border border-white/70 bg-white/88 p-4 shadow-[0_8px_24px_rgba(52,82,120,0.12)]">
              <h3 className="text-lg font-semibold">Selected Task</h3>
              <p className="mt-2 text-sm text-slate-700">{selectedTask.title}</p>
              <p className="text-sm text-slate-600">Project: {selectedTask.project || "-"}</p>
              <p className="text-sm text-slate-600">Owner: {selectedTask.ownerEmail || "-"}</p>
              <p className="text-sm text-slate-600">Started: {fmt(selectedTask.startedOn)}</p>
              <p className="text-sm text-slate-600">Finished: {fmt(selectedTask.finishedOn)}</p>
              <p className="mt-2 text-sm text-slate-600">Description: {selectedTask.description || "-"}</p>
            </section>
          ) : null}
        </section>
      )}

      {tab === "worktime" && (
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
            <p className="text-sm text-slate-300">Project: {activeTask?.project || "-"}</p>
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

      {tab === "calendar" && (
        <section className="mt-4 grid gap-3 md:grid-cols-2">
          <article className="rounded-3xl border border-white/70 bg-white/88 p-4 shadow-[0_8px_24px_rgba(52,82,120,0.12)]">
            <h2 className="text-lg font-semibold">Calendar Integration</h2>
            <p className="mt-2 text-sm text-slate-700">One-way export is live now. Subscribe this feed in Google Calendar.</p>
            <code className="mt-3 block rounded-xl bg-slate-100 px-3 py-2 text-xs">http://188.212.125.163:3000/api/lifeos/calendar/tasks.ics</code>
            <a className="mt-3 inline-block rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white" href="/api/lifeos/calendar/tasks.ics" target="_blank" rel="noreferrer">Open ICS Feed</a>
          </article>
          <article className="rounded-3xl border border-white/70 bg-white/88 p-4 shadow-[0_8px_24px_rgba(52,82,120,0.12)]">
            <h2 className="text-lg font-semibold">Identity</h2>
            <p className="mt-2 text-sm text-slate-700">Authenticated via OAuth session only. No local password login.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => signIn("google")} disabled={!availableProviders.google} className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:bg-slate-100">Continue with Google</button>
              <button onClick={() => signIn("apple")} disabled={!availableProviders.apple} className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:bg-slate-100">Continue with Apple</button>
            </div>
          </article>
        </section>
      )}

      {createOpen ? (
        <section className="fixed inset-0 z-30 flex items-end bg-black/40 p-3 md:items-center md:justify-center">
          <form onSubmit={createTask} className="w-full max-w-xl rounded-3xl bg-white p-4 shadow-2xl">
            <h3 className="mb-3 text-lg font-semibold">Create Task</h3>
            <div className="grid gap-2 md:grid-cols-2">
              <input required value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2" placeholder="Task title" />
              <input value={taskForm.project} onChange={(e) => setTaskForm((p) => ({ ...p, project: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2" placeholder="Project" />
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

      {editingTask ? (
        <section className="fixed inset-0 z-30 flex items-end bg-black/40 p-3 md:items-center md:justify-center">
          <form onSubmit={saveEdit} className="w-full max-w-xl rounded-3xl bg-white p-4 shadow-2xl">
            <h3 className="mb-3 text-lg font-semibold">Edit Task</h3>
            <div className="grid gap-2 md:grid-cols-2">
              <input required value={editingValues.title} onChange={(e) => setEditingValues((p) => ({ ...p, title: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2" />
              <input value={editingValues.project} onChange={(e) => setEditingValues((p) => ({ ...p, project: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2" />
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
