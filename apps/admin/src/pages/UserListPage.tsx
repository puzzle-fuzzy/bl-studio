import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, Search, UserPlus } from 'lucide-react'
import type { AdminUser } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { useAdminAuthStore } from '@/stores/admin-auth-store'
import { UserAvatar } from '@/components/layout/user-avatar'
import { Button } from '@bailian-studio/ui'
import { Input } from '@bailian-studio/ui'
import { Label } from '@bailian-studio/ui'
import { Badge } from '@bailian-studio/ui'
import { Card, CardContent } from '@bailian-studio/ui'
import { Skeleton } from '@bailian-studio/ui'
import { Checkbox } from '@bailian-studio/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@bailian-studio/ui'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@bailian-studio/ui'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@bailian-studio/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bailian-studio/ui'

const PAGE_SIZE = 20

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

export function UserListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState(q)
  // 批量/单行操作的服务端反馈（成功计数、部分失败等）；与查询错误分离。
  const [notice, setNotice] = useState<string | null>(null)

  const currentAdminId = useAdminAuthStore(state => state.user?.id)

  // 多选：当前页可勾选用户集合 + 选中状态。
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchBusy, setBatchBusy] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', password: '', displayName: '', role: 'user' as 'user' | 'admin' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [deleting, setDeleting] = useState<AdminUser | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)

  const [grantOpen, setGrantOpen] = useState(false)
  const [grantForm, setGrantForm] = useState({ amountCents: '', reason: '' })
  const [grantBusy, setGrantBusy] = useState(false)
  const [grantError, setGrantError] = useState<string | null>(null)

  // Batch 0c：useQuery 的缓存键含 (q, page)，翻页/切词自动重取；keepPreviousData
  // 让翻页时旧列表不闪空。旧的 requestSeq 手写守卫（P1-08）由此作废。
  const queryClient = useQueryClient()
  const { data, isPending, error: queryError } = useQuery({
    queryKey: ['admin', 'users', q, page],
    queryFn: () => apiClient.listAdminUsers({ q: q || undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const loading = isPending && data === undefined
  const error = notice ?? (queryError !== null ? userErrorMessage(queryError) : null)

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })

  // q 变化（搜索/清空）时回到第一页；换页/换词清空勾选。
  useEffect(() => {
    setPage(1)
  }, [q])
  useEffect(() => {
    setSelected(new Set())
  }, [q, page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // 当前页可选中的行（剔除当前 admin 自身 —— 服务器也禁止批量处理自己）。
  const selectableRows = items.filter(user => user.id !== currentAdminId)
  const allSelected = selectableRows.length > 0 && selectableRows.every(user => selected.has(user.id))
  const someSelected = selectableRows.some(user => selected.has(user.id))
  const selectedCount = selected.size

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const next = new URLSearchParams(searchParams)
    if (searchInput.trim().length > 0) next.set('q', searchInput.trim())
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }

  const toggleSelect = (id: string) => {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected(current => {
      const next = new Set(current)
      if (allSelected) {
        for (const user of selectableRows) next.delete(user.id)
      } else {
        for (const user of selectableRows) next.add(user.id)
      }
      return next
    })
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
      setPage(1)
      void invalidateUsers()
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
      void invalidateUsers()
    } catch (err) {
      setNotice(userErrorMessage(err))
      setDeleting(null)
    } finally {
      setDeletingBusy(false)
    }
  }

  const runBatch = async (op: () => Promise<unknown>, okMessage: string) => {
    if (selectedCount === 0) return
    setBatchBusy(true)
    setNotice(null)
    try {
      const result = await op()
      const affected = typeof result === 'object' && result !== null && 'affected' in result
        ? String((result as { affected: number }).affected)
        : String(selectedCount)
      setNotice(`${okMessage}：${affected} 位用户`)
      void invalidateUsers()
    } catch (err) {
      setNotice(userErrorMessage(err))
    } finally {
      setBatchBusy(false)
    }
  }

  const handleBatchBan = () => {
    void runBatch(
      () => apiClient.adminBatchBanUsers({ userIds: [...selected] }),
      '已封禁',
    )
  }

  const handleBatchUnban = () => {
    void runBatch(
      () => apiClient.adminBatchUnbanUsers({ userIds: [...selected] }),
      '已解封',
    )
  }

  const handleBatchDelete = () => {
    setBatchDeleteOpen(false)
    void runBatch(
      () => apiClient.adminBatchDeleteUsers({ userIds: [...selected] }),
      '已删除',
    )
  }

  const handleBatchGrant = async () => {
    const amountCents = Number(grantForm.amountCents)
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      setGrantError('请输入有效的积分数量（正整数）')
      return
    }
    if (grantForm.reason.trim().length === 0) {
      setGrantError('请填写赠送原因')
      return
    }
    setGrantBusy(true)
    setGrantError(null)
    try {
      // P1-19：以服务端实际成功数反馈，不再把请求数当成功数（单用户失败不整批回滚）。
      const result = await apiClient.adminBatchGrantPoints({
        userIds: [...selected],
        amountCents,
        reason: grantForm.reason.trim(),
        idempotencyKey: crypto.randomUUID(),
      })
      setGrantOpen(false)
      setGrantForm({ amountCents: '', reason: '' })
      setNotice(
        result.failed.length === 0
          ? `已赠送 ${result.granted} 位用户各 ${amountCents} 积分`
          : `已赠送 ${result.granted} 位用户，${result.failed.length} 位失败`,
      )
      void invalidateUsers()
    } catch (err) {
      setGrantError(userErrorMessage(err))
    } finally {
      setGrantBusy(false)
    }
  }

  const handleRowBan = async (user: AdminUser) => {
    setBatchBusy(true)
    try {
      await apiClient.adminBanUser(user.id)
      void invalidateUsers()
    } catch (err) {
      setNotice(userErrorMessage(err))
    } finally {
      setBatchBusy(false)
    }
  }

  const handleRowUnban = async (user: AdminUser) => {
    setBatchBusy(true)
    try {
      await apiClient.adminUnbanUser(user.id)
      void invalidateUsers()
    } catch (err) {
      setNotice(userErrorMessage(err))
    } finally {
      setBatchBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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

      {error !== null && <p className="text-sm text-muted-foreground">{error}</p>}

      {/* 批量操作工具栏：选中行后出现。 */}
      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm">已选 {selectedCount} 位用户</span>
          <Button size="sm" variant="destructive" disabled={batchBusy} onClick={handleBatchBan}>
            {batchBusy ? <Loader2 className="size-4 animate-spin" /> : '批量封禁'}
          </Button>
          <Button size="sm" variant="outline" disabled={batchBusy} onClick={handleBatchUnban}>
            批量解封
          </Button>
          <Button size="sm" variant="outline" disabled={batchBusy} onClick={() => setGrantOpen(true)}>
            赠送积分
          </Button>
          <Button size="sm" variant="destructive" disabled={batchBusy} onClick={() => setBatchDeleteOpen(true)}>
            批量删除
          </Button>
        </div>
      )}

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
                  <TableHead className="w-12">
                    <Checkbox
                      aria-label="全选当前页"
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleSelectAll}
                      disabled={selectableRows.length === 0}
                    />
                  </TableHead>
                  <TableHead className="w-14 text-muted-foreground">序号</TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead>昵称</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>注册时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((user, index) => {
                  const isSelf = user.id === currentAdminId
                  const banned = user.bannedAt !== null
                  return (
                    <TableRow key={user.id} className={banned ? 'bg-destructive/5' : undefined}>
                      <TableCell>
                        <Checkbox
                          aria-label={`选择 ${user.email}`}
                          checked={selected.has(user.id)}
                          onCheckedChange={() => toggleSelect(user.id)}
                          disabled={isSelf}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{(page - 1) * PAGE_SIZE + index + 1}</TableCell>
                      <TableCell>
                        <Link to={`/users/${user.id}`} className="font-medium hover:underline">
                          {user.email}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserAvatar userId={user.id} name={user.displayName} size="sm" className="shrink-0" />
                          <span className="min-w-0 truncate">{user.displayName ?? '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {banned
                          ? <Badge variant="destructive">已封禁</Badge>
                          : <Badge variant="outline">正常</Badge>}
                      </TableCell>
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
                        {!isSelf && (
                          banned
                            ? <Button variant="ghost" size="sm" disabled={batchBusy} onClick={() => void handleRowUnban(user)}>解封</Button>
                            : <Button variant="ghost" size="sm" className="text-destructive" disabled={batchBusy} onClick={() => void handleRowBan(user)}>封禁</Button>
                        )}
                        {!isSelf && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(user)}>
                            删除
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <PaginationBar page={page} totalPages={totalPages} loading={loading} onPageChange={setPage} />
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

      {/* 批量赠送积分 */}
      <Dialog open={grantOpen} onOpenChange={open => { if (!open) setGrantOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>批量赠送积分</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              将给选中的 {selectedCount} 位用户各赠送等额积分（1 元 = 100 积分），写入积分账本可审计。
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="grant-amount">积分数量（正整数）</Label>
              <Input id="grant-amount" type="number" min={1} value={grantForm.amountCents} onChange={event => setGrantForm({ ...grantForm, amountCents: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-reason">原因</Label>
              <Input id="grant-reason" value={grantForm.reason} onChange={event => setGrantForm({ ...grantForm, reason: event.target.value })} placeholder="如：内测奖励" />
            </div>
            {grantError !== null && <p className="text-sm text-destructive">{grantError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantOpen(false)}>取消</Button>
            <Button onClick={() => void handleBatchGrant()} disabled={grantBusy}>
              {grantBusy ? <Loader2 className="size-4 animate-spin" /> : '确认赠送'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 单行删除确认 */}
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

      {/* 批量删除确认 */}
      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>批量删除用户</AlertDialogTitle>
            <AlertDialogDescription>
              将软删除选中的 {selectedCount} 位用户，其会话立即失效，历史数据保留可查。当前登录的管理员不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={event => { event.preventDefault(); handleBatchDelete() }}
              disabled={batchBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {batchBusy ? <Loader2 className="size-4 animate-spin" /> : '确认删除'}
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
