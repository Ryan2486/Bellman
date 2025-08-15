"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Play, Pause, RotateCcw, Plus, Trash2, Settings, Edit3, Zap, AlertTriangle } from "lucide-react"

interface Node {
  id: string
  x: number
  y: number
  distance: number
  previous: string | null
  predecessors: string[] // New: track all possible predecessors
  isStart: boolean
  isEnd: boolean
}

interface Edge {
  id: string
  from: string
  to: string
  weight: number
  isActive: boolean
  isHovered: boolean
}

interface AlgorithmStep {
  iteration: number
  updatedNode: string
  distance: number
  previous: string | null
  description: string
}

export default function BellmanFordVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [edgeWeight, setEdgeWeight] = useState<string>("1")
  const [isRunning, setIsRunning] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [algorithmSteps, setAlgorithmSteps] = useState<AlgorithmStep[]>([])
  const [mode, setMode] = useState<"add" | "connect" | "select" | "delete-edge" | "edit-edge">("add")
  const [optimizationMode, setOptimizationMode] = useState<"min" | "max">("min")
  const [startNode, setStartNode] = useState<string | null>(null)
  const [endNode, setEndNode] = useState<string | null>(null)
  const [optimalPath, setOptimalPath] = useState<string[]>([])
  const [allOptimalPaths, setAllOptimalPaths] = useState<string[][]>([])
  const [optimalDistance, setOptimalDistance] = useState<number | null>(null)
  const [hasNegativeCycle, setHasNegativeCycle] = useState(false)
  const [algorithmCompleted, setAlgorithmCompleted] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingEdge, setEditingEdge] = useState<Edge | null>(null)
  const [newWeight, setNewWeight] = useState<string>("")
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isLoaded, setIsLoaded] = useState(false)

  const CANVAS_WIDTH = 800
  const CANVAS_HEIGHT = 500
  const NODE_RADIUS = 25
  const STORAGE_KEY = "bellman-ford-session"

  // Interface for session data
  interface SessionData {
    nodes: Node[]
    edges: Edge[]
    startNode: string | null
    endNode: string | null
    optimizationMode: "min" | "max"
    edgeWeight: string
    mode: "add" | "connect" | "select" | "delete-edge" | "edit-edge"
    timestamp: number
  }

  // Save session to localStorage
  const saveSession = useCallback(() => {
    if (!isLoaded) return

    try {
      const sessionData: SessionData = {
        nodes,
        edges,
        startNode,
        endNode,
        optimizationMode,
        edgeWeight,
        mode,
        timestamp: Date.now()
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData))
    } catch (error) {
      console.warn("Error saving session:", error)
    }
  }, [nodes, edges, startNode, endNode, optimizationMode, edgeWeight, mode, isLoaded])

  // Load session from localStorage
  const loadSession = useCallback(() => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY)
      if (savedData) {
        const sessionData: SessionData = JSON.parse(savedData)

        // Check if the data is too old (optional, here 7 days)
        const daysSinceLastSave = (Date.now() - sessionData.timestamp) / (1000 * 60 * 60 * 24)
        if (daysSinceLastSave > 7) {
          localStorage.removeItem(STORAGE_KEY)
          return false
        }

        // Restore state
        setNodes(sessionData.nodes || [])
        setEdges(sessionData.edges || [])
        setStartNode(sessionData.startNode || null)
        setEndNode(sessionData.endNode || null)
        setOptimizationMode(sessionData.optimizationMode || "min")
        setEdgeWeight(sessionData.edgeWeight || "1")
        setMode(sessionData.mode || "add")

        return true
      }
    } catch (error) {
      console.warn("Error loading session:", error)
      localStorage.removeItem(STORAGE_KEY)
    }
    return false
  }, [])

  // Load session on startup
  useEffect(() => {
    const hasLoadedData = loadSession()
    setIsLoaded(true)

    if (hasLoadedData) {
      console.log("Session restored from localStorage")
    }
  }, [loadSession])

  // Auto-save when state changes
  useEffect(() => {
    saveSession()
  }, [saveSession])

  // Clean up session on beforeunload (optional)
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveSession()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [saveSession])

  // Generate a unique ID for edges
  const generateEdgeId = (from: string, to: string) => `${from}-${to}`

  // Find the edge closest to the cursor
  const findNearestEdge = (x: number, y: number): Edge | null => {
    let nearestEdge: Edge | null = null
    let minDistance = Number.POSITIVE_INFINITY

    edges.forEach((edge) => {
      const fromNode = nodes.find((n) => n.id === edge.from)
      const toNode = nodes.find((n) => n.id === edge.to)

      if (fromNode && toNode) {
        // Calculate the distance from the point to the line
        const A = x - fromNode.x
        const B = y - fromNode.y
        const C = toNode.x - fromNode.x
        const D = toNode.y - fromNode.y

        const dot = A * C + B * D
        const lenSq = C * C + D * D
        let param = -1
        if (lenSq !== 0) param = dot / lenSq

        let xx, yy

        if (param < 0) {
          xx = fromNode.x
          yy = fromNode.y
        } else if (param > 1) {
          xx = toNode.x
          yy = toNode.y
        } else {
          xx = fromNode.x + param * C
          yy = fromNode.y + param * D
        }

        const dx = x - xx
        const dy = y - yy
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < 15 && distance < minDistance) {
          minDistance = distance
          nearestEdge = edge
        }
      }
    })

    return nearestEdge
  }

  // Draw the graph
  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    const nodesInOptimalPaths = new Set<string>()
    // Get all nodes that are part of optimal paths
    if (algorithmCompleted && allOptimalPaths.length > 0) {
      allOptimalPaths.forEach(path => {
        path.forEach(nodeId => nodesInOptimalPaths.add(nodeId))
      })
    }

    // Draw edges
    edges.forEach((edge) => {
      const fromNode = nodes.find((n) => n.id === edge.from)
      const toNode = nodes.find((n) => n.id === edge.to)

      if (fromNode && toNode) {
        ctx.beginPath()
        ctx.moveTo(fromNode.x, fromNode.y)
        ctx.lineTo(toNode.x, toNode.y)

        // Check if this edge is part of ANY optimal path
        const isInOptimalPath = algorithmCompleted &&
          allOptimalPaths.some(path =>
            path.some((nodeId, index) =>
              index < path.length - 1 &&
              path[index] === edge.from &&
              path[index + 1] === edge.to
            )
          )

        // Styles according to state
        if (isInOptimalPath) {
          ctx.strokeStyle = "#10b981" // Emerald green for optimal edges
          ctx.lineWidth = 5
          ctx.shadowColor = "#10b981"
          ctx.shadowBlur = 8
        } else if (edge.isActive) {
          ctx.strokeStyle = "#ef4444"
          ctx.lineWidth = 3
        } else if (edge.isHovered || selectedEdge === edge.id) {
          ctx.strokeStyle = "#f59e0b"
          ctx.lineWidth = 3
        } else {
          ctx.strokeStyle = "#6b7280"
          ctx.lineWidth = 2
        }

        ctx.stroke()
        ctx.shadowBlur = 0 // Reset shadow

        // Arrow
        const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x)
        const arrowLength = 15
        const arrowX = toNode.x - Math.cos(angle) * (NODE_RADIUS + 5)
        const arrowY = toNode.y - Math.sin(angle) * (NODE_RADIUS + 5)

        ctx.beginPath()
        ctx.moveTo(arrowX, arrowY)
        ctx.lineTo(
          arrowX - arrowLength * Math.cos(angle - Math.PI / 6),
          arrowY - arrowLength * Math.sin(angle - Math.PI / 6),
        )
        ctx.moveTo(arrowX, arrowY)
        ctx.lineTo(
          arrowX - arrowLength * Math.cos(angle + Math.PI / 6),
          arrowY - arrowLength * Math.sin(angle + Math.PI / 6),
        )
        ctx.stroke()

        // Edge weight with enhanced style
        const midX = (fromNode.x + toNode.x) / 2
        const midY = (fromNode.y + toNode.y) / 2

        // Background of the weight
        if (isInOptimalPath) {
          ctx.fillStyle = "#dcfce7" // Light green background
          ctx.strokeStyle = "#10b981" // Green border
          ctx.lineWidth = 3
        } else if (edge.isHovered || selectedEdge === edge.id) {
          ctx.fillStyle = "#fef3c7"
          ctx.strokeStyle = "#f59e0b"
        } else {
          ctx.fillStyle = "#ffffff"
          ctx.strokeStyle = "#374151"
        }

        ctx.fillRect(midX - 20, midY - 14, 40, 28)
        ctx.strokeRect(midX - 20, midY - 14, 40, 28)

        // Weight text
        ctx.fillStyle = isInOptimalPath ? "#065f46" : "#374151" // Dark green text if optimal
        ctx.font = isInOptimalPath ? "bold 14px Arial" : "bold 12px Arial"
        ctx.textAlign = "center"
        ctx.fillText((edge.weight || 0).toString(), midX, midY + 4)
      }
    })

    // Draw nodes
    nodes.forEach((node) => {
      const isInOptimalPath = nodesInOptimalPaths.has(node.id)

      ctx.beginPath()
      ctx.arc(node.x, node.y, NODE_RADIUS, 0, 2 * Math.PI)

      // Node color with gradient
      if (node.isStart) {
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, NODE_RADIUS)
        gradient.addColorStop(0, "#34d399")
        gradient.addColorStop(1, "#10b981")
        ctx.fillStyle = gradient
      } else if (node.isEnd) {
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, NODE_RADIUS)
        gradient.addColorStop(0, "#f87171")
        gradient.addColorStop(1, "#ef4444")
        ctx.fillStyle = gradient
      } else if (selectedNode === node.id) {
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, NODE_RADIUS)
        gradient.addColorStop(0, "#60a5fa")
        gradient.addColorStop(1, "#3b82f6")
        ctx.fillStyle = gradient
      } else if (isInOptimalPath) {
        // Nodes in optimal paths - golden/orange color
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, NODE_RADIUS)
        gradient.addColorStop(0, "#fbbf24") // Light yellow/orange
        gradient.addColorStop(1, "#d97706") // Dark orange
        ctx.fillStyle = gradient
      } else {
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, NODE_RADIUS)
        gradient.addColorStop(0, "#f3f4f6")
        gradient.addColorStop(1, "#e5e7eb")
        ctx.fillStyle = gradient
      }

      ctx.fill()

      // Special border for optimal nodes
      if (isInOptimalPath && !node.isStart && !node.isEnd) {
        ctx.strokeStyle = "#92400e" // Dark orange border
        ctx.lineWidth = 3
        ctx.shadowColor = "#d97706"
        ctx.shadowBlur = 6
      } else {
        ctx.strokeStyle = "#374151"
        ctx.lineWidth = 2
        ctx.shadowBlur = 0
      }
      ctx.stroke()
      ctx.shadowBlur = 0 // Reset shadow

      // Node ID
      ctx.fillStyle = isInOptimalPath && !node.isStart && !node.isEnd ? "#92400e" : "#374151"
      ctx.font = isInOptimalPath ? "bold 18px Arial" : "bold 16px Arial"
      ctx.textAlign = "center"
      ctx.fillText(node.id, node.x, node.y - 2)

      // Distance
      if (node.distance !== Number.POSITIVE_INFINITY) {
        ctx.font = isInOptimalPath ? "bold 14px Arial" : "12px Arial"
        ctx.fillStyle = isInOptimalPath ? "#92400e" : "#6b7280"
        ctx.fillText(node.distance === Number.POSITIVE_INFINITY ? "∞" : (node.distance || 0).toString(), node.x, node.y + 14)
      }

      // Icons for start and end
      if (node.isStart) {
        ctx.font = "16px Arial"
        ctx.fillText("🚀", node.x + NODE_RADIUS - 5, node.y - NODE_RADIUS + 10)
      }
      if (node.isEnd) {
        ctx.font = "16px Arial"
        ctx.fillText("🎯", node.x + NODE_RADIUS - 5, node.y - NODE_RADIUS + 10)
      }

      // Special indicator for optimal nodes (star)
      if (isInOptimalPath && !node.isStart && !node.isEnd) {
        ctx.font = "12px Arial"
        ctx.fillText("⭐", node.x + NODE_RADIUS - 8, node.y - NODE_RADIUS + 12)
      }
    })

    // Current connection line
    if (connectingFrom && mode === "connect") {
      const fromNode = nodes.find((n) => n.id === connectingFrom)
      if (fromNode) {
        ctx.beginPath()
        ctx.moveTo(fromNode.x, fromNode.y)
        ctx.lineTo(mousePos.x, mousePos.y)
        ctx.strokeStyle = "#3b82f6"
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }, [nodes, edges, selectedNode, selectedEdge, allOptimalPaths, algorithmCompleted, connectingFrom, mode, mousePos])

  // Mouse move handler
  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    setMousePos({ x, y })

    // Highlight edges on hover
    if (mode === "delete-edge" || mode === "edit-edge") {
      const nearestEdge = findNearestEdge(x, y)
      setEdges((prevEdges) =>
        prevEdges.map((edge) => ({
          ...edge,
          isHovered: nearestEdge ? edge.id === nearestEdge.id : false,
        })),
      )
    } else {
      setEdges((prevEdges) => prevEdges.map((edge) => ({ ...edge, isHovered: false })))
    }
  }

  // Click handler on canvas
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    // Check if clicking on an existing node
    const clickedNode = nodes.find((node) => {
      const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2)
      return distance <= NODE_RADIUS
    })

    // Check if clicking on an edge
    const clickedEdge = findNearestEdge(x, y)

    if (mode === "add" && !clickedNode && !clickedEdge) {
      // Add a new node
      const newId = String.fromCharCode(65 + nodes.length)
      const newNode: Node = {
        id: newId,
        x,
        y,
        distance: Number.POSITIVE_INFINITY,
        previous: null,
        predecessors: [], // Initialize as empty array
        isStart: false,
        isEnd: false,
      }
      setNodes([...nodes, newNode])
    } else if (mode === "connect" && clickedNode) {
      if (!connectingFrom) {
        setConnectingFrom(clickedNode.id)
      } else if (connectingFrom !== clickedNode.id) {
        // Check if the connection already exists
        const existingEdge = edges.find((edge) => edge.from === connectingFrom && edge.to === clickedNode.id)
        if (!existingEdge) {
          const weight = Number.parseInt(edgeWeight) || 1
          const newEdge: Edge = {
            id: generateEdgeId(connectingFrom, clickedNode.id),
            from: connectingFrom,
            to: clickedNode.id,
            weight,
            isActive: false,
            isHovered: false,
          }
          setEdges([...edges, newEdge])
        }
        setConnectingFrom(null)
      }
    } else if (mode === "select" && clickedNode) {
      setSelectedNode(clickedNode.id)
      setSelectedEdge(null)
    } else if (mode === "delete-edge" && clickedEdge) {
      setEdges(edges.filter((edge) => edge.id !== clickedEdge.id))
      setSelectedEdge(null)
    } else if (mode === "edit-edge" && clickedEdge) {
      setEditingEdge(clickedEdge)
      setNewWeight((clickedEdge.weight || 0).toString())
      setShowEditDialog(true)
    } else if (mode === "select" && clickedEdge) {
      setSelectedEdge(clickedEdge.id)
      setSelectedNode(null)
    }
  }

  // Save edge weight edit
  const saveEdgeEdit = () => {
    if (!editingEdge) return

    const weight = Number.parseInt(newWeight)
    if (isNaN(weight)) return

    setEdges((prevEdges) => prevEdges.map((edge) => (edge.id === editingEdge.id ? { ...edge, weight } : edge)))

    setShowEditDialog(false)
    setEditingEdge(null)
    setNewWeight("")
  }

  // Function to find all shortest paths using DFS
  const findAllShortestPaths = (
    nodePredecessors: { [key: string]: string[] },
    startNodeId: string,
    endNodeId: string
  ): string[][] => {
    const allPaths: string[][] = []

    const dfs = (currentPath: string[], currentNode: string) => {
      if (currentNode === startNodeId) {
        allPaths.push([...currentPath].reverse())
        return
      }

      const predecessors = nodePredecessors[currentNode] || []
      for (const predecessor of predecessors) {
        currentPath.push(predecessor)
        dfs(currentPath, predecessor)
        currentPath.pop()
      }
    }

    dfs([endNodeId], endNodeId)
    return allPaths
  }

  // Enhanced Bellman-Ford algorithm with MIN/MAX mode support
  const runBellmanFord = () => {
    if (!startNode || !endNode) return

    setAlgorithmCompleted(false)
    setOptimalPath([])
    setAllOptimalPaths([])
    setOptimalDistance(null)
    setHasNegativeCycle(false)

    const steps: AlgorithmStep[] = []
    const nodeDistances: { [key: string]: number } = {}
    const nodePredecessors: { [key: string]: string[] } = {}

    // Initialization based on mode (MIN/MAX)
    nodes.forEach((node) => {
      if (optimizationMode === "min") {
        nodeDistances[node.id] = node.id === startNode ? 0 : Number.POSITIVE_INFINITY
      } else {
        // MAX mode: start with -∞ and source node at 0
        nodeDistances[node.id] = node.id === startNode ? 0 : Number.NEGATIVE_INFINITY
      }
      nodePredecessors[node.id] = []
    })

    // Relaxation of edges (V-1 times)
    for (let i = 0; i < nodes.length - 1; i++) {
      let updated = false

      edges.forEach((edge) => {
        const fromDistance = nodeDistances[edge.from]
        const toDistance = nodeDistances[edge.to]
        const newDistance = fromDistance + edge.weight

        // Condition based on optimization mode
        const shouldUpdate = optimizationMode === "min"
          ? (fromDistance !== Number.POSITIVE_INFINITY && newDistance < toDistance)
          : (fromDistance !== Number.NEGATIVE_INFINITY && newDistance > toDistance)

        const isEqual = optimizationMode === "min"
          ? (fromDistance !== Number.POSITIVE_INFINITY && newDistance === toDistance)
          : (fromDistance !== Number.NEGATIVE_INFINITY && newDistance === toDistance)

        if (shouldUpdate) {
          // Found a better path - replace all predecessors
          nodeDistances[edge.to] = newDistance
          nodePredecessors[edge.to] = [edge.from]
          updated = true

          const actionType = optimizationMode === "min" ? "Relaxation" : "Amélioration"
          steps.push({
            iteration: i + 1,
            updatedNode: edge.to,
            distance: newDistance,
            previous: edge.from,
            description: `${actionType}: ${edge.from} → ${edge.to} (distance: ${newDistance})`,
          })
        } else if (isEqual && !nodePredecessors[edge.to].includes(edge.from)) {
          // Found an equal path - add to predecessors
          nodePredecessors[edge.to].push(edge.from)

          steps.push({
            iteration: i + 1,
            updatedNode: edge.to,
            distance: newDistance,
            previous: edge.from,
            description: `Chemin alternatif: ${edge.from} → ${edge.to} (distance: ${newDistance})`,
          })
        }
      })

      if (!updated) break
    }

    // Cycle detection based on mode
    let hasCycle = false
    if (optimizationMode === "min") {
      // Negative cycle detection (MIN mode)
      edges.forEach((edge) => {
        const fromDistance = nodeDistances[edge.from]
        const toDistance = nodeDistances[edge.to]
        const newDistance = fromDistance + edge.weight

        if (fromDistance !== Number.POSITIVE_INFINITY && newDistance < toDistance) {
          hasCycle = true
          steps.push({
            iteration: nodes.length,
            updatedNode: edge.to,
            distance: Number.NEGATIVE_INFINITY,
            previous: null,
            description: `Cycle négatif détecté!`,
          })
        }
      })
    } else {
      // Positive cycle detection (MAX mode)
      edges.forEach((edge) => {
        const fromDistance = nodeDistances[edge.from]
        const toDistance = nodeDistances[edge.to]
        const newDistance = fromDistance + edge.weight

        if (fromDistance !== Number.NEGATIVE_INFINITY && newDistance > toDistance) {
          hasCycle = true
          steps.push({
            iteration: nodes.length,
            updatedNode: edge.to,
            distance: Number.POSITIVE_INFINITY,
            previous: null,
            description: `Cycle positif détecté!`,
          })
        }
      })
    }

    setHasNegativeCycle(hasCycle)
    setAlgorithmSteps(steps)
    setCurrentStep(0)

    // Find all optimal paths
    const endNodeDistance = nodeDistances[endNode]
    const isValidDistance = optimizationMode === "min"
      ? endNodeDistance !== Number.POSITIVE_INFINITY
      : endNodeDistance !== Number.NEGATIVE_INFINITY

    if (!hasCycle && isValidDistance) {
      const allPaths = findAllShortestPaths(nodePredecessors, startNode, endNode)

      setAllOptimalPaths(allPaths)
      setOptimalPath(allPaths[0] || [])
      setOptimalDistance(endNodeDistance)

      // Update nodes with all predecessors
      setNodes((prevNodes) =>
        prevNodes.map((node) => ({
          ...node,
          distance: nodeDistances[node.id],
          predecessors: nodePredecessors[node.id] || [],
          previous: nodePredecessors[node.id]?.[0] || null,
        }))
      )
    } else {
      setOptimalPath([])
      setAllOptimalPaths([])
      setOptimalDistance(null)
    }
  }

  // Algorithm animation (same code as before)
  useEffect(() => {
    if (isRunning && currentStep < algorithmSteps.length) {
      const timer = setTimeout(() => {
        const step = algorithmSteps[currentStep]

        setNodes((prevNodes) =>
          prevNodes.map((node) => {
            if (node.id === step.updatedNode) {
              return {
                ...node,
                distance: step.distance,
                previous: step.previous,
              }
            }
            return node
          }),
        )

        setEdges((prevEdges) =>
          prevEdges.map((edge) => ({
            ...edge,
            isActive: Boolean(step.previous && edge.from === step.previous && edge.to === step.updatedNode),
          })),
        )

        setCurrentStep(currentStep + 1)
      }, 1000)

      return () => clearTimeout(timer)
    } else if (currentStep >= algorithmSteps.length && isRunning) {
      setIsRunning(false)
      setAlgorithmCompleted(true)
      setEdges((prevEdges) => prevEdges.map((edge) => ({ ...edge, isActive: false })))
    }
  }, [isRunning, currentStep, algorithmSteps])

  // Redraw the graph when data changes
  useEffect(() => {
    drawGraph()
  }, [drawGraph])

  // Set the start node
  const setAsStart = () => {
    if (!selectedNode) return
    setNodes(
      nodes.map((node) => ({
        ...node,
        isStart: node.id === selectedNode,
        distance: node.id === selectedNode ? 0 : Number.POSITIVE_INFINITY,
        previous: null,
      })),
    )
    setStartNode(selectedNode)
  }

  // Set the end node
  const setAsEnd = () => {
    if (!selectedNode) return
    setNodes(
      nodes.map((node) => ({
        ...node,
        isEnd: node.id === selectedNode,
      })),
    )
    setEndNode(selectedNode)
  }

  // Delete a node
  const deleteNode = () => {
    if (!selectedNode) return
    setNodes(nodes.filter((node) => node.id !== selectedNode))
    setEdges(edges.filter((edge) => edge.from !== selectedNode && edge.to !== selectedNode))
    setSelectedNode(null)
  }

  // Reset function
  const reset = () => {
    setNodes([])
    setEdges([])
    setSelectedNode(null)
    setSelectedEdge(null)
    setConnectingFrom(null)
    setStartNode(null)
    setEndNode(null)
    setIsRunning(false)
    setCurrentStep(0)
    setAlgorithmSteps([])
    setOptimalPath([])
    setAllOptimalPaths([])
    setOptimalDistance(null)
    setHasNegativeCycle(false)
    setAlgorithmCompleted(false)
    setMode("add")
    setEdgeWeight("1")
    setShowEditDialog(false)
    setEditingEdge(null)
    setNewWeight("")

    // Clear session from localStorage
    try {
      localStorage.removeItem(STORAGE_KEY)
      console.log("Session cleared from localStorage")
    } catch (error) {
      console.warn("Error clearing session:", error)
    }
  }

  // Check if the algorithm can be run
  const canRunAlgorithm = startNode && endNode && nodes.length > 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Visualisateur Algorithme de Bellman-Ford</h1>
          <p className="text-gray-600">
            Créez un graphe et visualisez l'exécution de l'algorithme de plus court chemin
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Panneau de contrôle */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Outils
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Mode:</label>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      variant={mode === "add" ? "default" : "outline"}
                      onClick={() => {
                        setMode("add")
                        setConnectingFrom(null)
                      }}
                      className="justify-start"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Ajouter nœud
                    </Button>
                    <Button
                      variant={mode === "connect" ? "default" : "outline"}
                      onClick={() => {
                        setMode("connect")
                        setConnectingFrom(null)
                      }}
                      className="justify-start"
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Connecter
                    </Button>
                    <Button
                      variant={mode === "select" ? "default" : "outline"}
                      onClick={() => {
                        setMode("select")
                        setConnectingFrom(null)
                      }}
                      className="justify-start"
                    >
                      Sélectionner
                    </Button>
                    <Button
                      variant={mode === "edit-edge" ? "default" : "outline"}
                      onClick={() => {
                        setMode("edit-edge")
                        setConnectingFrom(null)
                      }}
                      className="justify-start"
                    >
                      <Edit3 className="w-4 h-4 mr-2" />
                      Modifier arête
                    </Button>
                    <Button
                      variant={mode === "delete-edge" ? "destructive" : "outline"}
                      onClick={() => {
                        setMode("delete-edge")
                        setConnectingFrom(null)
                      }}
                      className="justify-start"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Supprimer arête
                    </Button>
                  </div>
                </div>

                {mode === "connect" && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Poids de l'arête:</label>
                    <Input
                      type="number"
                      value={edgeWeight}
                      onChange={(e) => setEdgeWeight(e.target.value)}
                      placeholder="Poids"
                    />
                    {connectingFrom && (
                      <p className="text-sm text-blue-600 mt-2 flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        Connecter depuis: <strong>{connectingFrom}</strong>
                      </p>
                    )}
                  </div>
                )}

                {selectedNode && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Nœud sélectionné: <strong>{selectedNode}</strong>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" onClick={setAsStart} className="bg-green-600 hover:bg-green-700">
                        🚀 Début
                      </Button>
                      <Button size="sm" onClick={setAsEnd} className="bg-red-600 hover:bg-red-700">
                        🎯 Fin
                      </Button>
                    </div>
                    <Button size="sm" variant="destructive" onClick={deleteNode} className="w-full">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Supprimer nœud
                    </Button>
                  </div>
                )}

                {selectedEdge && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Arête sélectionnée</p>
                    <div className="text-xs text-gray-600">
                      {edges.find((e) => e.id === selectedEdge)?.from} → {edges.find((e) => e.id === selectedEdge)?.to}
                      <br />
                      Poids: {edges.find((e) => e.id === selectedEdge)?.weight}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Mode d'optimisation MIN/MAX */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Principe d'optimisation:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={optimizationMode === "min" ? "default" : "outline"}
                      onClick={() => setOptimizationMode("min")}
                      className="justify-start text-xs"
                    >
                      📉 MINIMISATION
                    </Button>
                    <Button
                      variant={optimizationMode === "max" ? "default" : "outline"}
                      onClick={() => setOptimizationMode("max")}
                      className="justify-start text-xs"
                    >
                      📈 MAXIMISATION
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {optimizationMode === "min"
                      ? "Recherche du chemin le plus court"
                      : "Recherche du chemin le plus long"
                    }
                  </p>
                </div>

                <Separator />

                {/* Validation avant lancement */}
                {!canRunAlgorithm && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center gap-2 text-yellow-800 text-sm">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">Requis:</span>
                    </div>
                    <ul className="text-xs text-yellow-700 mt-1 space-y-1">
                      {!startNode && <li>• Définir un nœud de début</li>}
                      {!endNode && <li>• Définir un nœud de fin</li>}
                      {nodes.length === 0 && <li>• Ajouter des nœuds</li>}
                    </ul>
                  </div>
                )}

                <div className="space-y-2">
                  <Button
                    onClick={() => {
                      if (isRunning) {
                        setIsRunning(false)
                      } else {
                        runBellmanFord()
                        setIsRunning(true)
                      }
                    }}
                    disabled={!canRunAlgorithm}
                    className="w-full"
                  >
                    {isRunning ? (
                      <>
                        <Pause className="w-4 h-4 mr-2" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Démarrer
                      </>
                    )}
                  </Button>
                  <Button onClick={reset} variant="outline" className="w-full">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Réinitialiser
                  </Button>
                </div>

                <div className="flex gap-2">
                  {startNode && (
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      🚀 {startNode}
                    </Badge>
                  )}
                  {endNode && (
                    <Badge variant="secondary" className="bg-red-100 text-red-800">
                      🎯 {endNode}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Étapes de l'algorithme */}
            {algorithmSteps.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Étapes</CardTitle>
                  <CardDescription>
                    Étape {currentStep} / {algorithmSteps.length}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {algorithmSteps.slice(0, currentStep).map((step, index) => (
                      <div key={index} className="text-sm p-2 bg-gray-50 rounded">
                        <div className="font-medium">Étape {index + 1}</div>
                        <div className="text-gray-600">{step.description}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Canvas du graphe */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Graphe</CardTitle>
                <CardDescription>
                  {mode === "add" && "Cliquez pour ajouter un nœud"}
                  {mode === "connect" && "Cliquez sur deux nœuds pour les connecter"}
                  {mode === "select" && "Cliquez sur un nœud ou une arête pour le/la sélectionner"}
                  {mode === "edit-edge" && "Cliquez sur une arête pour modifier son poids"}
                  {mode === "delete-edge" && "Cliquez sur une arête pour la supprimer"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  onClick={handleCanvasClick}
                  onMouseMove={handleMouseMove}
                  className="border border-gray-300 rounded-lg cursor-pointer bg-white"
                />
              </CardContent>
            </Card>

            {/* Théorie mathématique de l'algorithme */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  🔬 Théorie de l'Algorithme de Bellman-Ford
                  <Badge variant="secondary" className={optimizationMode === "min" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"}>
                    {optimizationMode === "min" ? "MODE MIN" : "MODE MAX"}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Fondements mathématiques et étapes de l'algorithme
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Principe général */}
                <div className="p-4 bg-slate-50 rounded-lg border">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    📋 Principe Général
                  </h4>
                  <p className="text-sm text-gray-700">
                    {optimizationMode === "min"
                      ? "L'algorithme de Bellman-Ford trouve le plus court chemin d'un nœud source vers tous les autres nœuds dans un graphe orienté pondéré, même en présence d'arêtes de poids négatif."
                      : "Version modifiée pour trouver le plus long chemin d'un nœud source vers tous les autres nœuds, utile pour les problèmes de maximisation (profits, capacités)."
                    }
                  </p>
                </div>

                {/* Formule mathématique */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    🧮 Formule de Relaxation
                  </h4>
                  <div className="font-mono text-sm bg-white p-3 rounded border">
                    {optimizationMode === "min" ? (
                      <>
                        <div><strong>Si</strong> d[u] + w(u,v) &lt; d[v] <strong>alors</strong></div>
                        <div className="ml-4 text-blue-600">d[v] = d[u] + w(u,v)</div>
                        <div className="ml-4 text-blue-600">parent[v] = u</div>
                      </>
                    ) : (
                      <>
                        <div><strong>Si</strong> d[u] + w(u,v) &gt; d[v] <strong>alors</strong></div>
                        <div className="ml-4 text-purple-600">d[v] = d[u] + w(u,v)</div>
                        <div className="ml-4 text-purple-600">parent[v] = u</div>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    <strong>d[v]</strong>: distance du nœud source au nœud v<br/>
                    <strong>w(u,v)</strong>: poids de l'arête de u vers v<br/>
                    <strong>parent[v]</strong>: nœud précédent dans le chemin optimal
                  </p>
                </div>

                {/* Étapes de l'algorithme */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    ⚙️ Étapes de l'Algorithme
                  </h4>

                  <div className="space-y-2">
                    <div className="p-3 bg-green-50 rounded border border-green-200">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">1</span>
                        <strong className="text-sm">Initialisation</strong>
                      </div>
                      <div className="text-xs text-gray-700 ml-7">
                        {optimizationMode === "min"
                          ? "d[source] = 0, d[autres] = +∞"
                          : "d[source] = 0, d[autres] = -∞"
                        }
                      </div>
                    </div>

                    <div className="p-3 bg-orange-50 rounded border border-orange-200">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-orange-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">2</span>
                        <strong className="text-sm">Relaxation (V-1 fois)</strong>
                      </div>
                      <div className="text-xs text-gray-700 ml-7">
                        Pour chaque arête (u,v), appliquer la formule de relaxation
                      </div>
                    </div>

                    <div className="p-3 bg-red-50 rounded border border-red-200">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">3</span>
                        <strong className="text-sm">Détection de Cycles</strong>
                      </div>
                      <div className="text-xs text-gray-700 ml-7">
                        {optimizationMode === "min"
                          ? "Vérifier l'existence de cycles négatifs"
                          : "Vérifier l'existence de cycles positifs"
                        }
                      </div>
                    </div>
                  </div>
                </div>

                {/* Complexité */}
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    ⏱️ Complexité Temporelle
                  </h4>
                  <div className="font-mono text-sm">
                    <strong>O(V × E)</strong>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    <strong>V</strong>: nombre de nœuds, <strong>E</strong>: nombre d'arêtes
                  </p>
                </div>

                {/* Cas d'usage */}
                <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    🎯 Applications Pratiques
                  </h4>
                  <ul className="text-xs text-gray-700 space-y-1">
                    {optimizationMode === "min" ? (
                      <>
                        <li>• Navigation GPS (plus court chemin)</li>
                        <li>• Réseaux de communication (routage optimal)</li>
                        <li>• Gestion des coûts et budgets</li>
                        <li>• Détection d'arbitrage financier</li>
                      </>
                    ) : (
                      <>
                        <li>• Maximisation des profits</li>
                        <li>• Planification de projets (chemin critique)</li>
                        <li>• Optimisation de ressources</li>
                        <li>• Problèmes de flot maximal</li>
                      </>
                    )}
                  </ul>
                </div>

                {/* Avantages */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-emerald-50 rounded border border-emerald-200">
                    <h5 className="font-semibold text-xs mb-1 text-emerald-800">✅ Avantages</h5>
                    <ul className="text-xs text-gray-700 space-y-1">
                      <li>• Gère les poids négatifs</li>
                      <li>• Détecte les cycles</li>
                      <li>• Simple à implémenter</li>
                    </ul>
                  </div>
                  <div className="p-3 bg-rose-50 rounded border border-rose-200">
                    <h5 className="font-semibold text-xs mb-1 text-rose-800">⚠️ Limitations</h5>
                    <ul className="text-xs text-gray-700 space-y-1">
                      <li>• Plus lent que Dijkstra</li>
                      <li>• Complexité O(V×E)</li>
                      <li>• Problématique si cycles</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Dialog pour modifier le poids d'une arête */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le poids de l'arête</DialogTitle>
            <DialogDescription>
              Arête: {editingEdge?.from} → {editingEdge?.to}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="weight" className="text-right">
                Poids
              </Label>
              <Input
                id="weight"
                type="number"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                className="col-span-3"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Annuler
            </Button>
            <Button onClick={saveEdgeEdit}>Sauvegarder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
