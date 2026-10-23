import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "./api"
import type { CommitmentItem, Dashboard, Goal, ImportRecord, MonthView, NotificationItem, SessionItem, User } from "./types"

export const keys = {
  me: ["me"] as const,
  dashboard: ["dashboard"] as const,
  month: (month: string) => ["month", month] as const,
  transactions: (params: string) => ["transactions", params] as const,
  commitments: ["commitments"] as const,
  goals: ["goals"] as const,
  budgets: ["budgets"] as const,
  rules: ["rules"] as const,
  notifications: ["notifications"] as const,
  imports: ["imports"] as const,
  sessions: ["sessions"] as const,
  ai: ["ai"] as const,
}

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>("/auth/me")).user
      } catch {
        return null
      }
    },
    staleTime: 60_000,
  })
}

export function useDashboard() {
  return useQuery({ queryKey: keys.dashboard, queryFn: () => api.get<Dashboard>("/dashboard") })
}

export function useMonth(month: string | null) {
  return useQuery({
    queryKey: keys.month(month ?? "current"),
    queryFn: () => api.get<MonthView>(month ? `/month?month=${month}` : "/month"),
    placeholderData: (previous) => previous,
  })
}

export function useCommitments() {
  return useQuery({
    queryKey: keys.commitments,
    queryFn: async () => (await api.get<{ commitments: CommitmentItem[] }>("/commitments")).commitments,
  })
}

export function useGoals() {
  return useQuery({ queryKey: keys.goals, queryFn: async () => (await api.get<{ goals: Goal[] }>("/goals")).goals })
}

export function useNotifications() {
  return useQuery({
    queryKey: keys.notifications,
    queryFn: () => api.get<{ unread: number; notifications: NotificationItem[] }>("/notifications"),
    refetchInterval: 60_000,
  })
}

export function useRefreshAll() {
  const client = useQueryClient()
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.dashboard }),
      client.invalidateQueries({ queryKey: ["month"] }),
      client.invalidateQueries({ queryKey: ["transactions"] }),
      client.invalidateQueries({ queryKey: keys.notifications }),
      client.invalidateQueries({ queryKey: keys.goals }),
      client.invalidateQueries({ queryKey: keys.commitments }),
      client.invalidateQueries({ queryKey: keys.me }),
      client.invalidateQueries({ queryKey: keys.imports }),
    ])
}

export function useProfileUpdate() {
  const client = useQueryClient()
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch<{ user: User }>("/profile", patch),
    onSuccess: (data) => {
      client.setQueryData(keys.me, data.user)
      refresh()
    },
  })
}

export function useImports() {
  return useQuery({ queryKey: keys.imports, queryFn: async () => (await api.get<{ imports: ImportRecord[] }>("/imports")).imports })
}

export function useSessions() {
  return useQuery({ queryKey: keys.sessions, queryFn: async () => (await api.get<{ sessions: SessionItem[] }>("/auth/sessions")).sessions })
}

export function useAiStatus() {
  return useQuery({
    queryKey: keys.ai,
    queryFn: () => api.get<{ available: boolean; enabled: boolean; model: string | null }>("/ai/status"),
    staleTime: 60_000,
  })
}
