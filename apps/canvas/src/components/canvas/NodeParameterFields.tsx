import type { ModelCatalogItem } from '@bailian-studio/api-client'
import { isModelParameterVisible } from '@bailian-studio/model-core'
import { Checkbox, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@bailian-studio/ui'
import { cn, safeDomId } from '@bailian-studio/lib-client'
import type { ChangeEvent } from 'react'

type CanvasModelParameter = ModelCatalogItem['parameters'][number]
type CanvasSelectParameter = Omit<CanvasModelParameter, 'type'> & { type: 'select' }

interface NodeParameterFieldsProps {
  nodeId: string
  parameters: readonly CanvasModelParameter[]
  values: Readonly<Record<string, unknown>>
  excludedNames?: ReadonlySet<string>
  errors?: ReadonlyMap<string, string>
  onChange: (name: string, value: unknown) => void
}

/**
 * Canvas 节点的 manifest 参数编辑器。
 *
 * prompt、媒体引用和 Canvas 自己的比例语义由节点主体单独处理；这里仅编辑
 * manifest 声明的普通参数，并以参数的 type/options/visibleWhen 渲染控件。
 */
export function NodeParameterFields({
  nodeId,
  parameters,
  values,
  excludedNames,
  errors,
  onChange,
}: NodeParameterFieldsProps) {
  const effectiveValues = withDefaults(parameters, values)
  const fields = parameters.filter(parameter => (
    parameter.name !== 'prompt'
    && parameter.type !== 'media'
    && !excludedNames?.has(parameter.name)
    && isModelParameterVisible(parameter, effectiveValues)
  ))

  if (fields.length === 0) return null

  return (
    <details open className="border-t pt-2">
      <summary className="cursor-pointer list-none text-[10px] font-medium text-muted-foreground">
        模型参数
      </summary>
      <div className="mt-2 space-y-2">
        {fields.map(parameter => {
          const id = safeDomId(`${nodeId}-${parameter.name}`)
          const value = effectiveValues[parameter.name]
          const error = errors?.get(parameter.name)
          return (
            <div key={parameter.name} className="space-y-1">
              <Label htmlFor={id} className="text-[10px]">
                {parameter.label}
                {parameter.required ? <span className="text-destructive">*</span> : null}
              </Label>
              <NodeParameterControl
                id={id}
                parameter={parameter}
                value={value}
                error={error}
                onChange={nextValue => onChange(parameter.name, nextValue)}
              />
              {error !== undefined || parameter.description !== undefined ? (
                <p id={error === undefined ? undefined : `${id}-error`} className={cn('text-[10px] leading-4', error === undefined ? 'text-muted-foreground' : 'text-destructive')}>
                  {error ?? parameter.description}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
    </details>
  )
}

function NodeParameterControl({
  id,
  parameter,
  value,
  error,
  onChange,
}: {
  id: string
  parameter: CanvasModelParameter
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}) {
  if (parameter.type === 'text') {
    const isLongText = parameter.name === 'negativePrompt' || (parameter.maxLength ?? 0) > 200
    const props = {
      id,
      value: asString(value),
      maxLength: parameter.maxLength,
      'aria-invalid': error !== undefined,
      'aria-describedby': error === undefined ? undefined : `${id}-error`,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        onChange(event.target.value === '' ? undefined : event.target.value)
      },
    }
    return isLongText
      ? <Textarea {...props} className={cn('min-h-14 text-xs', error !== undefined && 'border-destructive')} />
      : <Input {...props} className={cn('h-7 text-xs', error !== undefined && 'border-destructive')} />
  }

  if (parameter.type === 'number') {
    return (
      <Input
        id={id}
        type="number"
        min={parameter.min}
        max={parameter.max}
        step={parameter.step ?? 1}
        value={typeof value === 'number' ? String(value) : ''}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        className={cn('h-7 text-xs', error !== undefined && 'border-destructive')}
        onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
      />
    )
  }

  if (parameter.type === 'select') {
    return <NodeSelectField id={id} parameter={parameter as CanvasSelectParameter} value={value} error={error} onChange={onChange} />
  }

  if (parameter.type === 'boolean') {
    return (
      <div className="flex h-7 items-center rounded-md border px-2">
        <Checkbox
          id={id}
          checked={value === true}
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : `${id}-error`}
          onCheckedChange={checked => onChange(checked === true)}
        />
      </div>
    )
  }

  return null
}

function NodeSelectField({
  id,
  parameter,
  value,
  error,
  onChange,
}: {
  id: string
  parameter: CanvasSelectParameter
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}) {
  const options = parameter.options ?? []
  const selectedIndex = options.findIndex(option => valuesEqual(option.value, value))
  const token = selectedIndex >= 0 ? `canvas-option-${selectedIndex}` : undefined

  return (
    <Select
      value={token}
      onValueChange={next => {
        const index = Number(next.replace('canvas-option-', ''))
        const option = options[index]
        onChange(option === undefined ? undefined : option.value)
      }}
    >
      <SelectTrigger id={id} size="sm" aria-invalid={error !== undefined} aria-describedby={error === undefined ? undefined : `${id}-error`} className={cn('h-7 w-full text-xs', error !== undefined && 'border-destructive')}>
        <SelectValue placeholder="请选择" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option, index) => (
          <SelectItem key={index} value={`canvas-option-${index}`}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function withDefaults(
  parameters: readonly CanvasModelParameter[],
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const result = { ...values }
  for (const parameter of parameters) {
    if (result[parameter.name] === undefined && parameter.defaultValue !== undefined) {
      result[parameter.name] = parameter.defaultValue
    }
  }
  return result
}

function asString(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}
