import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "reactflow";
import {
  ChevronsLeft,
  Chrome,
  ClipboardList,
  Cog,
  LogOut,
  Moon,
  PhoneCall,
  Play,
  Settings2,
  Sparkles,
  Sun,
  UserRound,
  Workflow,
} from "lucide-react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import "reactflow/dist/style.css";
import {getDashboardFirebaseApp} from "./firebase.js";
import {VoiceRails} from "@voicerails/sdk";
import {BrandWordmark} from "./components/brand.js";
import {Badge} from "./components/ui/badge.js";
import {Button} from "./components/ui/button.js";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "./components/ui/card.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu.js";
import {Input} from "./components/ui/input.js";
import {Label} from "./components/ui/label.js";
import {Textarea} from "./components/ui/textarea.js";
import {cn} from "./lib/utils.js";

type ThemeMode = "dark" | "light";
type AuthMode = "login" | "register";
type AppSection = "overview" | "workflows" | "sessions" | "calls" | "settings";
type StageType = "greeting" | "conversation" | "extraction" | "condition" | "action" | "memory" | "handoff" | "end";

type StageNodeData = {
  label: string;
  stageType: StageType;
  description: string;
};

type WorkflowLike = {
  id: string;
  name?: string;
  definition?: {
    stages?: Array<Record<string, unknown>>;
  };
};

type AuthUserState = {
  uid: string;
  email: string;
  provider: "firebase" | "local";
};

const AUTH_STORAGE_KEY = "voicerails.dashboard.auth";
const API_KEY_STORAGE_KEY = "voicerails.dashboard.apiKey";
const API_BASE_STORAGE_KEY = "voicerails.dashboard.baseUrl";
const THEME_STORAGE_KEY = "voicerails.dashboard.theme";

const STAGE_OPTIONS: Array<{type: StageType; label: string; description: string; tone: string}> = [
  {type: "greeting", label: "Greeting", description: "Welcome and establish context.", tone: "#22D3A7"},
  {type: "conversation", label: "Conversation", description: "Collect intent and continue dialogue.", tone: "#3B82F6"},
  {type: "extraction", label: "Extraction", description: "Capture structured fields from speech.", tone: "#EC4899"},
  {type: "condition", label: "Condition", description: "Branch based on rules and memory state.", tone: "#F59E0B"},
  {type: "action", label: "Action", description: "Trigger API, webhook, or external connector.", tone: "#A78BFA"},
  {type: "memory", label: "Memory", description: "Read/write memory and profile context.", tone: "#22D3A7"},
  {type: "handoff", label: "Handoff", description: "Transfer to human or fallback queue.", tone: "#FB7185"},
  {type: "end", label: "End", description: "Graceful session completion.", tone: "#64748B"},
];

const STAGE_OPTIONS_BY_TYPE = new Map(STAGE_OPTIONS.map((stage) => [stage.type, stage]));

const NAV_ITEMS: Array<{id: AppSection; label: string; icon: typeof Sparkles}> = [
  {id: "overview", label: "Overview", icon: Sparkles},
  {id: "workflows", label: "Workflow Builder", icon: Workflow},
  {id: "sessions", label: "Sessions", icon: ClipboardList},
  {id: "calls", label: "Calls", icon: PhoneCall},
  {id: "settings", label: "Settings", icon: Cog},
];

const NODE_TYPES = {workflow: WorkflowNode};

const initialNodes: Node<StageNodeData>[] = [
  createStageNode("start", "greeting", {x: 80, y: 140}),
  createStageNode("extract", "extraction", {x: 360, y: 140}),
  createStageNode("end", "end", {x: 640, y: 140}),
];

const initialEdges: Edge[] = [
  {id: "e-start-extract", source: "start", target: "extract", type: "smoothstep", animated: true},
  {id: "e-extract-end", source: "extract", target: "end", type: "smoothstep", animated: true},
];

