import type { AssetItem } from '@bailian-studio/api-client'
import { Input } from '@bailian-studio/ui'
import { Label } from '@bailian-studio/ui'
import { Textarea } from '@bailian-studio/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bailian-studio/ui'
import { Switch } from '@/components/ui/switch'
import { MediaParameterInput } from '@/components/create/MediaParameterInput'
import type { FormField } from '@/lib/parameter-form-schema'
import type { FieldIssue } from '@/lib/parameter-validation'
import { safeDomId, cn } from '@/lib/utils'

/**
 * Manifest 驱动的动态参数表单。
 *
 * 继承 React 版关键技巧：Radix Select 的 value 必须是 string，这里用「索引
 * token」（`model-option-<i>`）无损承载非 string 枚举值（数组/空字符串/数字）。
 */

export interface ParameterFormProps {
  fields: readonly FormField[]
  values: Record<string, unknown>
  onChange: (name: string, value: unknown) => void
  errors?: ReadonlyMap<string, FieldIssue>
  layout?: 'stack' | 'grid'
}

export function ParameterForm({
  fields,
  values,
  onChange,
  errors,
  layout = 'stack',
}: ParameterFormProps) {
  return (
    <div className={cn('gap-4', layout === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2' : 'space-y-4')}>
      {fields.map(field => (
        <div
          key={field.parameter.name}
          className={cn('space-y-1.5', layout === 'grid' && field.wide && 'sm:col-span-2')}
        >
          <Label htmlFor={safeDomId(field.parameter.name)} className="flex items-center gap-1">
            {field.parameter.label}
            {field.parameter.required && <span className="text-destructive">*</span>}
          </Label>
          <ParameterControl
            field={field}
            value={values[field.parameter.name]}
            error={errors?.get(field.parameter.name)?.message}
            onChange={value => onChange(field.parameter.name, value)}
          />
          {(field.parameter.description !== undefined || errors?.get(field.parameter.name) !== undefined) && (
            <p className={cn('text-xs', errors?.get(field.parameter.name) !== undefined ? 'text-destructive' : 'text-muted-foreground')}>
              {errors?.get(field.parameter.name)?.message ?? field.parameter.description}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function ParameterControl({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}) {
  const id = safeDomId(field.parameter.name)
  const ariaInvalid = error !== undefined

  switch (field.control) {
    case 'textarea':
      return (
        <Textarea
          id={id}
          value={asString(value)}
          maxLength={field.parameter.maxLength}
          aria-invalid={ariaInvalid}
          aria-describedby={error !== undefined ? `${id}-error` : undefined}
          onChange={event => onChange(event.target.value === '' ? undefined : event.target.value)}
        />
      )
    case 'text':
      return (
        <Input
          id={id}
          type="text"
          value={asString(value)}
          maxLength={field.parameter.maxLength}
          aria-invalid={ariaInvalid}
          onChange={event => onChange(event.target.value === '' ? undefined : event.target.value)}
        />
      )
    case 'number':
      return (
        <Input
          id={id}
          type="number"
          min={field.parameter.min}
          max={field.parameter.max}
          step={field.parameter.step ?? 1}
          value={asNumberInput(value)}
          aria-invalid={ariaInvalid}
          onChange={event => {
            const raw = event.target.value
            onChange(raw === '' ? undefined : Number(raw))
          }}
        />
      )
    case 'select':
      return <SelectField field={field} value={value} ariaInvalid={ariaInvalid} onChange={onChange} />
    case 'boolean':
      return (
        <div>
          <Switch
            id={id}
            checked={value === true}
            onCheckedChange={checked => onChange(checked)}
            aria-invalid={ariaInvalid}
          />
        </div>
      )
    case 'media':
      return (
        <MediaParameterInput
          kind={field.parameter.mediaKind}
          value={value as AssetItem[] | undefined}
          onChange={onChange}
          multiple={(field.parameter.maxItems ?? 1) > 1}
        />
      )
  }
}

/** Radix Select 索引 token：`model-option-<i>` ↔ options[i].value。 */
function SelectField({
  field,
  value,
  ariaInvalid,
  onChange,
}: {
  field: FormField
  value: unknown
  ariaInvalid: boolean
  onChange: (value: unknown) => void
}) {
  const options = field.parameter.options ?? []
  const selectedIndex = options.findIndex(option => JSON.stringify(option.value) === JSON.stringify(value))
  const token = selectedIndex >= 0 ? `model-option-${selectedIndex}` : undefined

  return (
    <Select
      value={token}
      onValueChange={next => {
        const index = Number(next.replace('model-option-', ''))
        const option = options[index]
        onChange(option === undefined ? undefined : option.value)
      }}
    >
      <SelectTrigger id={safeDomId(field.parameter.name)} aria-invalid={ariaInvalid}>
        <SelectValue placeholder="请选择" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option, index) => (
          <SelectItem key={index} value={`model-option-${index}`}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)
}

function asNumberInput(value: unknown): string {
  return typeof value === 'number' ? String(value) : ''
}
