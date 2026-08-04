import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

/** 全局兜底错误边界：渲染错误时不白屏，提供重试。 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) }
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: '' })
  }

  override render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">页面渲染出现异常</p>
        {this.state.message !== '' && (
          <p className="max-w-md text-xs text-muted-foreground/70">{this.state.message}</p>
        )}
        <Button variant="outline" size="sm" onClick={this.handleReset}>
          <RotateCcw data-icon />
          重试
        </Button>
      </div>
    )
  }
}
