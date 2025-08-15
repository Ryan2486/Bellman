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
  const [optimizationMode, setOptimizationMode] = useState<"min" | "max">("min") // New: min/max mode
  const [startNode, setStartNode] = useState<string | null>(null)
  const [endNode, setEndNode] = useState<string | null>(null)
  const [optimalPath, setOptimalPath] = useState<string[]>([])
  const [allOptimalPaths, setAllOptimalPaths] = useState<string[][]>([]) // New: track all shortest paths
  const [optimalDistance, setOptimalDistance] = useState<number | null>(null)
  const [hasNegativeCycle, setHasNegativeCycle] = useState(false)
  const [algorithmCompleted, setAlgorithmCompleted] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingEdge, setEditingEdge] = useState<Edge | null>(null)
  const [newWeight, setNewWeight] = useState<string>("")
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const CANVAS_WIDTH = 800
  const CANVAS_HEIGHT = 500
  const NODE_RADIUS = 25

  // Générer un ID unique pour les arêtes
  const generateEdgeId = (from: string, to: string) => `${from}-${to}`

  // Trouver l'arête la plus proche du curseur
  const findNearestEdge = (x: number, y: number): Edge | null => {
    let nearestEdge: Edge | null = null
    let minDistance = Number.POSITIVE_INFINITY

    edges.forEach((edge) => {
      const fromNode = nodes.find((n) => n.id === edge.from)
      const toNode = nodes.find((n) => n.id === edge.to)

      if (fromNode && toNode) {
        // Calculer la distance du point à la ligne
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

  // Dessiner le graphe
  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Effacer le canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Get all nodes that are part of optimal paths
    const nodesInOptimalPaths = new Set<string>()
    if (algorithmCompleted && allOptimalPaths.length > 0) {
      allOptimalPaths.forEach(path => {
        path.forEach(nodeId => nodesInOptimalPaths.add(nodeId))
      })
    }

    // Dessiner les arêtes
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

        // Styles selon l'état
        if (isInOptimalPath) {
          ctx.strokeStyle = "#10b981" // Vert émeraude pour les arêtes optimales
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

        // Flèche
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

        // Poids de l'arête avec style amélioré
        const midX = (fromNode.x + toNode.x) / 2
        const midY = (fromNode.y + toNode.y) / 2

        // Fond du poids
        if (isInOptimalPath) {
          ctx.fillStyle = "#dcfce7" // Fond vert clair
          ctx.strokeStyle = "#10b981" // Bordure verte
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

        // Texte du poids
        ctx.fillStyle = isInOptimalPath ? "#065f46" : "#374151" // Texte vert foncé si optimal
        ctx.font = isInOptimalPath ? "bold 14px Arial" : "bold 12px Arial"
        ctx.textAlign = "center"
        ctx.fillText(edge.weight.toString(), midX, midY + 4)
      }
    })

    // Dessiner les nœuds
    nodes.forEach((node) => {
      const isInOptimalPath = nodesInOptimalPaths.has(node.id)

      ctx.beginPath()
      ctx.arc(node.x, node.y, NODE_RADIUS, 0, 2 * Math.PI)

      // Couleur du nœud avec dégradé
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
        // Nœuds dans les chemins optimaux - couleur dorée/orange
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, NODE_RADIUS)
        gradient.addColorStop(0, "#fbbf24") // Jaune/or clair
        gradient.addColorStop(1, "#d97706") // Orange foncé
        ctx.fillStyle = gradient
      } else {
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, NODE_RADIUS)
        gradient.addColorStop(0, "#f3f4f6")
        gradient.addColorStop(1, "#e5e7eb")
        ctx.fillStyle = gradient
      }

      ctx.fill()

      // Bordure spéciale pour les nœuds optimaux
      if (isInOptimalPath && !node.isStart && !node.isEnd) {
        ctx.strokeStyle = "#92400e" // Bordure orange foncé
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

      // ID du nœud
      ctx.fillStyle = isInOptimalPath && !node.isStart && !node.isEnd ? "#92400e" : "#374151"
      ctx.font = isInOptimalPath ? "bold 18px Arial" : "bold 16px Arial"
      ctx.textAlign = "center"
      ctx.fillText(node.id, node.x, node.y - 2)

      // Distance
      if (node.distance !== Number.POSITIVE_INFINITY) {
        ctx.font = isInOptimalPath ? "bold 14px Arial" : "12px Arial"
        ctx.fillStyle = isInOptimalPath ? "#92400e" : "#6b7280"
        ctx.fillText(node.distance === Number.POSITIVE_INFINITY ? "∞" : node.distance.toString(), node.x, node.y + 14)
      }

      // Icônes pour début et fin
      if (node.isStart) {
        ctx.font = "16px Arial"
        ctx.fillText("🚀", node.x + NODE_RADIUS - 5, node.y - NODE_RADIUS + 10)
      }
      if (node.isEnd) {
        ctx.font = "16px Arial"
        ctx.fillText("🎯", node.x + NODE_RADIUS - 5, node.y - NODE_RADIUS + 10)
      }

      // Indicateur spécial pour les nœuds optimaux (étoile)
      if (isInOptimalPath && !node.isStart && !node.isEnd) {
        ctx.font = "12px Arial"
        ctx.fillText("⭐", node.x + NODE_RADIUS - 8, node.y - NODE_RADIUS + 12)
      }
    })

    // Ligne de connexion en cours
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

  // Gestion du mouvement de la souris
  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    setMousePos({ x, y })

    // Mettre en évidence les arêtes survolées
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

  // Gestion des clics sur le canvas
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    // Vérifier si on clique sur un nœud existant
    const clickedNode = nodes.find((node) => {
      const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2)
      return distance <= NODE_RADIUS
    })

    // Vérifier si on clique sur une arête
    const clickedEdge = findNearestEdge(x, y)

    if (mode === "add" && !clickedNode && !clickedEdge) {
      // Ajouter un nouveau nœud
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
        // Vérifier si la connexion existe déjà
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
      setNewWeight(clickedEdge.weight.toString())
      setShowEditDialog(true)
    } else if (mode === "select" && clickedEdge) {
      setSelectedEdge(clickedEdge.id)
      setSelectedNode(null)
    }
  }

  // Sauvegarder les modifications d'arête
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

    // Initialisation selon le mode (MIN/MAX)
    nodes.forEach((node) => {
      if (optimizationMode === "min") {
        nodeDistances[node.id] = node.id === startNode ? 0 : Number.POSITIVE_INFINITY
      } else {
        // Mode MAX: on commence avec -∞ et le nœud de départ à 0
        nodeDistances[node.id] = node.id === startNode ? 0 : Number.NEGATIVE_INFINITY
      }
      nodePredecessors[node.id] = []
    })

    // Relaxation des arêtes (V-1 fois)
    for (let i = 0; i < nodes.length - 1; i++) {
      let updated = false

      edges.forEach((edge) => {
        const fromDistance = nodeDistances[edge.from]
        const toDistance = nodeDistances[edge.to]
        const newDistance = fromDistance + edge.weight

        // Condition selon le mode d'optimisation
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

    // Vérification des cycles selon le mode
    let hasCycle = false
    if (optimizationMode === "min") {
      // Détection de cycles négatifs (mode MIN)
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
      // Détection de cycles positifs (mode MAX)
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

  // Animation de l'algorithme (même code qu'avant)
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
            isActive: step.previous && edge.from === step.previous && edge.to === step.updatedNode,
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

  // Redessiner le graphe quand les données changent
  useEffect(() => {
    drawGraph()
  }, [drawGraph])

  // Définir le nœud de départ
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

  // Définir le nœud de fin
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

  // Supprimer un nœud
  const deleteNode = () => {
    if (!selectedNode) return
    setNodes(nodes.filter((node) => node.id !== selectedNode))
    setEdges(edges.filter((edge) => edge.from !== selectedNode && edge.to !== selectedNode))
    setSelectedNode(null)
  }

  // Réinitialiser
  const reset = () => {
    // Clear all nodes and edges
    setNodes([])
    setEdges([])

    // Reset all state variables
    setSelectedNode(null)
    setSelectedEdge(null)
    setConnectingFrom(null)
    setStartNode(null)
    setEndNode(null)
    setIsRunning(false)
    setCurrentStep(0)
    setAlgorithmSteps([])
    setOptimalPath([])
    setAllOptimalPaths([]) // Clear all optimal paths
    setOptimalDistance(null)
    setHasNegativeCycle(false)
    setAlgorithmCompleted(false)
    setMode("add")
    setEdgeWeight("1")

    // Close any open dialogs
    setShowEditDialog(false)
    setEditingEdge(null)
    setNewWeight("")
  }

  // Vérifier si on peut lancer l'algorithme
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
                        <div className="font-medium">Itération {step.iteration}</div>
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

            {/* Tableau des distances */}
            {nodes.length > 0 && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Distances depuis le nœud de départ</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4">
                    {nodes.map((node) => (
                      <div key={node.id} className="text-center p-2 border rounded">
                        <div className="font-bold">{node.id}</div>
                        <div className="text-sm text-gray-600">
                          {node.distance === Number.POSITIVE_INFINITY ? "∞" : node.distance}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Résultats de l'algorithme */}
            {algorithmCompleted && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Résultats</CardTitle>
                </CardHeader>
                <CardContent>
                  {hasNegativeCycle ? (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2 text-red-800 font-semibold mb-2">
                        <span className="text-xl">⚠️</span>
                        Cycle négatif détecté
                      </div>
                      <p className="text-red-700">
                        Le graphe contient un cycle de poids négatif. Il n'existe pas de plus court chemin défini.
                      </p>
                    </div>
                  ) : (
                    <div>
                      {allOptimalPaths.length > 0 && optimalDistance !== null ? (
                        <div className="space-y-4">
                          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-center gap-2 text-green-800 font-semibold mb-3">
                              <span className="text-xl">✅</span>
                              {allOptimalPaths.length === 1 ? "Chemin optimal trouvé" : `${allOptimalPaths.length} chemins optimaux trouvés`}
                            </div>
                            <div className="space-y-3">
                              <div>
                                <span className="font-medium">Distance totale : </span>
                                <span className="font-mono bg-white px-2 py-1 rounded border text-green-700 font-bold">
                                  {optimalDistance}
                                </span>
                              </div>

                              <div>
                                <span className="font-medium">
                                  {allOptimalPaths.length === 1 ? "Chemin :" : "Tous les chemins optimaux :"}
                                </span>
                                <div className="mt-2 space-y-2">
                                  {allOptimalPaths.map((path, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                      <span className="text-sm text-gray-500 min-w-[20px]">{index + 1}.</span>
                                      <span className="font-mono bg-white px-2 py-1 rounded border text-sm">
                                        {path.join(" → ")}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="text-sm text-green-700 mt-2">
                                {allOptimalPaths.length === 1
                                  ? "Le chemin optimal est mis en évidence en vert sur le graphe."
                                  : "Tous les chemins optimaux sont mis en évidence en vert sur le graphe."
                                }
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <div className="flex items-center gap-2 text-yellow-800 font-semibold mb-2">
                            <span className="text-xl">❌</span>
                            Aucun chemin trouvé
                          </div>
                          <p className="text-yellow-700">
                            Il n'existe pas de chemin du nœud <strong>{startNode}</strong> vers le nœud{" "}
                            <strong>{endNode}</strong>.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
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
