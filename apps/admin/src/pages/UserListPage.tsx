import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight, Loader2, Search, UserPlus } from 'lucide-react'
import type { AdminUser } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const PAGE_SIZE = 20

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

export function UserListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const [items, setItems] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState(q)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', password: '', displayName: '', role: 'user' as 'user' | 'admin' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [deleting, setDeleting] = useState<AdminUser | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const load = useCallback(async (pageNo: number) => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiClient.listAdminUsers({ q: q || undefined, page: pageNo, pageSize: PAGE_SIZE })
      setItems(result.items)
      setTotal(result.total ?? 0)
      setPage(pageNo)
    } catch (err) {
      setError(userErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [q])

  // q 变化（搜索/清空）时回到第一页。
  useEffect(() => {
    void load(1)
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const next = new URLSearchParams(searchParams)
    if (searchInput.trim().length > 0) next.set('q', searchInput.trim())
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }

  const handleCreate = async () => {
    setCreating(true)
    setCreateError(null)
    try {
      await apiClient.adminCreateUser({
        email: createForm.email,
        password: createForm.password,
        ...(createForm.displayName.length > 0 ? { displayName: createForm.displayName } : {}),
        ...(createForm.role !== 'user' ? { role: createForm.role } : {}),
      })
      setCreateOpen(false)
      setCreateForm({ email: '', password: '', displayName: '', role: 'user' })
      void load(1)
    } catch (err) {
      setCreateError(userErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (deleting === null) return
    setDeletingBusy(true)
    try {
      await apiClient.adminDeleteUser(deleting.id)
      setDeleting(null)
      void load(page)
    } catch (err) {
      setError(userErrorMessage(err))
      setDeleting(null)
    } finally {
      setDeletingBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">用户管理</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <UserPlus data-icon />
          创建账户
        </Button>
      </div>

      <form onSubmit={handleSearch} className="flex max-w-sm items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
            placeholder="搜索邮箱或昵称…"
            className="pl-8"
          />
        </div>
        <Button type="submit" variant="outline">搜索</Button>
      </form>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">没有找到用户</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 text-muted-foreground">序号</TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead>昵称</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>注册时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((user, index) => (
                  <TableRow key={user.id}>
                    <TableCell className="text-muted-foreground">{(page - 1) * PAGE_SIZE + index + 1}</TableCell>
                    <TableCell>
                      <Link to={`/users/${user.id}`} className="font-medium hover:underline">
                        {user.email}
                      </Link>
                    </TableCell>
                    <TableCell>{user.displayName ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role === 'admin' ? '管理员' : '用户'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/users/${user.id}`}>详情</Link>
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(user)}>
                        删除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <PaginationBar page={page} totalPages={totalPages} loading={loading} onPageChange={pageNo => void load(pageNo)} />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建账户</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="create-email">邮箱</Label>
              <Input id="create-email" type="email" value={createForm.email} onChange={event => setCreateForm({ ...createForm, email: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-password">初始密码</Label>
              <Input id="create-password" type="text" minLength={8} value={createForm.password} onChange={event => setCreateForm({ ...createForm, password: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-display">昵称（可选）</Label>
              <Input id="create-display" value={createForm.displayName} onChange={event => setCreateForm({ ...createForm, displayName: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>角色</Label>
              <Select value={createForm.role} onValueChange={(role: 'user' | 'admin') => setCreateForm({ ...createForm, role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">用户</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createError !== null && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={open => { if (!open) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除用户</AlertDialogTitle>
            <AlertDialogDescription>
              将软删除「{deleting?.email}」。该用户的会话会立即失效，历史生成记录与资产保留（可查看）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={event => { event.preventDefault(); void handleDelete() }}
              disabled={deletingBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingBusy ? <Loader2 className="size-4 animate-spin" /> : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** 页码分页条：上一页 / 页码窗口 / 下一页。 */
function PaginationBar({
  page,
  totalPages,
  loading,
  onPageChange,
}: {
  page: number
  totalPages: number
  loading: boolean
  onPageChange: (page: number) => void
}) {
  const pages = pageWindow(page, totalPages)
  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1 || loading}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft data-icon />
        上一页
      </Button>
      {pages.map(p => (
        <Button
          key={p}
          variant={p === page ? 'default' : 'outline'}
          size="sm"
          disabled={loading}
          onClick={() => onPageChange(p)}
        >
          {p}
        </Button>
      ))}
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages || loading}
        onClick={() => onPageChange(page + 1)}
      >
        下一页
        <ChevronRight data-icon />
      </Button>
    </div>
  )
}

/** 页码窗口：当前页居中，至多 5 个页码。 */
function pageWindow(page: number, totalPages: number): number[] {
  const width = 5
  let start = Math.max(1, page - Math.floor(width / 2))
  const end = Math.min(totalPages, start + width - 1)
  start = Math.max(1, end - width + 1)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}