export function App() {
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const firebaseApp = getDashboardFirebaseApp();

  const [nodes, setNodes, onNodesChange] = useNodesState<StageNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "dark";
    }
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" ? "light" : "dark";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<AppSection>("workflows");

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://us-central1-voicerails8.cloudfunctions.net/api");
  const [workflowName, setWorkflowName] = useState("Dashboard Flow");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [sessions, setSessions] = useState<unknown[]>([]);
  const [calls, setCalls] = useState<unknown[]>([]);
  const [workflows, setWorkflows] = useState<unknown[]>([]);
  const [statusMessage, setStatusMessage] = useState("Idle");

  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authUser, setAuthUser] = useState<AuthUserState | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const savedApiKey = window.localStorage.getItem(API_KEY_STORAGE_KEY);
    const savedBaseUrl = window.localStorage.getItem(API_BASE_STORAGE_KEY);
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
    if (savedBaseUrl) {
      setBaseUrl(savedBaseUrl);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  }, [apiKey]);

  useEffect(() => {
    window.localStorage.setItem(API_BASE_STORAGE_KEY, baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    if (!firebaseApp) {
      const localUserRaw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (localUserRaw) {
        try {
          const localUser = JSON.parse(localUserRaw) as AuthUserState;
          if (localUser?.email) {
            setAuthUser(localUser);
          }
        } catch {
          window.localStorage.removeItem(AUTH_STORAGE_KEY);
        }
      }
      setAuthLoading(false);
      return;
    }

    const auth = getAuth(firebaseApp);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user?.email) {
        setAuthUser(null);
      } else {
        setAuthUser({
          uid: user.uid,
          email: user.email,
          provider: "firebase",
        });
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [firebaseApp]);

  const workflowDefinition = useMemo(() => {
    const sortedNodes = [...nodes].sort((a, b) => {
      if (a.position.x === b.position.x) {
        return a.position.y - b.position.y;
      }
      return a.position.x - b.position.x;
    });

    return {
      version: "1.0" as const,
      name: workflowName.trim() || "Dashboard Flow",
      stages: sortedNodes.map((node) => ({
        id: node.id,
        type: node.data.stageType,
        label: node.data.label,
        description: node.data.description,
        next: edges.find((edge) => edge.source === node.id)?.target,
      })),
    };
  }, [nodes, edges, workflowName]);

  const workflowJson = useMemo(() => JSON.stringify(workflowDefinition, null, 2), [workflowDefinition]);
  const workflowOptions = useMemo(() => workflows.filter(isWorkflowLike), [workflows]);
  const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null;

  const removeSelectedNode = useCallback(() => {
    if (!selectedNodeId) {
      return;
    }
    setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId, setNodes, setEdges]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!selectedNodeId || event.key !== "Delete") {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") {
        return;
      }
      removeSelectedNode();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNodeId, removeSelectedNode]);

  function onConnect(connection: Edge | Connection) {
    setEdges((current) => addEdge({...connection, type: "smoothstep", animated: true}, current));
  }

  function createNode(type: StageType, position: {x: number; y: number}): Node<StageNodeData> {
    return createStageNode(`${type}_${Date.now()}`, type, position);
  }

  function addStage(type: StageType) {
    const nextNode = createNode(type, {x: 240 + nodes.length * 64, y: 280 + nodes.length * 8});
    setNodes((current) => [...current, nextNode]);
    if (selectedNodeId) {
      setEdges((current) =>
        addEdge(
          {
            id: `e-${selectedNodeId}-${nextNode.id}`,
            source: selectedNodeId,
            target: nextNode.id,
            type: "smoothstep",
            animated: true,
          },
          current,
        ),
      );
    }
    setSelectedNodeId(nextNode.id);
  }

  function onDragStart(event: React.DragEvent<HTMLButtonElement>, stageType: StageType) {
    event.dataTransfer.setData("application/voicerails-stage", stageType);
    event.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const stageType = event.dataTransfer.getData("application/voicerails-stage") as StageType;
    if (!stageType || !flowWrapperRef.current || !reactFlowInstance) {
      return;
    }
    const bounds = flowWrapperRef.current.getBoundingClientRect();
    const position = reactFlowInstance.project({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    const nextNode = createNode(stageType, position);
    setNodes((current) => [...current, nextNode]);
    if (selectedNodeId) {
      setEdges((current) =>
        addEdge(
          {
            id: `e-${selectedNodeId}-${nextNode.id}`,
            source: selectedNodeId,
            target: nextNode.id,
            type: "smoothstep",
            animated: true,
          },
          current,
        ),
      );
    }
    setSelectedNodeId(nextNode.id);
  }

  function updateSelectedNode(patch: Partial<StageNodeData>) {
    if (!selectedNodeId) {
      return;
    }
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== selectedNodeId) {
          return node;
        }
        const stageType = patch.stageType ?? node.data.stageType;
        return {
          ...node,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            ...node.data,
            ...patch,
          },
          style: nodeStyleFor(stageType),
        };
      }),
    );
  }

  function autoLayout() {
    const ordered = [...nodes].sort((a, b) => {
      if (a.position.x === b.position.x) {
        return a.position.y - b.position.y;
      }
      return a.position.x - b.position.x;
    });

    setNodes(
      ordered.map((node, index) => ({
        ...node,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        position: {
          x: 80 + (index % 3) * 300,
          y: 130 + Math.floor(index / 3) * 190,
        },
      })),
    );
  }

  async function loadControlPlaneData() {
    if (!apiKey.trim()) {
      setStatusMessage("Enter API key first");
      return;
    }
    try {
      setStatusMessage("Loading sessions, calls, and workflows...");
      const client = new VoiceRails({apiKey, baseUrl});
      const [nextSessions, nextCalls, nextWorkflows] = await Promise.all([
        client.sessions.list(),
        client.calls.list(),
        client.workflows.list(),
      ]);
      setSessions(nextSessions as unknown[]);
      setCalls(nextCalls as unknown[]);
      setWorkflows(nextWorkflows as unknown[]);
      if (!selectedWorkflowId && (nextWorkflows as Array<{id?: string}>)[0]?.id) {
        const firstWorkflow = nextWorkflows[0] as WorkflowLike;
        setSelectedWorkflowId(firstWorkflow.id);
        if (firstWorkflow.name) {
          setWorkflowName(firstWorkflow.name);
        }
      }
      setStatusMessage("Data loaded");
    } catch (error) {
      setStatusMessage(`Load failed: ${(error as Error).message}`);
    }
  }

  async function saveWorkflow(mode: "create" | "update") {
    if (!apiKey.trim()) {
      setStatusMessage("Enter API key first");
      return;
    }
    if (mode === "update" && !selectedWorkflowId) {
      setStatusMessage("Choose a workflow to update");
      return;
    }

    try {
      const client = new VoiceRails({apiKey, baseUrl});
      setStatusMessage(mode === "create" ? "Creating workflow..." : "Updating workflow...");
      if (mode === "create") {
        const created = await client.workflows.create({
          name: workflowDefinition.name,
          definition: workflowDefinition,
        });
        setSelectedWorkflowId(created.id);
      } else {
        await client.workflows.update(selectedWorkflowId, {
          definition: workflowDefinition,
        });
      }
      const nextWorkflows = await client.workflows.list();
      setWorkflows(nextWorkflows as unknown[]);
      setStatusMessage(mode === "create" ? "Workflow created" : "Workflow updated");
    } catch (error) {
      setStatusMessage(`Save failed: ${(error as Error).message}`);
    }
  }

  function loadWorkflowIntoCanvas() {
    if (!selectedWorkflowId) {
      setStatusMessage("Select a workflow first");
      return;
    }
    const selectedWorkflow = workflowOptions.find((workflow) => workflow.id === selectedWorkflowId);
    if (!selectedWorkflow?.definition?.stages?.length) {
      setStatusMessage("Selected workflow has no stages");
      return;
    }

    const nextNodes = selectedWorkflow.definition.stages.map((stage, index) => {
      const stageId = String(stage.id ?? `stage_${index}`);
      const stageType = normalizeStageType(stage.type);
      return createStageNode(
        stageId,
        stageType,
        {x: 80 + (index % 3) * 300, y: 130 + Math.floor(index / 3) * 190},
        {
          label: String(stage.label ?? STAGE_OPTIONS_BY_TYPE.get(stageType)?.label ?? stageType),
          description: String(stage.description ?? STAGE_OPTIONS_BY_TYPE.get(stageType)?.description ?? ""),
        },
      );
    });

    const nextEdges = selectedWorkflow.definition.stages.reduce<Edge[]>((acc, stage) => {
      const source = String(stage.id ?? "");
      const target = typeof stage.next === "string" ? stage.next : "";
      if (!source || !target) {
        return acc;
      }
      acc.push({
        id: `e-${source}-${target}`,
        source,
        target,
        type: "smoothstep",
        animated: true,
      });
      return acc;
    }, []);

    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNodeId(nextNodes[0]?.id ?? null);
    if (selectedWorkflow.name) {
      setWorkflowName(selectedWorkflow.name);
    }
    setStatusMessage(`Loaded workflow ${selectedWorkflow.id}`);
    queueMicrotask(() => reactFlowInstance?.fitView({padding: 0.2, duration: 250}));
  }

  async function handleAuthSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAuthError("");
    const email = authEmail.trim();
    const password = authPassword.trim();
    if (!email || !password) {
      setAuthError("Email and password are required.");
      return;
    }

    if (firebaseApp) {
      const auth = getAuth(firebaseApp);
      try {
        if (authMode === "login") {
          await signInWithEmailAndPassword(auth, email, password);
        } else {
          await createUserWithEmailAndPassword(auth, email, password);
        }
      } catch (error) {
        setAuthError((error as Error).message);
      }
      return;
    }

    const localUser: AuthUserState = {
      uid: `local_${Date.now()}`,
      email,
      provider: "local",
    };
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(localUser));
    setAuthUser(localUser);
  }

  async function handleGoogleLogin() {
    if (!firebaseApp) {
      setAuthError("Google login requires Firebase web auth config in .env.local.");
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(getAuth(firebaseApp), provider);
    } catch (error) {
      setAuthError((error as Error).message);
    }
  }

  async function handleLogout() {
    if (firebaseApp && authUser?.provider === "firebase") {
      await signOut(getAuth(firebaseApp));
    }
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthUser(null);
    setAuthPassword("");
  }

  function renderWorkflowBuilder() {
    return (
      <div className="grid h-full min-h-0 grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,2fr)_380px]">
        <Card className="min-h-0 overflow-hidden">
          <CardHeader className="border-b border-[var(--border)] pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="font-display text-3xl leading-none tracking-[-0.02em]">
                  Workflow Builder
                </CardTitle>
                <CardDescription className="mt-2 text-sm">
                  Rails-style voice flow editor with left/right connections and stage-level controls.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => reactFlowInstance?.fitView({padding: 0.2})}>
                  Fit View
                </Button>
                <Button variant="secondary" size="sm" onClick={autoLayout}>
                  Auto Layout
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {STAGE_OPTIONS.filter((stage) => stage.type !== "greeting" && stage.type !== "end").map((stage) => (
                <Button
                  key={stage.type}
                  variant="secondary"
                  size="sm"
                  draggable
                  onDragStart={(event) => onDragStart(event, stage.type)}
                  onClick={() => addStage(stage.type)}
                  className="border-[var(--border-bright)] bg-[var(--bg-elevated)]"
                >
                  <span className="size-2 rounded-full" style={{backgroundColor: stage.tone}} />
                  {stage.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="h-[calc(100%-170px)] p-0">
            <div
              ref={flowWrapperRef}
              className="h-full w-full"
              onDrop={onDrop}
              onDragOver={onDragOver}
            >
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                fitView
                snapToGrid
                snapGrid={[16, 16]}
                defaultEdgeOptions={{type: "smoothstep", animated: true}}
                onInit={setReactFlowInstance}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
                onPaneClick={() => setSelectedNodeId(null)}
              >
                <Background gap={20} color="var(--border)" />
                <MiniMap pannable zoomable />
                <Controls />
              </ReactFlow>
            </div>
          </CardContent>
        </Card>

        <div className="flex min-h-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Control Plane</CardTitle>
              <CardDescription>API credentials and environment target.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="vr_test_..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="base-url">API Base URL</Label>
                <Input
                  id="base-url"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </div>
              <Button className="w-full" onClick={loadControlPlaneData}>
                Load App Data
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Workflow Actions</CardTitle>
              <CardDescription>Create, load, and update workflow definitions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="workflow-name">Workflow Name</Label>
                <Input
                  id="workflow-name"
                  value={workflowName}
                  onChange={(event) => setWorkflowName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="existing-workflow">Existing Workflows</Label>
                <select
                  id="existing-workflow"
                  value={selectedWorkflowId}
                  onChange={(event) => setSelectedWorkflowId(event.target.value)}
                  className="flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-sm text-[var(--text-primary)]"
                >
                  <option value="">Select workflow...</option>
                  {workflowOptions.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.name ?? workflow.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Button variant="secondary" onClick={loadWorkflowIntoCanvas}>
                  Load to Canvas
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => saveWorkflow("create")}>
                    Create
                  </Button>
                  <Button variant="secondary" onClick={() => saveWorkflow("update")}>
                    Update
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 flex-1">
            <CardHeader>
              <CardTitle>Selected Stage</CardTitle>
              <CardDescription>Edit stage metadata and behaviour.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedNode ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Label</Label>
                    <Input
                      value={selectedNode.data.label}
                      onChange={(event) => updateSelectedNode({label: event.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <select
                      value={selectedNode.data.stageType}
                      onChange={(event) => {
                        const nextType = event.target.value as StageType;
                        const nextStage = STAGE_OPTIONS_BY_TYPE.get(nextType);
                        updateSelectedNode({
                          stageType: nextType,
                          description: nextStage?.description ?? selectedNode.data.description,
                        });
                      }}
                      className="flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-sm"
                    >
                      {STAGE_OPTIONS.map((stage) => (
                        <option key={stage.type} value={stage.type}>
                          {stage.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Textarea
                      rows={3}
                      value={selectedNode.data.description}
                      onChange={(event) => updateSelectedNode({description: event.target.value})}
                    />
                  </div>
                  <Button variant="destructive" onClick={removeSelectedNode}>
                    Remove Stage
                  </Button>
                </>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">Select a node in the canvas to edit it.</p>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-0">
            <CardHeader>
              <CardTitle>Workflow JSON</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-56 overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 font-mono text-xs text-[var(--text-secondary)]">
                {workflowJson}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  function renderOverview() {
    return (
      <div className="grid gap-4 p-4 md:grid-cols-3">
        <MetricCard label="Sessions" value={String(sessions.length)} />
        <MetricCard label="Calls" value={String(calls.length)} />
        <MetricCard label="Workflows" value={String(workflows.length)} />
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle className="font-display text-4xl tracking-[-0.02em]">
              Rails for voice AI.
            </CardTitle>
            <CardDescription>
              Ship production voice agents in minutes with workflow orchestration, telephony, and model routing in one control plane.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="accent">dark-mode native</Badge>
            <Badge variant="blue">gemini</Badge>
            <Badge variant="pink">elevenlabs</Badge>
            <Badge variant="orange">grok</Badge>
            <Button variant="secondary" size="sm" onClick={loadControlPlaneData}>
              Refresh Metrics
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderRecords(title: string, records: unknown[]) {
    return (
      <div className="p-4">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-3xl">{title}</CardTitle>
            <CardDescription>Latest records from the control plane API.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[60vh] overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-4 font-mono text-xs text-[var(--text-secondary)]">
              {JSON.stringify(records.slice(0, 40), null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="p-4">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-3xl">Settings</CardTitle>
            <CardDescription>
              Theme, environment and account controls. Light mode is optional and persisted.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Theme</Label>
              <div className="flex gap-2">
                <Button variant={theme === "dark" ? "default" : "secondary"} onClick={() => setTheme("dark")}>
                  <Moon className="size-4" />
                  Dark
                </Button>
                <Button variant={theme === "light" ? "default" : "secondary"} onClick={() => setTheme("light")}>
                  <Sun className="size-4" />
                  Light
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>API Endpoint</Label>
              <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>API Key</Label>
              <Input value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Button onClick={loadControlPlaneData}>Validate Connection</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderSection() {
    if (activeSection === "workflows") {
      return renderWorkflowBuilder();
    }
    if (activeSection === "sessions") {
      return renderRecords("Sessions", sessions);
    }
    if (activeSection === "calls") {
      return renderRecords("Calls", calls);
    }
    if (activeSection === "settings") {
      return renderSettings();
    }
    return renderOverview();
  }

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg)]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Loading VoiceRails...</CardTitle>
            <CardDescription>Checking authentication context.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg)] p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <BrandWordmark />
            <CardTitle className="font-display text-4xl tracking-[-0.02em]">Sign in to VoiceRails</CardTitle>
            <CardDescription>
              Production-grade voice workflow infrastructure for teams shipping fast.
            </CardDescription>
            {!firebaseApp ? (
              <Badge variant="orange">Firebase web config missing; local login mode active.</Badge>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            <form className="space-y-3" onSubmit={handleAuthSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="auth-email">Email</Label>
                <Input
                  id="auth-email"
                  type="email"
                  placeholder="you@company.com"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-password">Password</Label>
                <Input
                  id="auth-password"
                  type="password"
                  placeholder="Enter password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                />
              </div>
              {authError ? <p className="text-sm text-red-300">{authError}</p> : null}
              <Button className="w-full" type="submit">
                {authMode === "login" ? "Sign In" : "Create Account"}
              </Button>
            </form>
            <Button
              className="w-full"
              variant="secondary"
              type="button"
              onClick={handleGoogleLogin}
              disabled={!firebaseApp}
            >
              <Chrome className="size-4" />
              Continue with Google
            </Button>
            <Button
              className="w-full"
              variant="ghost"
              type="button"
              onClick={() => setAuthMode((current) => (current === "login" ? "register" : "login"))}
            >
              {authMode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentSection = NAV_ITEMS.find((item) => item.id === activeSection) ?? NAV_ITEMS[0];

  return (
    <div className="flex h-full bg-[var(--bg)] text-[var(--text-primary)]">
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-3 transition-[width] duration-300 ease-in-out",
          sidebarCollapsed ? "w-[76px]" : "w-[260px]",
        )}
      >
        <div className={cn("mb-3 flex items-center px-2", sidebarCollapsed ? "justify-center" : "justify-start")}>
          <BrandWordmark compact={sidebarCollapsed} />
        </div>
        <nav className="grid gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant={activeSection === item.id ? "default" : "ghost"}
                className={cn("justify-start", sidebarCollapsed && "justify-center px-0")}
                onClick={() => setActiveSection(item.id)}
              >
                <Icon className="size-4 shrink-0" />
                {!sidebarCollapsed ? <span>{item.label}</span> : null}
              </Button>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 px-1">
          <div className="relative h-9">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "absolute top-0 transform-gpu transition-[left,right,transform] duration-300 ease-in-out",
                sidebarCollapsed ? "left-0 rotate-180" : "right-0 rotate-0",
              )}
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <ChevronsLeft className="size-4 shrink-0" />
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className={cn("w-full justify-start", sidebarCollapsed && "justify-center px-0")}>
                <UserRound className="size-4 shrink-0" />
                {!sidebarCollapsed ? <span className="truncate">{authUser.email}</span> : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="font-mono text-[11px] uppercase tracking-[0.08em]">
                {authUser.provider === "firebase" ? "Firebase Auth" : "Local Auth"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setActiveSection("settings")}>
                <Settings2 className="mr-2 size-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4">
          <div>
            <h1 className="font-display text-4xl leading-none tracking-[-0.02em]">{currentSection.label}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Rails for voice AI. Ship production voice agents in minutes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={loadControlPlaneData}>
              <Play className="size-4" />
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Badge variant="accent">{statusMessage}</Badge>
          </div>
        </header>
        <section className="min-h-0 flex-1 overflow-auto">{renderSection()}</section>
      </main>
    </div>
  );
}

function WorkflowNode({data, selected}: NodeProps<StageNodeData>) {
  const tone = STAGE_OPTIONS_BY_TYPE.get(data.stageType)?.tone ?? "var(--accent)";
  return (
    <div
      className={cn(
        "min-w-[220px] rounded-xl border bg-[var(--bg-card)] px-4 py-3 text-left transition-colors",
        selected ? "border-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--border-bright)]",
      )}
      style={{boxShadow: selected ? "0 0 0 1px color-mix(in srgb, var(--accent) 65%, transparent)" : "none"}}
    >
      <Handle type="target" position={Position.Left} className="!border-[var(--accent)] !bg-[var(--bg)]" />
      <Handle type="source" position={Position.Right} className="!border-[var(--accent)] !bg-[var(--bg)]" />
      <div className="mb-1 flex items-center gap-2">
        <span className="size-2 rounded-full" style={{backgroundColor: tone}} />
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{data.stageType}</span>
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{data.label}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{data.description}</p>
    </div>
  );
}

function MetricCard({label, value}: {label: string; value: string}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono text-[11px] uppercase tracking-[0.08em]">{label}</CardDescription>
        <CardTitle className="font-display text-5xl leading-none tracking-[-0.02em]">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function createStageNode(
  id: string,
  stageType: StageType,
  position: {x: number; y: number},
  overrides?: {label?: string; description?: string},
): Node<StageNodeData> {
  const stage = STAGE_OPTIONS_BY_TYPE.get(stageType) ?? STAGE_OPTIONS[0];
  return {
    id,
    type: "workflow",
    position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      label: overrides?.label ?? stage.label,
      stageType,
      description: overrides?.description ?? stage.description,
    },
    style: nodeStyleFor(stageType),
  };
}

function nodeStyleFor(stageType: StageType): React.CSSProperties {
  const tone = STAGE_OPTIONS_BY_TYPE.get(stageType)?.tone ?? "#22D3A7";
  return {
    border: `1px solid color-mix(in srgb, ${tone} 40%, var(--border))`,
    borderLeftWidth: 4,
    borderRadius: 12,
    background: "var(--bg-card)",
  };
}

function isWorkflowLike(value: unknown): value is WorkflowLike {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybeWorkflow = value as {id?: unknown};
  return typeof maybeWorkflow.id === "string";
}

function normalizeStageType(value: unknown): StageType {
  const candidate = typeof value === "string" ? value.toLowerCase() : "";
  if (
    candidate === "greeting" ||
    candidate === "conversation" ||
    candidate === "extraction" ||
    candidate === "condition" ||
    candidate === "action" ||
    candidate === "memory" ||
    candidate === "handoff" ||
    candidate === "end"
  ) {
    return candidate;
  }
  return "conversation";
}
