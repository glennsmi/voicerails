import React, {useMemo, useState} from "react";
import ReactFlow, {Background, Controls, type Edge, type Node} from "reactflow";
import "reactflow/dist/style.css";

const initialNodes: Node[] = [
  {id: "start", position: {x: 50, y: 120}, data: {label: "Start"}, type: "input"},
  {id: "extract", position: {x: 280, y: 120}, data: {label: "Extraction"}},
  {id: "end", position: {x: 520, y: 120}, data: {label: "End"}, type: "output"},
];

const initialEdges: Edge[] = [
  {id: "e-start-extract", source: "start", target: "extract"},
  {id: "e-extract-end", source: "extract", target: "end"},
];

export function App() {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  const workflowJson = useMemo(() => {
    return JSON.stringify(
      {
        version: "1.0",
        name: "Dashboard Flow",
        stages: nodes.map((node, index) => ({
          id: node.id,
          type: index === 0 ? "greeting" : index === nodes.length - 1 ? "end" : "conversation",
          next: edges.find((edge) => edge.source === node.id)?.target,
        })),
      },
      null,
      2,
    );
  }, [nodes, edges]);

  return (
    <div style={{display: "grid", gridTemplateColumns: "2fr 1fr", height: "100vh"}}>
      <div>
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={setNodes as any} onEdgesChange={setEdges as any}>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      <div style={{padding: 16, borderLeft: "1px solid #e5e7eb", overflow: "auto"}}>
        <h2>Workflow JSON</h2>
        <pre>{workflowJson}</pre>
      </div>
    </div>
  );
}
