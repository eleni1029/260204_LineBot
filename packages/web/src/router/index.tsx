import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { Layout } from '@/components/Layout'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { CustomerList } from '@/pages/Customers/List'
import { CustomerDetail } from '@/pages/Customers/Detail'
import { GroupList } from '@/pages/Groups/List'
import { GroupDetail } from '@/pages/Groups/Detail'
import { MemberList } from '@/pages/Members/List'
import { MemberDetail } from '@/pages/Members/Detail'
import { MessageList } from '@/pages/Messages/List'
import { IssueList } from '@/pages/Issues/List'
import { IssueDetail } from '@/pages/Issues/Detail'
import { UserList } from '@/pages/Users/List'
import { RoleList } from '@/pages/Roles/List'
import { Settings } from '@/pages/Settings'
import { LogList } from '@/pages/Logs/List'
import { KnowledgeList } from '@/pages/Knowledge/List'

interface ProtectedRouteProps {
  children: React.ReactNode
  permission?: string
}

function ProtectedRoute({ children, permission }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (permission && !user?.role.permissions.includes(permission)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="groups" element={<GroupList />} />
        <Route path="groups/:id" element={<GroupDetail />} />
        <Route path="members" element={<MemberList />} />
        <Route path="members/:id" element={<MemberDetail />} />
        <Route path="messages" element={<MessageList />} />
        <Route path="issues" element={<IssueList />} />
        <Route path="issues/:id" element={<IssueDetail />} />
        <Route path="users" element={<UserList />} />
        <Route path="roles" element={<RoleList />} />
        <Route path="settings" element={<Settings />} />
        <Route path="logs" element={<LogList />} />
        <Route path="knowledge" element={<KnowledgeList />} />
      </Route>
    </Routes>
  )
}
