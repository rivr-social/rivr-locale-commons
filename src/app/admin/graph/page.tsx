/**
 * Locale admin graph trace page for `/admin/graph`.
 *
 * Provides a visual exploration of the locale's entity graph,
 * showing agents, resources, and their relationships.
 *
 * The global version uses file-system inspection for flow tracing.
 * This locale version provides a lighter graph visualization
 * using the existing AgentGraph component.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { GraphTraceClient } from "./graph-trace-client"

export default async function AdminGraphPage() {
  return (
    <div className="container max-w-6xl mx-auto p-4 pb-20">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Graph Trace</h1>
        <p className="text-gray-600">Explore the entity graph for this locale instance</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Entity Graph</CardTitle>
          </CardHeader>
          <CardContent>
            <GraphTraceClient />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
